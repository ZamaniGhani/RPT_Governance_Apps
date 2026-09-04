export type Department = 'finance' | 'compliance' | 'secretariat' | 'admin';

export interface AccountRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  department: Department;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface SessionRow {
  token: string;
  account_id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  user_agent: string | null;
}

export const SESSION_COOKIE = 'rpt_session';
export const SESSION_TTL_HOURS = 12;

export function departmentLabel(department: Department): string {
  return department.charAt(0).toUpperCase() + department.slice(1);
}
