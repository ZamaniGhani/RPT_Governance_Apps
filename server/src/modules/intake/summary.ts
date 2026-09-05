import type { Executor } from '../../db.js';
import type { RatioResult } from '../materiality/index.js';
import { kindLabel, type CaseKind } from './types.js';

interface CaseSummaryRow {
  id: string;
  ref: string;
  kind: CaseKind;
  nature: string;
  consideration_myr: string;
  currency: string;
  transaction_date: string | null;
  rule_set_version: string;
  route_version: string;
  status: 'open' | 'decided';
  created_at: string;
  submitted_by: string;
  party_id: string;
  party_name: string;
  relation_label: string | null;
  relation_confirmed_at: string | null;
  ratios: RatioResult[] | null;
  top_pct: string | null;
  aggregate_myr: string | null;
  aggregate_pct: string | null;
  gate: string | null;
  gate_title: string | null;
  gate_body: string | null;
  financial_label: string | null;
  financial_confirmed_at: string | null;
  decision_id: string | null;
  decision_label: string | null;
  decision_rationale: string | null;
  decided_at: string | null;
  decision_actor: string | null;
  pending_approver_id: string | null;
  pending_approver_label: string | null;
  pending_approved_at: string | null;
}

const QUERY = `
  select
    c.id, c.ref, c.kind, c.nature, c.consideration_myr, c.currency, c.transaction_date,
    c.rule_set_version, c.route_version, c.status, c.created_at, c.submitted_by,
    c.pending_approver_id, c.pending_approver_label, c.pending_approved_at,
    p.id as party_id, p.legal_name as party_name,
    pr.basis_label as relation_label, pr.confirmed_at as relation_confirmed_at,
    me.ratios, me.top_pct, me.aggregate_myr, me.aggregate_pct, me.gate, me.gate_title, me.gate_body,
    fp.label as financial_label, fp.confirmed_at as financial_confirmed_at,
    ap.id as decision_id, ap.decision as decision_label, ap.rationale as decision_rationale,
    ap.decided_at, ap.actor_id as decision_actor
  from intake.rpt_case c
  join registry.party p on p.id = c.counterparty_party_id
  left join registry.party_relation pr on pr.id = c.counterparty_relation_id
  left join materiality.materiality_evaluation me on me.case_id = c.id
  left join materiality.financial_period fp on fp.id = me.financial_period_id
  left join lateral (
    select * from workflow.approval_step where case_id = c.id order by seq desc limit 1
  ) ap on true
`;

export interface CaseSummary {
  id: string;
  ref: string;
  kind: CaseKind;
  kindLabel: string;
  nature: string;
  considerationMyr: number;
  currency: string;
  transactionDate: string | null;
  createdAt: string;
  submittedBy: string;
  party: { id: string; name: string; relationLabel: string; relationConfirmed: boolean };
  evaluation: {
    ratios: RatioResult[];
    topPct: number | null;
    aggregateMyr: number | null;
    aggregatePct: number | null;
    gate: { key: string; title: string; body: string };
  } | null;
  financialBasis: { status: 'none' | 'unconfirmed' | 'confirmed'; label: string | null };
  ruleSetVersion: string;
  routeVersion: string;
  status: 'open' | 'decided';
  decision: { id: string; label: string; rationale: string | null; decidedAt: string; actor: string } | null;
  /** A circular-gate approval awaiting a second, different Compliance sign-off — see intake/service.ts decideCase. */
  pendingApproval: { actorId: string; actorLabel: string; approvedAt: string } | null;
}

function mapRow(row: CaseSummaryRow): CaseSummary {
  return {
    id: row.id,
    ref: row.ref,
    kind: row.kind,
    kindLabel: kindLabel(row.kind),
    nature: row.nature,
    considerationMyr: Number(row.consideration_myr),
    currency: row.currency,
    transactionDate: row.transaction_date,
    createdAt: row.created_at,
    submittedBy: row.submitted_by,
    party: {
      id: row.party_id,
      name: row.party_name,
      relationLabel: row.relation_label ?? 'proposed, unstated',
      relationConfirmed: !!row.relation_confirmed_at,
    },
    evaluation: row.gate
      ? {
          ratios: row.ratios ?? [],
          topPct: row.top_pct !== null ? Number(row.top_pct) : null,
          aggregateMyr: row.aggregate_myr !== null ? Number(row.aggregate_myr) : null,
          aggregatePct: row.aggregate_pct !== null ? Number(row.aggregate_pct) : null,
          gate: { key: row.gate, title: row.gate_title!, body: row.gate_body! },
        }
      : null,
    financialBasis: {
      status: !row.financial_label ? 'none' : row.financial_confirmed_at ? 'confirmed' : 'unconfirmed',
      label: row.financial_label,
    },
    ruleSetVersion: row.rule_set_version,
    routeVersion: row.route_version,
    status: row.status,
    // A pending first approval leaves a workflow.approval_step row behind
    // but the case is not yet decided — only surface `decision` once the
    // case has actually finalised, or the frontend would show it as decided
    // one sign-off too early.
    decision:
      row.status === 'decided' && row.decision_id
        ? {
            id: row.decision_id,
            label: row.decision_label!,
            rationale: row.decision_rationale,
            decidedAt: row.decided_at!,
            actor: row.decision_actor!,
          }
        : null,
    pendingApproval: row.pending_approver_id
      ? { actorId: row.pending_approver_id, actorLabel: row.pending_approver_label!, approvedAt: row.pending_approved_at! }
      : null,
  };
}

export async function listCaseSummaries(db: Executor): Promise<CaseSummary[]> {
  const result = await db.query<CaseSummaryRow>(`${QUERY} order by c.created_at desc`);
  return result.rows.map(mapRow);
}

export async function getCaseSummary(db: Executor, id: string): Promise<CaseSummary | null> {
  const result = await db.query<CaseSummaryRow>(`${QUERY} where c.id = $1`, [id]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}
