import type { Request } from 'express';

export interface Actor {
  id: string;
  role: string;
}

const KNOWN_ACTORS: Record<string, Actor> = {
  compliance: { id: 'Nurul Aziz', role: 'Compliance' },
  finance: { id: 'Faridah', role: 'Finance' },
};

const DEFAULT_ACTOR = KNOWN_ACTORS.compliance;

/**
 * There is no authentication in this build (out of scope — see
 * IMPLEMENTATION.md). The console lets the demo user pick which persona
 * they are acting as; that choice arrives as a header and is trusted as-is.
 */
export function actorFromRequest(req: Request): Actor {
  const key = String(req.header('x-actor') || '').toLowerCase();
  return KNOWN_ACTORS[key] ?? DEFAULT_ACTOR;
}

export function actorLabel(actor: Actor): string {
  return `${actor.id} · ${actor.role}`;
}
