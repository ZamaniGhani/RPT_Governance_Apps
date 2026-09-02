import type { PoolClient } from 'pg';
import type { Executor } from '../../db.js';
import type { ApprovalStepRow } from './types.js';

export async function insertApprovalStep(
  client: PoolClient,
  input: { caseId: string; role: string; actorId: string; decision: string; rationale: string | null }
): Promise<ApprovalStepRow> {
  await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`approval_step:${input.caseId}`]);
  const seqResult = await client.query<{ seq: number }>(
    'select coalesce(max(seq), 0) + 1 as seq from workflow.approval_step where case_id = $1',
    [input.caseId]
  );
  const seq = seqResult.rows[0]!.seq;
  const result = await client.query<ApprovalStepRow>(
    `insert into workflow.approval_step (case_id, seq, role, actor_id, decision, rationale)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [input.caseId, seq, input.role, input.actorId, input.decision, input.rationale]
  );
  return result.rows[0]!;
}

export async function latestApprovalStep(db: Executor, caseId: string): Promise<ApprovalStepRow | null> {
  const result = await db.query<ApprovalStepRow>(
    'select * from workflow.approval_step where case_id = $1 order by seq desc limit 1',
    [caseId]
  );
  return result.rows[0] ?? null;
}
