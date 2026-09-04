import type { NextFunction, Request, Response } from 'express';
import { pool } from '../../db.js';
import { HttpError } from '../../shared/httpError.js';
import { findValidSession, touchSession } from './repository.js';
import { SESSION_COOKIE, type AccountRow, type Department } from './types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      account?: AccountRow;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    const session = token ? await findValidSession(pool, token) : null;
    if (!session) throw new HttpError(401, 'Sign in required');
    req.account = session.account;
    touchSession(pool, token).catch(() => {});
    next();
  } catch (err) {
    next(err);
  }
}

export function requireDepartment(...departments: Department[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const account = req.account;
    if (!account) return next(new HttpError(401, 'Sign in required'));
    if (account.department !== 'admin' && !departments.includes(account.department)) {
      return next(new HttpError(403, `This action needs the ${departments.join(' or ')} department`));
    }
    next();
  };
}
