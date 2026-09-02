export interface AppendEventInput {
  aggregateType: string;
  aggregateId: string;
  type: string;
  detail: string;
  payload: Record<string, unknown>;
  actorId: string;
}

export interface AuditEventRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  seq: number;
  type: string;
  detail: string;
  payload: Record<string, unknown>;
  actor_id: string;
  occurred_at: string;
  prev_hash: string | null;
  hash: string;
}
