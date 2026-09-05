import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../../db.js';
import { actorFromRequest, actorLabel } from '../../shared/actor.js';
import { appendEvent } from '../audit/index.js';
import { requireDepartment } from '../auth/index.js';
import { HttpError } from '../../shared/httpError.js';
import { closeRelation, confirmRelation, createParty, createRelation, findActiveRelation, findPartyByName, getPartyById, updatePartyFields } from './repository.js';
import { BASIS_OPTIONS, basisCodeForLabel } from './types.js';

export const registryRouter = Router();

registryRouter.get('/registry-meta', (_req, res) => {
  res.json({ basisOptions: BASIS_OPTIONS });
});

interface PartyListRow {
  id: string;
  legal_name: string;
  kind: 'person' | 'entity';
  basis_label: string;
  effective_from: string;
  confirmed_at: string | null;
  rpt_count: string;
}

const LIST_QUERY = `
  select p.id, p.legal_name, p.kind,
         pr.basis_label, pr.effective_from, pr.confirmed_at,
         (select count(*) from intake.rpt_case c where c.counterparty_party_id = p.id)::text as rpt_count
  from registry.party p
  join lateral (
    select * from registry.party_relation
    where from_party = p.id and effective_to is null
    order by effective_from desc limit 1
  ) pr on true
`;

function toPartyRow(r: PartyListRow) {
  return {
    id: r.id,
    name: r.legal_name,
    type: r.kind === 'person' ? 'Person' : ('Entity' as const),
    basis: r.basis_label,
    effectiveFrom: r.effective_from,
    status: r.confirmed_at ? ('Confirmed' as const) : ('Unconfirmed' as const),
    rptCount: Number(r.rpt_count),
  };
}

registryRouter.get('/parties', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const result = await pool.query<PartyListRow>(
      `${LIST_QUERY}
       where $1 = '' or (p.legal_name ilike '%' || $1 || '%' or pr.basis_label ilike '%' || $1 || '%' or p.kind ilike '%' || $1 || '%')
       order by p.legal_name asc`,
      [q]
    );
    const totalResult = await pool.query<{ count: string }>(`select count(*)::text as count from (${LIST_QUERY}) t`);
    res.json({
      totalParties: Number(totalResult.rows[0]!.count),
      parties: result.rows.map(toPartyRow),
    });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(['Person', 'Entity']),
  basisLabel: z.string().trim().min(1),
});

// Create: the secretariat entering a register row directly. Unlike Intake's
// proposals, a party added here is confirmed immediately — this *is* the
// register's own administrator, not a submitter's guess about it.
registryRouter.post('/parties', requireDepartment('secretariat'), async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const actor = actorFromRequest(req);
    const existing = await findPartyByName(pool, input.name);
    if (existing) throw new HttpError(409, `${input.name} is already in the register`);

    const row = await withTransaction(async (client) => {
      const party = await createParty(client, { kind: input.type === 'Person' ? 'person' : 'entity', legalName: input.name });
      const relation = await createRelation(client, {
        fromParty: party.id,
        basis: basisCodeForLabel(input.basisLabel),
        basisLabel: input.basisLabel,
        source: 'manual',
      });
      await client.query('update registry.party_relation set confirmed_by = $2, confirmed_at = now() where id = $1', [relation.id, actorLabel(actor)]);
      return { id: party.id, legal_name: party.legal_name, kind: party.kind, basis_label: relation.basis_label, effective_from: relation.effective_from, confirmed_at: new Date().toISOString(), rpt_count: '0' } satisfies PartyListRow;
    });
    res.status(201).json(toPartyRow(row));
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(422, err.issues.map((i) => i.message).join('; ')));
    next(err);
  }
});

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(['Person', 'Entity']).optional(),
  basisLabel: z.string().trim().min(1).optional(),
});

// Update: name/type are ordinary mutations on registry.party. A changed basis
// of relationship is effective-dated like everywhere else — the current edge
// is closed and a new, already-confirmed one takes its place, never edited
// in place.
registryRouter.patch('/parties/:id', requireDepartment('secretariat'), async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    const actor = actorFromRequest(req);
    const partyId = req.params.id!;

    await withTransaction(async (client) => {
      const existing = await getPartyById(client, partyId);
      if (!existing) throw new HttpError(404, 'Party not found');

      if (input.name !== undefined || input.type !== undefined) {
        await updatePartyFields(client, partyId, { legalName: input.name, kind: input.type === 'Person' ? 'person' : input.type === 'Entity' ? 'entity' : undefined });
      }

      if (input.basisLabel !== undefined) {
        const active = await findActiveRelation(client, partyId);
        if (!active || active.basis_label !== input.basisLabel) {
          if (active) await closeRelation(client, active.id);
          const relation = await createRelation(client, {
            fromParty: partyId,
            basis: basisCodeForLabel(input.basisLabel),
            basisLabel: input.basisLabel,
            source: 'manual',
          });
          await client.query('update registry.party_relation set confirmed_by = $2, confirmed_at = now() where id = $1', [relation.id, actorLabel(actor)]);
        }
      }
    });

    const result = await pool.query<PartyListRow>(`${LIST_QUERY} where p.id = $1`, [partyId]);
    if (!result.rows[0]) throw new HttpError(404, 'Party not found');
    res.json(toPartyRow(result.rows[0]));
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(422, err.issues.map((i) => i.message).join('; ')));
    next(err);
  }
});

// Confirm: an Intake-proposed relation sits "Unconfirmed" until the
// secretariat has actually checked it against a primary source (the
// director/substantial-shareholder register, a declaration, whatever it
// takes) — this is that check being recorded, not a rubber stamp. Confirming
// something already confirmed is a no-op rather than an error, so double
// clicks and re-syncs are harmless.
registryRouter.post('/parties/:id/confirm', requireDepartment('secretariat'), async (req, res, next) => {
  try {
    const partyId = req.params.id!;
    const actor = actorFromRequest(req);
    await withTransaction(async (client) => {
      const active = await findActiveRelation(client, partyId);
      if (!active) throw new HttpError(404, 'Party not found or has no active register entry');
      if (active.confirmed_at) return;
      await confirmRelation(client, active.id, actorLabel(actor));
      const party = await getPartyById(client, partyId);
      await appendEvent(client, {
        aggregateType: 'registry_party',
        aggregateId: partyId,
        type: 'PartyRelationConfirmed',
        actorId: actorLabel(actor),
        detail: `${party?.legal_name ?? partyId} (${active.basis_label}) confirmed in the register by ${actorLabel(actor)}.`,
        payload: { relationId: active.id },
      });
    });
    const result = await pool.query<PartyListRow>(`${LIST_QUERY} where p.id = $1`, [partyId]);
    if (!result.rows[0]) throw new HttpError(404, 'Party not found');
    res.json(toPartyRow(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

// Delete: registry.party_relation is append-only by design (ADR — a change
// closes a row, it never removes one), and cases keep a foreign key to the
// exact relation they were judged against, so a hard delete would either be
// rejected by the database or silently invalidate history. "Delete" here
// means what it safely can: retire the edge (close it as of now), which
// drops the party off the active register immediately without touching any
// row a past decision depends on.
registryRouter.delete('/parties/:id', requireDepartment('secretariat'), async (req, res, next) => {
  try {
    const partyId = req.params.id!;
    await withTransaction(async (client) => {
      const active = await findActiveRelation(client, partyId);
      if (!active) throw new HttpError(404, 'Party not found or already removed from the register');
      await closeRelation(client, active.id);
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
