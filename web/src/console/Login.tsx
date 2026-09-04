import { useState } from 'react';
import { api } from '../api/client';
import type { CurrentUser } from '../api/types';
import { Blueprint } from '../components/Blueprint';

export function Login({ onSignedIn }: { onSignedIn: (user: CurrentUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const user = await api.login(username.trim(), password);
      onSignedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-bg)', padding: 20 }}>
      <Blueprint style={{ width: 'min(380px, 100%)', display: 'flex', flexDirection: 'column', gap: 18, padding: 28, background: 'var(--color-surface)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 19, letterSpacing: '0.01em' }}>RPT GOVERNANCE</div>
          <span className="kicker">Sign in to continue</span>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              className="input"
              id="username"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              className="input"
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-accent-900)' }}>{error}</p>}
          <button
            type="submit"
            className="btn btn-primary blueprint"
            disabled={busy || !username.trim() || !password}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: 'var(--color-neutral-600)' }}>
          Access is controlled by department — Finance submits transactions, Compliance decides and audits, the
          Secretariat administers the register. Every sign-in and decision is written to the append-only audit log.
        </p>
      </Blueprint>
    </div>
  );
}
