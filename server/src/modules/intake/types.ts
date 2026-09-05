export type CaseKind = 'rpt_one_off' | 'rrpt' | 'rpt_recurring_non_ordinary';

export interface KindOption {
  code: CaseKind;
  label: string;
}

export const KIND_OPTIONS: KindOption[] = [
  { code: 'rpt_one_off', label: 'One-off related party transaction' },
  { code: 'rrpt', label: 'Recurrent related party transaction' },
  { code: 'rpt_recurring_non_ordinary', label: 'Recurring transaction outside the RRPT mandate regime' },
];

export function kindLabel(code: CaseKind): string {
  return KIND_OPTIONS.find((k) => k.code === code)?.label ?? code;
}

/** ADR-02: route definitions are versioned code, not admin-editable data. */
export const ROUTE_VERSION = 'RPT-STD v1';

export interface RptCaseRow {
  id: string;
  ref: string;
  kind: CaseKind;
  counterparty_party_id: string;
  counterparty_relation_id: string | null;
  nature: string;
  consideration_myr: string;
  currency: string;
  fx_rate: string;
  transaction_date: string | null;
  submitted_by: string;
  rule_set_version: string;
  route_version: string;
  status: 'open' | 'decided';
  created_at: string;
  pending_approver_id: string | null;
  pending_approver_label: string | null;
  pending_approved_at: string | null;
}

export interface RptDocumentRow {
  id: string;
  kind: string;
  filename: string;
  byte_size: number;
  sha256: string;
  uploaded_by: string;
  at: string;
}

export interface SubmitCaseInput {
  party: string;
  partyType: 'Person' | 'Entity';
  basisLabel: string | null;
  nature: string;
  kind: CaseKind;
  transactionDate: string | null;
  considerationMyr: number;
  financials: {
    netAssets: number | null;
    totalAssets: number | null;
    profitBeforeTax: number | null;
    marketCap: number | null;
  };
  financialDocumentId: string | null;
}
