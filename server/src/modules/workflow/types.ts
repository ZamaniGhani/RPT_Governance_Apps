export interface ApprovalStepRow {
  id: string;
  case_id: string;
  seq: number;
  role: string;
  actor_id: string;
  decision: string;
  decision_key: 'approve' | 'reject' | 'refer' | null;
  rationale: string | null;
  decided_at: string;
  excluded_reason: string | null;
  conflict_confirmed: boolean;
}
