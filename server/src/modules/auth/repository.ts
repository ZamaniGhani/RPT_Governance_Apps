import type { PoolClient } from 'pg';
import type { Executor } from '../../db.js';
import type { AccountRow, SessionRow } from './types.js';

export async function findAccountByUsername(db: Executor, username: string): Promise<AccountRow | null> {
  const result = await db.query<AccountRow>(
    'select * from auth.account where lower(username) = lower($1) and active',
    [username.trim()]
  );
  return result.rows[0] ?? null;
}

export async function touchLastLogin(client: PoolClient, accountId: string): Promise<void> {
  await client.query('update auth.account set last_login_at = now() where id = $1', [accountId]);
}

export async function createSession(
  client: PoolClient,
  input: { token: string; accountId: string; expiresAt: string; userAgent: string | null }
): Promise<SessionRow> {
  const result = await client.query<SessionRow>(
    `insert into auth.session (token, account_id, expires_at, user_agent) values ($1, $2, $3, $4) returning *`,
    [input.token, input.accountId, input.expiresAt, input.userAgent]
  );
  return result.rows[0]!;
}

export async function findValidSession(db: Executor, token: string): Promise<(SessionRow & { account: AccountRow }) | null> {
  const result = await db.query<SessionRow & AccountRow & { account_id: string }>(
    `select s.*, a.id as account_id, a.username, a.password_hash, a.display_name, a.department, a.active, a.created_at, a.last_login_at
     from auth.session s
     join auth.account a on a.id = s.account_id
     where s.token = $1 and s.expires_at > now() and a.active`,
    [token]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    token: row.token,
    account_id: row.account_id,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    expires_at: row.expires_at,
    user_agent: row.user_agent,
    account: {
      id: row.account_id,
      username: row.username,
      password_hash: row.password_hash,
      display_name: row.display_name,
      department: row.department,
      active: row.active,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
    },
  };
}

export async function touchSession(db: Executor, token: string): Promise<void> {
  await db.query('update auth.session set last_seen_at = now() where token = $1', [token]);
}

export async function deleteSession(db: Executor, token: string): Promise<void> {
  await db.query('delete from auth.session where token = $1', [token]);
}
