import type { PoolClient } from 'pg';
import type { Executor } from '../../db.js';
import type { CaseKind, RptCaseRow, RptDocumentRow } from './types.js';

export async function nextCaseRef(client: PoolClient, year: number): Promise<string> {
  await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`rpt_case_ref:${year}`]);
  const result = await client.query<{ count: string }>(
    `select count(*)::text as count from intake.rpt_case where extract(year from created_at) = $1`,
    [year]
  );
  const n = Number(result.rows[0]!.count) + 1;
  return `RPT-${year}-${String(n).padStart(3, '0')}`;
}

export async function insertCase(
  client: PoolClient,
  input: {
    ref: string;
    kind: CaseKind;
    counterpartyPartyId: string;
    counterpartyRelationId: string | null;
    nature: string;
    considerationMyr: number;
    transactionDate: string | null;
    submittedBy: string;
    ruleSetVersion: string;
    routeVersion: string;
  }
): Promise<RptCaseRow> {
  const result = await client.query<RptCaseRow>(
    `insert into intake.rpt_case
       (ref, kind, counterparty_party_id, counterparty_relation_id, nature, consideration_myr,
        transaction_date, submitted_by, rule_set_version, route_version)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning *`,
    [
      input.ref,
      input.kind,
      input.counterpartyPartyId,
      input.counterpartyRelationId,
      input.nature,
      input.considerationMyr,
      input.transactionDate,
      input.submittedBy,
      input.ruleSetVersion,
      input.routeVersion,
    ]
  );
  return result.rows[0]!;
}

export async function setCaseStatus(client: PoolClient, caseId: string, status: 'open' | 'decided'): Promise<void> {
  await client.query('update intake.rpt_case set status = $2 where id = $1', [caseId, status]);
}

/**
 * Holds (or clears) the first of the two approvals a circular-gate case
 * needs before it counts as approved — pass null fields to clear it, on a
 * reject/refer/reopen/final-approval.
 */
export async function setPendingApprover(
  client: PoolClient,
  caseId: string,
  pending: { id: string; label: string; at: string } | null
): Promise<void> {
  await client.query(
    'update intake.rpt_case set pending_approver_id = $2, pending_approver_label = $3, pending_approved_at = $4 where id = $1',
    [caseId, pending?.id ?? null, pending?.label ?? null, pending?.at ?? null]
  );
}

export async function getCase(db: Executor, caseId: string): Promise<RptCaseRow | null> {
  const result = await db.query<RptCaseRow>('select * from intake.rpt_case where id = $1', [caseId]);
  return result.rows[0] ?? null;
}

export async function insertDocument(
  client: PoolClient,
  input: { filename: string; byteSize: number; sha256: string; uploadedBy: string }
): Promise<RptDocumentRow> {
  const result = await client.query<RptDocumentRow>(
    `insert into intake.rpt_document (filename, byte_size, sha256, uploaded_by) values ($1, $2, $3, $4) returning *`,
    [input.filename, input.byteSize, input.sha256, input.uploadedBy]
  );
  return result.rows[0]!;
}

export async function getDocument(db: Executor, id: string): Promise<RptDocumentRow | null> {
  const result = await db.query<RptDocumentRow>('select * from intake.rpt_document where id = $1', [id]);
  return result.rows[0] ?? null;
}
