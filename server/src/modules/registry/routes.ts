import { Router } from 'express';
import { pool } from '../../db.js';
import { BASIS_OPTIONS } from './types.js';

export const registryRouter = Router();

registryRouter.get('/registry-meta', (_req, res) => {
  res.json({ basisOptions: BASIS_OPTIONS });
});

interface PartyRow {
  id: string;
  legal_name: string;
  kind: 'person' | 'entity';
  basis_label: string | null;
  effective_from: string;
  confirmed_at: string | null;
  rpt_count: string;
}

registryRouter.get('/parties', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const result = await pool.query<PartyRow>(
      `select p.id, p.legal_name, p.kind,
              pr.basis_label, pr.effective_from, pr.confirmed_at,
              (select count(*) from intake.rpt_case c where c.counterparty_party_id = p.id)::text as rpt_count
       from registry.party p
       left join lateral (
         select * from registry.party_relation
         where from_party = p.id and effective_to is null
         order by effective_from desc limit 1
       ) pr on true
       where $1 = '' or (p.legal_name ilike '%' || $1 || '%' or pr.basis_label ilike '%' || $1 || '%' or p.kind ilike '%' || $1 || '%')
       order by p.legal_name asc`,
      [q]
    );
    const totalResult = await pool.query<{ count: string }>('select count(*)::text as count from registry.party');
    res.json({
      totalParties: Number(totalResult.rows[0]!.count),
      parties: result.rows.map((r) => ({
        id: r.id,
        name: r.legal_name,
        type: r.kind === 'person' ? 'Person' : 'Entity',
        basis: r.basis_label ?? 'unstated',
        effectiveFrom: r.effective_from,
        status: r.confirmed_at ? 'Confirmed' : 'Unconfirmed',
        rptCount: Number(r.rpt_count),
      })),
    });
  } catch (err) {
    next(err);
  }
});
