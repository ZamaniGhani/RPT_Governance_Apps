import type { PoolClient } from 'pg';
import type { Executor } from '../../db.js';
import type { PartyKind, PartyRelationRow, PartyRow, RelationBasisCode, RelationSource } from './types.js';

/** Screens a typed counterparty name against the register (ADR-05: at the keystroke, not a nightly batch). */
export async function findPartyByName(db: Executor, legalName: string): Promise<PartyRow | null> {
  const result = await db.query<PartyRow>(
    `select * from registry.party where lower(legal_name) = lower($1) limit 1`,
    [legalName.trim()]
  );
  return result.rows[0] ?? null;
}

export async function findActiveRelation(db: Executor, partyId: string): Promise<PartyRelationRow | null> {
  const result = await db.query<PartyRelationRow>(
    `select * from registry.party_relation
     where from_party = $1 and effective_to is null
     order by effective_from desc limit 1`,
    [partyId]
  );
  return result.rows[0] ?? null;
}

export async function createParty(
  client: PoolClient,
  input: { kind: PartyKind; legalName: string; nricOrRegNo?: string | null }
): Promise<PartyRow> {
  const result = await client.query<PartyRow>(
    `insert into registry.party (kind, legal_name, nric_or_reg_no) values ($1, $2, $3) returning *`,
    [input.kind, input.legalName.trim(), input.nricOrRegNo ?? null]
  );
  return result.rows[0]!;
}

export async function createRelation(
  client: PoolClient,
  input: {
    fromParty: string;
    toParty?: string | null;
    basis: RelationBasisCode;
    basisLabel: string;
    source: RelationSource;
    confidence?: number | null;
  }
): Promise<PartyRelationRow> {
  const result = await client.query<PartyRelationRow>(
    `insert into registry.party_relation (from_party, to_party, basis, basis_label, source, confidence)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [input.fromParty, input.toParty ?? null, input.basis, input.basisLabel, input.source, input.confidence ?? null]
  );
  return result.rows[0]!;
}

export async function confirmRelation(client: PoolClient, relationId: string, confirmedBy: string): Promise<void> {
  await client.query(
    `update registry.party_relation set confirmed_by = $2, confirmed_at = now() where id = $1`,
    [relationId, confirmedBy]
  );
}

/** Closes a relation as of now — the only way a party_relation edge ever leaves the active register (ADR: effective-dated, never deleted). */
export async function closeRelation(client: PoolClient, relationId: string): Promise<void> {
  await client.query(`update registry.party_relation set effective_to = now() where id = $1`, [relationId]);
}

export async function updatePartyFields(
  client: PoolClient,
  partyId: string,
  input: { legalName?: string; kind?: PartyKind }
): Promise<PartyRow> {
  const result = await client.query<PartyRow>(
    `update registry.party set legal_name = coalesce($2, legal_name), kind = coalesce($3, kind) where id = $1 returning *`,
    [partyId, input.legalName?.trim() ?? null, input.kind ?? null]
  );
  return result.rows[0]!;
}

export async function getPartyById(db: Executor, partyId: string): Promise<PartyRow | null> {
  const result = await db.query<PartyRow>('select * from registry.party where id = $1', [partyId]);
  return result.rows[0] ?? null;
}
