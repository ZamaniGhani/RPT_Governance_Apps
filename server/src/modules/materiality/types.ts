export interface Thresholds {
  announceThreshold: number;
  circularThreshold: number;
  profitAttributableFactor: number;
}

export interface RuleSetRow {
  version: string;
  effective_from: string;
  thresholds: Thresholds;
  retired_at: string | null;
}

export interface FinancialInputs {
  netAssets: number | null;
  totalAssets: number | null;
  profitBeforeTax: number | null;
  marketCap: number | null;
}

export interface RatioResult {
  code: 'net_assets' | 'market_cap' | 'profits' | 'total_assets';
  label: string;
  pct: number | null;
}

export type GateKey = 'none' | 'record' | 'announce' | 'circular';

export interface Gate {
  key: GateKey;
  title: string;
  body: string;
}

export interface FinancialPeriodRow {
  id: string;
  entity_scope: string;
  label: string;
  basis: 'audited' | 'unaudited' | 'proforma';
  period_end: string | null;
  net_assets: string | null;
  total_assets: string | null;
  market_cap: string | null;
  net_profit: string | null;
  source_document_id: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

export interface MaterialityEvaluationRow {
  id: string;
  case_id: string;
  rule_set_version: string;
  financial_period_id: string | null;
  ratios: RatioResult[];
  top_pct: string | null;
  aggregate_myr: string | null;
  aggregate_pct: string | null;
  gate: GateKey;
  gate_title: string;
  gate_body: string;
  computed_at: string;
}
