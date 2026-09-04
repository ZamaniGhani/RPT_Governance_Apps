import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { CaseSummary } from '../../api/types';
import { Blueprint } from '../../components/Blueprint';
import { dateLabel, fmtMyr, fmtPct, relativeAge } from '../../lib/format';

type Filter = 'all' | 'open' | 'done';

function gateTagClass(key: string | undefined): string {
  if (key === 'circular') return 'tag tag-error';
  if (key === 'announce') return 'tag tag-warning';
  if (key === 'record') return 'tag tag-neutral';
  return 'tag tag-outline';
}

function decisionTagClass(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('reject')) return 'tag-error';
  if (l.includes('further information')) return 'tag-warning';
  return 'tag-success';
}

function gateShortLabel(c: CaseSummary): string {
  const g = c.evaluation?.gate.key;
  if (g === 'circular') return '5% · circular';
  if (g === 'announce') return '0.25% · announce';
  if (g === 'record') return 'Below thresholds';
  return 'Basis required';
}

export function Alerts({
  cases,
  selId,
  onSelect,
  onGoIntake,
  onChanged,
  canDecide,
}: {
  cases: CaseSummary[] | null;
  selId: string | null;
  onSelect: (id: string) => void;
  onGoIntake: () => void;
  onChanged: () => Promise<void>;
  canDecide: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRationale('');
  }, [selId]);

  if (cases === null) {
    return (
      <div className="alerts-body">
        <div className="alerts-queue">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 76, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        </div>
        <div className="alerts-detail" />
      </div>
    );
  }

  const openCount = cases.filter((c) => c.status !== 'decided').length;
  const doneCount = cases.length - openCount;
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: cases.length },
    { id: 'open', label: 'Open', count: openCount },
    { id: 'done', label: 'Decided', count: doneCount },
  ];
  const visible = cases.filter((c) => filter === 'all' || (filter === 'open' ? c.status !== 'decided' : c.status === 'decided'));
  const sel = cases.find((c) => c.id === selId) ?? null;

  async function act(decision: 'approve' | 'reject' | 'refer') {
    if (!sel) return;
    setBusy(true);
    try {
      await api.decideCase(sel.id, decision, rationale.trim() || null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!sel) return;
    setBusy(true);
    try {
      await api.reopenCase(sel.id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  const approveLabel =
    sel?.evaluation?.gate.key === 'circular'
      ? 'Escalate to circular'
      : sel?.evaluation?.gate.key === 'announce'
        ? 'Approve for announcement'
        : 'Record as reviewed';

  const nextStep =
    sel?.evaluation?.gate.key === 'circular'
      ? 'Draft circular; appoint independent adviser'
      : sel?.evaluation?.gate.key === 'announce'
        ? 'Secretariat drafts the Bursa announcement'
        : 'Recorded in the annual RPT schedule';

  return (
    <div className="alerts-body">
      <div className="alerts-queue">
        <div className="alerts-filters">
          {filters.map((f) => (
            <button key={f.id} className={`alerts-filter${filter === f.id ? ' active' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label} <span>{f.count}</span>
            </button>
          ))}
        </div>
        <div className="alerts-list">
          {visible.map((c) => (
            <button key={c.id} className={`case-row${selId === c.id ? ' selected' : ''}`} onClick={() => onSelect(c.id)}>
              <span className="case-row-top">
                {c.ref}
                <span style={{ marginLeft: 'auto' }}>{relativeAge(c.createdAt)}</span>
              </span>
              <span className="case-row-title">
                {c.nature} — {(c.evaluation?.gate.title ?? 'Awaiting inputs').toLowerCase()}
              </span>
              <span className="case-row-meta">
                {c.party.name} · {fmtMyr(c.considerationMyr)}
              </span>
              <span className="case-row-tags">
                <span className={gateTagClass(c.evaluation?.gate.key)}>{gateShortLabel(c)}</span>
                <span className="tag tag-outline">
                  {c.evaluation?.topPct !== null && c.evaluation?.topPct !== undefined ? fmtPct(c.evaluation.topPct) : 'not computed'}
                </span>
              </span>
            </button>
          ))}
          {cases.length === 0 && (
            <div className="empty-state">
              <span className="empty-state-title">Queue is empty</span>
              <span className="empty-state-body">
                Nothing has been submitted yet. Cases arrive here the moment a submitter completes Intake — there is no other
                way in, which is what makes the audit chain complete.
              </span>
              <button className="btn btn-secondary" style={{ alignSelf: 'flex-start', minHeight: 40, marginTop: 4 }} onClick={onGoIntake}>
                Open Intake
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="alerts-detail">
        {sel ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="kicker">
                {sel.kindLabel} · {sel.ref}
              </span>
              <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>{sel.nature}</h2>
              <span style={{ fontSize: 12.5, color: 'var(--color-neutral-700)' }}>
                {sel.party.name} — {sel.party.relationLabel}
              </span>
            </div>

            <Blueprint className="stat-grid">
              <div className="stat-cell">
                <div className="stat-label">Consideration</div>
                <div className="stat-value">{fmtMyr(sel.considerationMyr)}</div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">Highest ratio</div>
                <div className="stat-value" style={{ color: 'var(--color-accent-800)' }}>
                  {sel.evaluation?.topPct !== null && sel.evaluation?.topPct !== undefined ? fmtPct(sel.evaluation.topPct) : 'not computed'}
                </div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">Aggregated 12 mth</div>
                <div className="stat-value">
                  {sel.evaluation?.aggregatePct !== null && sel.evaluation?.aggregatePct !== undefined ? fmtPct(sel.evaluation.aggregatePct) : '—'}
                </div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">Transaction date</div>
                <div className="stat-value">{dateLabel(sel.transactionDate)}</div>
              </div>
            </Blueprint>

            <Blueprint style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 13 }}>
              <span className="kicker">Evaluation stored with this case</span>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
                {sel.evaluation?.gate.body ?? 'A consideration and at least one denominator are needed before any ratio can be computed.'}
                {sel.evaluation?.aggregateMyr !== null &&
                sel.evaluation?.aggregateMyr !== undefined &&
                sel.evaluation.aggregateMyr > sel.considerationMyr
                  ? ` Aggregated with ${fmtMyr(sel.evaluation.aggregateMyr - sel.considerationMyr)} of earlier transactions with this party inside the rolling twelve months.`
                  : ''}
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '4px 12px',
                  fontSize: 12,
                  paddingTop: 8,
                  borderTop: '1px solid var(--color-divider)',
                }}
              >
                <span style={{ color: 'var(--color-neutral-700)' }}>Rule set pinned</span>
                <span>{sel.ruleSetVersion}</span>
                <span style={{ color: 'var(--color-neutral-700)' }}>Financial basis</span>
                <span>
                  {sel.financialBasis.label ? `${sel.financialBasis.label} · ${sel.financialBasis.status}` : 'none on file'}
                </span>
                <span style={{ color: 'var(--color-neutral-700)' }}>Route version</span>
                <span>{sel.routeVersion}</span>
              </div>
            </Blueprint>

            {sel.decision ? (
              <Blueprint
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 14,
                  border: `1px solid var(--color-${decisionTagClass(sel.decision.label).replace('tag-', '')}-border)`,
                  background: `var(--color-${decisionTagClass(sel.decision.label).replace('tag-', '')}-bg)`,
                }}
              >
                <span
                  className={`tag ${decisionTagClass(sel.decision.label)}`}
                  style={{ alignSelf: 'flex-start', fontSize: 13, padding: '5px 12px' }}
                >
                  {sel.decision.label}
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', fontSize: 12 }}>
                  <span style={{ color: 'var(--color-neutral-700)' }}>Decided by</span>
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 }}>{sel.decision.actor}</span>
                  <span style={{ color: 'var(--color-neutral-700)' }}>Next step</span>
                  <span>{nextStep}</span>
                </div>
                {canDecide && (
                  <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} disabled={busy} onClick={reopen}>
                    Reopen case
                  </button>
                )}
              </Blueprint>
            ) : canDecide ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="field">
                  <label htmlFor="rationale">Rationale for the record</label>
                  <input
                    className="input"
                    id="rationale"
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                    placeholder="Why this decision, in the words that will appear in the minutes"
                  />
                </div>
                <div className="decision-buttons">
                  <button className="btn btn-primary blueprint" style={{ minHeight: 44, padding: '0 18px' }} disabled={busy} onClick={() => act('approve')}>
                    <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
                    {approveLabel}
                  </button>
                  <button className="btn btn-secondary" style={{ minHeight: 44 }} disabled={busy} onClick={() => act('reject')}>
                    Reject
                  </button>
                  <button className="btn btn-secondary" style={{ minHeight: 44 }} disabled={busy} onClick={() => act('refer')}>
                    Return for information
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: 'var(--color-neutral-600)' }}>
                  Interested parties are excluded from a case automatically; quorum is recomputed without them.
                </p>
              </div>
            ) : (
              <Blueprint style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 13 }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14 }}>Decisions require Compliance access</span>
                <span style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-neutral-700)' }}>
                  Your account can view this case's evaluation but not approve, reject or reopen it.
                </span>
              </Blueprint>
            )}
          </div>
        ) : cases.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17 }}>No case selected</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-neutral-700)' }}>
              Pick a case from the queue to see the evaluation that was stored with it — the ratios, the rule set and the
              financial period it was judged against — and to record a decision.
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
