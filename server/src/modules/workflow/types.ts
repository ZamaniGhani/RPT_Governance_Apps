export interface ApprovalStepRow {
  id: string;
  case_id: string;
  seq: number;
  role: string;
  actor_id: string;
  decision: string;
  rationale: string | null;
  decided_at: string;
  excluded_reason: string | null;
}
