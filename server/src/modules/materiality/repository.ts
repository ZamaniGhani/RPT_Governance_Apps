import type { PoolClient } from 'pg';
import type { Executor } from '../../db.js';
import type { FinancialPeriodRow, Gate, MaterialityEvaluationRow, RatioResult, RuleSetRow } from './types.js';

export async function getCurrentRuleSet(db: Executor): Promise<RuleSetRow> {
  const result = await db.query<RuleSetRow>(
    `select * from materiality.rule_set where retired_at is null order by effective_from desc limit 1`
  );
  if (!result.rows[0]) throw new Error('No active rule set configured');
  return result.rows[0];
}

export async function createFinancialPeriod(
  client: PoolClient,
  input: {
    label: string;
    netAssets: number | null;
    totalAssets: number | null;
    marketCap: number | null;
    netProfit: number | null;
    sourceDocumentId: string | null;
  }
): Promise<FinancialPeriodRow> {
  const result = await client.query<FinancialPeriodRow>(
    `insert into materiality.financial_period
       (label, basis, net_assets, total_assets, market_cap, net_profit, source_document_id)
     values ($1, 'unaudited', $2, $3, $4, $5, $6)
     returning *`,
    [input.label, input.netAssets, input.totalAssets, input.marketCap, input.netProfit, input.sourceDocumentId]
  );
  return result.rows[0]!;
}

export async function createEvaluation(
  client: PoolClient,
  input: {
    caseId: string;
    ruleSetVersion: string;
    financialPeriodId: string | null;
    ratios: RatioResult[];
    topPct: number | null;
    aggregateMyr: number | null;
    aggregatePct: number | null;
    gate: Gate;
  }
): Promise<MaterialityEvaluationRow> {
  const result = await client.query<MaterialityEvaluationRow>(
    `insert into materiality.materiality_evaluation
       (case_id, rule_set_version, financial_period_id, ratios, top_pct, aggregate_myr, aggregate_pct, gate, gate_title, gate_body)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning *`,
    [
      input.caseId,
      input.ruleSetVersion,
      input.financialPeriodId,
      JSON.stringify(input.ratios),
      input.topPct,
      input.aggregateMyr,
      input.aggregatePct,
      input.gate.key,
      input.gate.title,
      input.gate.body,
    ]
  );
  return result.rows[0]!;
}

export async function getEvaluationForCase(db: Executor, caseId: string): Promise<MaterialityEvaluationRow | null> {
  const result = await db.query<MaterialityEvaluationRow>(
    `select * from materiality.materiality_evaluation where case_id = $1 order by computed_at desc limit 1`,
    [caseId]
  );
  return result.rows[0] ?? null;
}

/**
 * Rolling twelve-month consideration total with this counterparty, for
 * aggregation. A case whose latest decision is a rejection never proceeded,
 * so it must not inflate the aggregate that later transactions with the
 * same party are tested against — only cases that are still open (pending a
 * decision) or that were approved/referred count.
 */
export async function priorConsiderationTotal(db: Executor, counterpartyPartyId: string, beforeDate: Date): Promise<number> {
  const result = await db.query<{ total: string | null }>(
    `select sum(c.consideration_myr)::text as total
     from intake.rpt_case c
     left join lateral (
       select decision_key from workflow.approval_step where case_id = c.id order by seq desc limit 1
     ) latest on true
     where c.counterparty_party_id = $1
       and c.created_at >= $2::timestamptz - interval '12 months'
       and c.created_at < $2::timestamptz
       and coalesce(latest.decision_key, 'approve') <> 'reject'`,
    [counterpartyPartyId, beforeDate.toISOString()]
  );
  return Number(result.rows[0]?.total ?? 0);
}
