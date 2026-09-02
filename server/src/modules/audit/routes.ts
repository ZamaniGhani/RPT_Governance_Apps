import { Router } from 'express';
import { pool } from '../../db.js';
import { listEvents } from './repository.js';

export const auditRouter = Router();

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

auditRouter.get('/events', async (_req, res, next) => {
  try {
    const rows = await listEvents(pool, 500);
    res.json(
      rows.map((e) => ({
        id: e.id,
        at: relativeAge(e.occurred_at),
        occurredAt: e.occurred_at,
        actor: e.actor_id,
        type: e.type,
        detail: e.detail,
        hash: e.hash,
        prevHash: e.prev_hash,
      }))
    );
  } catch (err) {
    next(err);
  }
});
