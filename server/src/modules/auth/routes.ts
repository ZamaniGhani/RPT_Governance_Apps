import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../shared/httpError.js';
import { actorFromRequest } from '../../shared/actor.js';
import { requireAuth, requireDepartment } from './middleware.js';
import { findValidSession } from './repository.js';
import { pool } from '../../db.js';
import { createUser, listUsers, login, logout, removeUser } from './service.js';
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
      id: result.account.id,
      username: result.account.username,
      displayName: result.account.display_name,
      email: result.account.email,
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
    id: account.id,
    username: account.username,
    displayName: account.display_name,
    email: account.email,
    department: account.department,
    departmentLabel: departmentLabel(account.department),
  });
});

// The user directory is visible to every signed-in account — "control and
// monitoring over the use of apps by relevant department" (the original ask
// behind login) covers seeing who has access, not just an admin-only screen —
// while creating and removing accounts stays admin-only below.
authRouter.get('/users', requireAuth, async (_req, res, next) => {
  try {
    res.json(await listUsers());
  } catch (err) {
    next(err);
  }
});

const createUserSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Enter a valid email address'),
  department: z.enum(['finance', 'compliance', 'secretariat', 'admin']),
});

authRouter.post('/users', requireAuth, requireDepartment('admin'), async (req, res, next) => {
  try {
    const input = createUserSchema.parse(req.body);
    const actor = actorFromRequest(req);
    const user = await createUser(input, actor);
    res.status(201).json(user);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(422, err.issues.map((i) => i.message).join('; ')));
    next(err);
  }
});

authRouter.delete('/users/:id', requireAuth, requireDepartment('admin'), async (req, res, next) => {
  try {
    const actor = actorFromRequest(req);
    await removeUser(req.params.id!, actor, req.account!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
