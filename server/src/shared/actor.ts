import type { Request } from 'express';
import { departmentLabel } from '../modules/auth/types.js';
import { HttpError } from './httpError.js';

export interface Actor {
  id: string;
  role: string;
}

/** The signed-in account attached by auth/middleware.ts's requireAuth, as an Actor for audit logs and case attribution. */
export function actorFromRequest(req: Request): Actor {
  const account = req.account;
  if (!account) throw new HttpError(401, 'Sign in required');
  return { id: account.display_name, role: departmentLabel(account.department) };
}

export function actorLabel(actor: Actor): string {
  return `${actor.id} · ${actor.role}`;
}
