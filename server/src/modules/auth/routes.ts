import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../shared/httpError.js';
import { requireAuth } from './middleware.js';
import { findValidSession } from './repository.js';
import { pool } from '../../db.js';
import { login, logout } from './service.js';
import { departmentLabel, SESSION_COOKIE, SESSION_TTL_HOURS } from './types.js';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

authRouter.post('/auth/login', async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const result = await login(username, password, req.header('user-agent') ?? null);
    res.cookie(SESSION_COOKIE, result.token, { ...cookieOptions, maxAge: SESSION_TTL_HOURS * 3600 * 1000 });
    res.json({
      username: result.account.username,
      displayName: result.account.display_name,
      department: result.account.department,
      departmentLabel: departmentLabel(result.account.department),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(422, 'Username and password are required'));
    next(err);
  }
});

authRouter.post('/auth/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      const session = await findValidSession(pool, token);
      await logout(token, session?.account ?? null);
    }
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.get('/auth/me', requireAuth, (req, res) => {
  const account = req.account!;
  res.json({
    username: account.username,
    displayName: account.display_name,
    department: account.department,
    departmentLabel: departmentLabel(account.department),
  });
});
