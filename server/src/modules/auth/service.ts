import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../../db.js';
import { appendEvent } from '../audit/index.js';
import { HttpError } from '../../shared/httpError.js';
import type { Actor } from '../../shared/actor.js';
import {
  countActiveAdmins,
  createAccount,
  createSession,
  deleteAccount,
  deleteSession,
  findAccountById,
  findAccountByUsername,
  findAccountByUsernameOrEmail,
  listAccounts,
  touchLastLogin,
} from './repository.js';
import { departmentLabel, SESSION_TTL_HOURS, type AccountRow, type Department } from './types.js';

export interface LoginResult {
  token: string;
  expiresAt: string;
  account: Pick<AccountRow, 'id' | 'username' | 'display_name' | 'email' | 'department'>;
}

export async function login(username: string, password: string, userAgent: string | null): Promise<LoginResult> {
  const account = await findAccountByUsername(pool, username);
  const valid = account ? await bcrypt.compare(password, account.password_hash) : false;

  if (!account || !valid) {
    await withTransaction((client) =>
      appendEvent(client, {
        aggregateType: 'auth_account',
        aggregateId: username.trim() || 'unknown',
        type: 'LoginFailed',
        actorId: 'system',
        detail: `Failed login attempt for username "${username.trim()}".`,
        payload: { username: username.trim() },
      })
    );
    throw new HttpError(401, 'Incorrect username or password');
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();

  await withTransaction(async (client) => {
    await createSession(client, { token, accountId: account.id, expiresAt, userAgent });
    await touchLastLogin(client, account.id);
    await appendEvent(client, {
      aggregateType: 'auth_account',
      aggregateId: account.id,
      type: 'LoginSucceeded',
      actorId: `${account.display_name} · ${departmentLabel(account.department)}`,
      detail: `${account.display_name} (${departmentLabel(account.department)}) signed in.`,
      payload: { department: account.department },
    });
  });

  return {
    token,
    expiresAt,
    account: { id: account.id, username: account.username, display_name: account.display_name, email: account.email, department: account.department },
  };
}

export async function logout(token: string, account: AccountRow | null): Promise<void> {
  await deleteSession(pool, token);
  if (account) {
    await withTransaction((client) =>
      appendEvent(client, {
        aggregateType: 'auth_account',
        aggregateId: account.id,
        type: 'LoggedOut',
        actorId: `${account.display_name} · ${departmentLabel(account.department)}`,
        detail: `${account.display_name} (${departmentLabel(account.department)}) signed out.`,
        payload: {},
      })
    );
  }
}

export interface UserListItem {
  id: string;
  username: string;
  displayName: string;
  email: string;
  department: Department;
  departmentLabel: string;
  createdAt: string;
  lastLoginAt: string | null;
}

function toUserListItem(a: AccountRow): UserListItem {
  return {
    id: a.id,
    username: a.username,
    displayName: a.display_name,
    email: a.email,
    department: a.department,
    departmentLabel: departmentLabel(a.department),
    createdAt: a.created_at,
    lastLoginAt: a.last_login_at,
  };
}

export async function listUsers(): Promise<UserListItem[]> {
  const rows = await listAccounts(pool);
  return rows.map(toUserListItem);
}

export interface CreateUserInput {
  username: string;
  password: string;
  displayName: string;
  email: string;
  department: Department;
}

// Only an admin account may reach this (routes.ts gates it), which is also
// the one department allowed to bypass every other requireDepartment check —
// so account creation is itself just another admin-only administrative act,
// audited the same way a decision or a register edit is.
export async function createUser(input: CreateUserInput, actor: Actor): Promise<UserListItem> {
  const existing = await findAccountByUsernameOrEmail(pool, input.username, input.email);
  if (existing) {
    throw new HttpError(409, existing.username.toLowerCase() === input.username.trim().toLowerCase() ? 'That username is already taken' : 'That email is already in use');
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  const account = await withTransaction(async (client) => {
    const created = await createAccount(client, {
      username: input.username.trim(),
      passwordHash,
      displayName: input.displayName.trim(),
      email: input.email.trim(),
      department: input.department,
    });
    await appendEvent(client, {
      aggregateType: 'auth_account',
      aggregateId: created.id,
      type: 'UserCreated',
      actorId: `${actor.id} · ${actor.role}`,
      detail: `${created.display_name} (${created.email}) added to the ${departmentLabel(created.department)} department by ${actor.id}.`,
      payload: { department: created.department },
    });
    return created;
  });
  return toUserListItem(account);
}

export async function removeUser(id: string, actor: Actor, requestingAccountId: string): Promise<void> {
  if (id === requestingAccountId) throw new HttpError(400, "You can't remove your own account while signed in to it");
  const account = await findAccountById(pool, id);
  if (!account) throw new HttpError(404, 'User not found');
  if (account.department === 'admin' && (await countActiveAdmins(pool)) <= 1) {
    throw new HttpError(400, 'At least one admin account must remain');
  }
  await withTransaction(async (client) => {
    await appendEvent(client, {
      aggregateType: 'auth_account',
      aggregateId: account.id,
      type: 'UserRemoved',
      actorId: `${actor.id} · ${actor.role}`,
      detail: `${account.display_name} (${account.email}) removed from the ${departmentLabel(account.department)} department by ${actor.id}.`,
      payload: { department: account.department },
    });
    await deleteAccount(client, id);
  });
}
