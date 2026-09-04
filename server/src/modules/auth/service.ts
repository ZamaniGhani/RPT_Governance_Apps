import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../../db.js';
import { appendEvent } from '../audit/index.js';
import { HttpError } from '../../shared/httpError.js';
import { createSession, deleteSession, findAccountByUsername, touchLastLogin } from './repository.js';
import { departmentLabel, SESSION_TTL_HOURS, type AccountRow } from './types.js';

export interface LoginResult {
  token: string;
  expiresAt: string;
  account: Pick<AccountRow, 'id' | 'username' | 'display_name' | 'department'>;
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
    account: { id: account.id, username: account.username, display_name: account.display_name, department: account.department },
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
