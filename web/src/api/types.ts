export type CaseKind = 'rpt_one_off' | 'rrpt' | 'rpt_recurring_non_ordinary';

export interface KindOption {
  code: CaseKind;
  label: string;
}

export type RelationBasisCode = 'spouse' | 'child' | 'director' | 'shareholder' | 'control' | 'associate';

export interface BasisOption {
  code: RelationBasisCode;
  label: string;
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
    gate: Gate;
  } | null;
  financialBasis: { status: 'none' | 'unconfirmed' | 'confirmed'; label: string | null };
  ruleSetVersion: string;
  routeVersion: string;
  status: 'open' | 'decided';
  decision: { id: string; label: string; rationale: string | null; decidedAt: string; actor: string } | null;
}

export interface PartyRow {
  id: string;
  name: string;
  type: 'Person' | 'Entity';
  basis: string;
  effectiveFrom: string;
  status: 'Confirmed' | 'Unconfirmed';
  rptCount: number;
}

export interface CreatePartyPayload {
  name: string;
  type: 'Person' | 'Entity';
  basisLabel: string;
}

export interface UpdatePartyPayload {
  name?: string;
  type?: 'Person' | 'Entity';
  basisLabel?: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  occurredAt: string;
  actor: string;
  type: string;
  detail: string;
  hash: string;
  prevHash: string | null;
}

export interface SubmitCasePayload {
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

export interface Thresholds {
  announceThreshold: number;
  circularThreshold: number;
  profitAttributableFactor: number;
}

export interface UploadedDocument {
  id: string;
  filename: string;
  byteSize: number;
  sha256: string;
}
