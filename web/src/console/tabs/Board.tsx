import { useMemo, useState } from 'react';
import type { AuditEvent, CaseSummary, PartyRow, Thresholds, UserAccount } from '../../api/types';
import { Blueprint } from '../../components/Blueprint';
import { dateLabel, fmtMyr, fmtPct } from '../../lib/format';

/**
 * A periodic oversight read for the Board, not another operational queue —
 * it answers "is anything about to breach a threshold, is anything stuck
 * waiting on us, and is the control environment itself healthy?" Everything
 * here is derived from data the other tabs already fetch; there is no
 * separate board-only API. It is read-only for every department, same as
 * Audit and Users, since seeing this is itself the point of "monitoring."
 */

const WINDOW_OPTIONS = [
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last 12 months' },
];

export function Board({
  cases,
  events,
  users,
  parties,
  ruleSet,
}: {
  cases: CaseSummary[] | null;
  events: AuditEvent[] | null;
  users: UserAccount[] | null;
  parties: PartyRow[] | null;
  ruleSet: { thresholds: Thresholds } | null;
}) {
  const [windowDays, setWindowDays] = useState(30);

  const ready = cases !== null && events !== null && users !== null && parties !== null && ruleSet !== null;

  const stats = useMemo(() => {
    if (!ready) return null;
    const now = new Date();
    const currentYear = now.getFullYear();
    const threshold = ruleSet.thresholds.materialThreshold;

    const ytdCases = cases.filter((c) => new Date(c.createdAt).getFullYear() === currentYear);
    const ytdValueMyr = ytdCases.reduce((sum, c) => sum + c.considerationMyr, 0);
    const openCount = cases.filter((c) => c.status !== 'decided').length;
    const circularOpenCount = cases.filter((c) => c.evaluation?.gate.key === 'circular' && c.status !== 'decided').length;
    const pendingSecondCount = cases.filter((c) => c.pendingApproval).length;

    // Latest case per party (by createdAt) that carries an aggregate — that
    // figure already is the party's current rolling 12-month exposure.
    const latestByParty = new Map<string, CaseSummary>();
    for (const c of [...cases].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) {
      if (c.evaluation?.aggregatePct !== null && c.evaluation?.aggregatePct !== undefined) latestByParty.set(c.party.id, c);
    }
    const watchlist = [...latestByParty.values()]
      .sort((a, b) => b.evaluation!.aggregatePct! - a.evaluation!.aggregatePct!)
      .slice(0, 6);

    const awaitingBoard = cases
      .filter((c) => c.evaluation?.gate.key === 'circular' && c.status !== 'decided')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const unconfirmedParties = parties.filter((p) => p.status === 'Unconfirmed');
    const oldestUnconfirmed = unconfirmedParties.length
      ? [...unconfirmedParties].sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime())[0]!
      : null;

    const cutoff = new Date(now.getTime() - windowDays * 24 * 3600 * 1000);
    const recentEvents = events.filter((e) => new Date(e.occurredAt) >= cutoff);
    const failedLogins = recentEvents.filter((e) => e.type === 'LoginFailed').length;
    const usersAdded = recentEvents.filter((e) => e.type === 'UserCreated').length;
    const usersRemoved = recentEvents.filter((e) => e.type === 'UserRemoved').length;

    const recentDecisions = cases
      .filter((c) => c.evaluation?.gate.key === 'circular' && c.decision)
      .sort((a, b) => new Date(b.decision!.decidedAt).getTime() - new Date(a.decision!.decidedAt).getTime())
      .slice(0, 5);

    return {
      threshold,
      ytdCount: ytdCases.length,
      ytdValueMyr,
      openCount,
      decidedCount: cases.length - openCount,
      circularOpenCount,
      pendingSecondCount,
      watchlist,
      awaitingBoard,
      unconfirmedCount: unconfirmedParties.length,
      oldestUnconfirmed,
      failedLogins,
      usersAdded,
      usersRemoved,
      activeUserCount: users.length,
      recentDecisions,
    };
  }, [ready, cases, events, users, parties, ruleSet, windowDays]);

  if (!ready || !stats) {
    return (
      <div style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-xl)' }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 26, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="kicker">As of {dateLabel(new Date().toISOString())} — a periodic read, not a live feed to act from</span>
      </div>

      <Blueprint className="board-kpis">
        <div className="stat-cell">
          <div className="stat-label">RPTs this year</div>
          <div className="stat-value">{stats.ytdCount}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Value YTD</div>
          <div className="stat-value">{fmtMyr(stats.ytdValueMyr)}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Open / decided</div>
          <div className="stat-value">
            {stats.openCount} / {stats.decidedCount}
          </div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">At the circular gate</div>
          <div className="stat-value" style={{ color: stats.circularOpenCount ? 'var(--color-error-text)' : undefined }}>
            {stats.circularOpenCount}
          </div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Awaiting 2nd sign-off</div>
          <div className="stat-value" style={{ color: stats.pendingSecondCount ? 'var(--color-warning-text)' : undefined }}>
            {stats.pendingSecondCount}
          </div>
        </div>
      </Blueprint>

      <div className="board-grid" style={{ gridTemplateColumns: '1.1fr 1fr' }}>
        <Blueprint style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
          <span className="kicker">Threshold watchlist — 12-month exposure by related party</span>
          {stats.watchlist.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-neutral-700)' }}>No party has a computed aggregate yet.</p>
          ) : (
            stats.watchlist.map((c) => {
              const pct = c.evaluation!.aggregatePct!;
              const atOrOver = pct >= stats.threshold;
              return (
                <div className="ratio-row" key={c.party.id}>
                  <div className="ratio-row-top">
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.party.name}</span>
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 700,
                        fontSize: 15,
                        fontVariantNumeric: 'tabular-nums',
                        color: atOrOver ? 'var(--color-error-text)' : 'var(--color-neutral-800)',
                      }}
                    >
                      {fmtPct(pct)}
                    </span>
                  </div>
                  <div className="ratio-bar-track">
                    <i
                      className="ratio-bar-fill"
                      style={{ width: `${Math.min(100, (pct / 8) * 100).toFixed(1)}%`, background: atOrOver ? 'var(--color-error)' : 'var(--color-accent)' }}
                    />
                    <span className="ratio-bar-gate" style={{ left: `${Math.min(100, (stats.threshold / 8) * 100).toFixed(1)}%` }} title={`${stats.threshold}% gate`} />
                  </div>
                </div>
              );
            })
          )}
        </Blueprint>

        <Blueprint style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
          <span className="kicker">Awaiting the Board</span>
          {stats.awaitingBoard.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-neutral-700)' }}>Nothing is sitting at the circular gate right now.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.awaitingBoard.map((c) => (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13.5 }}>{c.ref}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--color-neutral-600)' }}>{fmtMyr(c.considerationMyr)}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-neutral-800)' }}>
                    {c.nature} — {c.party.name}
                  </span>
                  <span className={`tag ${c.pendingApproval ? 'tag-warning' : 'tag-outline'}`} style={{ alignSelf: 'flex-start' }}>
                    {c.pendingApproval ? `1 of 2 sign-offs — by ${c.pendingApproval.actorLabel}` : 'No sign-off recorded yet'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Blueprint>
      </div>

      <div className="board-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Blueprint style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
          <span className="kicker">Register health</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 22 }}>{stats.unconfirmedCount}</span>
            <span style={{ fontSize: 12.5, color: 'var(--color-neutral-700)' }}>
              {stats.unconfirmedCount === 1 ? 'party' : 'parties'} still Unconfirmed
            </span>
          </div>
          {stats.oldestUnconfirmed && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-700)' }}>
              Oldest: <strong>{stats.oldestUnconfirmed.name}</strong>, proposed {dateLabel(stats.oldestUnconfirmed.effectiveFrom)}.
            </p>
          )}
        </Blueprint>

        <Blueprint style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="kicker">Control environment</span>
            <select
              className="input"
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              style={{ marginLeft: 'auto', minHeight: 30, fontSize: 11.5, padding: '2px 8px', width: 'auto' }}
            >
              {WINDOW_OPTIONS.map((o) => (
                <option key={o.days} value={o.days}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <div>
              <div className="stat-label">Failed logins</div>
              <div className="stat-value" style={{ fontSize: 17, color: stats.failedLogins ? 'var(--color-error-text)' : undefined }}>
                {stats.failedLogins}
              </div>
            </div>
            <div>
              <div className="stat-label">Accounts added</div>
              <div className="stat-value" style={{ fontSize: 17 }}>{stats.usersAdded}</div>
            </div>
            <div>
              <div className="stat-label">Accounts removed</div>
              <div className="stat-value" style={{ fontSize: 17 }}>{stats.usersRemoved}</div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--color-neutral-600)' }}>{stats.activeUserCount} accounts currently have access — see the Users tab.</p>
        </Blueprint>
      </div>

      <Blueprint style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
        <span className="kicker">Recent circular-gate decisions</span>
        {stats.recentDecisions.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-neutral-700)' }}>No circular-gate case has been decided yet.</p>
        ) : (
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Ref</th>
                <th style={{ textAlign: 'left' }}>Party</th>
                <th style={{ textAlign: 'left' }}>Decision</th>
                <th style={{ textAlign: 'left' }}>Decided</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentDecisions.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 600 }}>{c.ref}</td>
                  <td style={{ fontSize: 12.5 }}>{c.party.name}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--color-neutral-800)' }}>{c.decision!.label}</td>
                  <td style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{dateLabel(c.decision!.decidedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Blueprint>
    </div>
  );
}
