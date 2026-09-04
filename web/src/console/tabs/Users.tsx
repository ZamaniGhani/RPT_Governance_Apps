import { useState } from 'react';
import { api } from '../../api/client';
import { DEPARTMENT_OPTIONS } from '../../api/types';
import type { UserAccount } from '../../api/types';
import { Blueprint } from '../../components/Blueprint';
import { DepartmentRoles } from '../../components/DepartmentRoles';
import { dateLabel } from '../../lib/format';

interface UserForm {
  displayName: string;
  username: string;
  email: string;
  password: string;
  department: UserAccount['department'];
}

const EMPTY_FORM: UserForm = { displayName: '', username: '', email: '', password: '', department: 'finance' };

export function Users({
  users,
  onChanged,
  canManage,
  currentUserId,
}: {
  users: UserAccount[] | null;
  onChanged: () => Promise<void>;
  canManage: boolean;
  currentUserId: string;
}) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const missing: string[] = [];
  if (!form.displayName.trim()) missing.push('name');
  if (form.username.trim().length < 3) missing.push('username (min 3 characters)');
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) missing.push('a valid email');
  if (form.password.length < 8) missing.push('password (min 8 characters)');

  function startCreate() {
    setError('');
    setForm(EMPTY_FORM);
    setCreating(true);
  }

  async function submitCreate() {
    if (missing.length) return;
    setBusy(true);
    setError('');
    try {
      await api.createUser({
        displayName: form.displayName.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        department: form.department,
      });
      setCreating(false);
      setForm(EMPTY_FORM);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add user');
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: UserAccount) {
    if (!window.confirm(`Remove ${u.displayName}'s access? They will be signed out and can no longer log in.`)) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteUser(u.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove user');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <div className="register-toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="kicker">Who has access</span>
            <span className="register-count" style={{ padding: 0 }}>
              {users ? `${users.length} account${users.length === 1 ? '' : 's'}` : ''}
            </span>
          </div>
          {canManage ? (
            <button className="btn btn-secondary" style={{ marginLeft: 'auto', minHeight: 38 }} onClick={startCreate} disabled={creating}>
              + Add user
            </button>
          ) : (
            <span className="tag tag-outline" style={{ marginLeft: 'auto' }}>
              Read-only · Admin access required to add or remove users
            </span>
          )}
        </div>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--color-accent-700)' }}>What each department can do</summary>
          <div style={{ marginTop: 10 }}>
            <DepartmentRoles compact />
          </div>
        </details>
      </div>

      {error && (
        <div className="alert alert-error" style={{ margin: '10px 24px 0' }}>
          {error}
        </div>
      )}

      {canManage && creating && (
        <Blueprint style={{ margin: '16px 24px 0', display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
          <span className="kicker">New user account</span>
          <div className="intake-row-2">
            <div className="field">
              <label htmlFor="newDisplayName">Full name</label>
              <input className="input" id="newDisplayName" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} placeholder="e.g. Farah Aziz" />
            </div>
            <div className="field">
              <label htmlFor="newDept">Department</label>
              <select className="input" id="newDept" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value as UserForm['department'] }))}>
                {DEPARTMENT_OPTIONS.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="intake-row-2">
            <div className="field">
              <label htmlFor="newUsername">Username</label>
              <input className="input" id="newUsername" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="e.g. farah.aziz" />
            </div>
            <div className="field">
              <label htmlFor="newEmail">Email</label>
              <input className="input" type="email" id="newEmail" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@company.com" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="newPassword">Temporary password</label>
            <input className="input" type="password" id="newPassword" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="At least 8 characters" />
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <button className="btn btn-primary" disabled={busy || missing.length > 0} onClick={submitCreate} style={{ minHeight: 40 }}>
              Add user
            </button>
            <button className="btn btn-ghost" onClick={() => setCreating(false)} style={{ minHeight: 40 }}>
              Cancel
            </button>
          </div>
        </Blueprint>
      )}

      <div className="register-table-wrap">
        {users === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton" style={{ height: 40, borderRadius: 'var(--radius-md)' }} />
            ))}
          </div>
        )}
        {users && users.length > 0 && (
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Name</th>
                <th style={{ textAlign: 'left' }}>Email</th>
                <th style={{ textAlign: 'left' }}>Department</th>
                <th style={{ textAlign: 'left' }}>Username</th>
                <th style={{ textAlign: 'left' }}>Last sign-in</th>
                {canManage && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14.5 }}>{u.displayName}</span>
                    {u.id === currentUserId && <span className="tag tag-outline" style={{ marginLeft: 8 }}>You</span>}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--color-neutral-800)' }}>{u.email}</td>
                  <td>
                    <span className="tag tag-accent">{u.departmentLabel}</span>
                  </td>
                  <td style={{ fontSize: 12.5, fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--color-neutral-700)' }}>{u.username}</td>
                  <td style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', color: 'var(--color-neutral-700)' }}>
                    {u.lastLoginAt ? dateLabel(u.lastLoginAt) : 'never'}
                  </td>
                  {canManage && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        className="btn btn-ghost"
                        disabled={busy || u.id === currentUserId}
                        title={u.id === currentUserId ? "You can't remove your own account while signed in" : undefined}
                        onClick={() => remove(u)}
                        style={{ minHeight: 30 }}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {users && users.length === 0 && (
          <div className="empty-state" style={{ maxWidth: 520 }}>
            <span className="empty-state-title">No accounts on file</span>
            <span className="empty-state-body">This shouldn't happen — there is always at least one admin account.</span>
          </div>
        )}
      </div>
    </div>
  );
}
