import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Executor } from '../../db.js';
import type { AppendEventInput, AuditEventRow } from './types.js';

/**
 * audit.event is append-only and hash-chained (enforced in the DB by a
 * trigger that rejects UPDATE/DELETE outright). This is the only writer.
 * The per-aggregate chain is serialized with an advisory lock so two
 * concurrent writers on the same aggregate can't race for the same seq.
 */
export async function appendEvent(client: PoolClient, input: AppendEventInput): Promise<AuditEventRow> {
  await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `${input.aggregateType}:${input.aggregateId}`,
  ]);

  const prior = await client.query<{ seq: number; hash: string }>(
    `select seq, hash from audit.event
     where aggregate_type = $1 and aggregate_id = $2
     order by seq desc limit 1`,
    [input.aggregateType, input.aggregateId]
  );

  const seq = (prior.rows[0]?.seq ?? 0) + 1;
  const prevHash = prior.rows[0]?.hash ?? null;
  const occurredAt = new Date().toISOString();
  const id = randomUUID();
  const payloadJson = JSON.stringify(input.payload);

  const hash = createHash('sha256')
    .update([prevHash ?? '', id, input.type, payloadJson, occurredAt, input.actorId].join('|'))
    .digest('hex');

  const result = await client.query<AuditEventRow>(
    `insert into audit.event
       (id, aggregate_type, aggregate_id, seq, type, payload, detail, actor_id, occurred_at, prev_hash, hash)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning *`,
    [id, input.aggregateType, input.aggregateId, seq, input.type, payloadJson, input.detail, input.actorId, occurredAt, prevHash, hash]
  );
  return result.rows[0]!;
}

export async function listEvents(db: Executor, limit = 500): Promise<AuditEventRow[]> {
  const result = await db.query<AuditEventRow>(
    `select * from audit.event order by occurred_at desc, seq desc limit $1`,
    [limit]
  );
  return result.rows;
}

export async function countEvents(db: Executor): Promise<number> {
  const result = await db.query<{ count: string }>('select count(*)::text as count from audit.event');
  return Number(result.rows[0]!.count);
}
