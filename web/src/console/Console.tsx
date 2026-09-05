import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, UnauthorizedError } from '../api/client';
import type { AuditEvent, BasisOption, CaseKind, CaseSummary, CurrentUser, KindOption, PartyRow, Thresholds, UserAccount } from '../api/types';
import { Icon } from '../components/Icon';
import { Alerts } from './tabs/Alerts';
import { Board } from './tabs/Board';
import { Intake } from './tabs/Intake';
import { Register } from './tabs/Register';
import { AuditTrail } from './tabs/AuditTrail';
import { Guidance } from './tabs/Guidance';
import { Users } from './tabs/Users';

export type TabId = 'board' | 'alerts' | 'intake' | 'register' | 'audit' | 'guidance' | 'users';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

const TABS: { id: TabId; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'board', label: 'Board', icon: 'board' },
  { id: 'alerts', label: 'Alerts', icon: 'alerts' },
  { id: 'intake', label: 'Intake', icon: 'intake' },
  { id: 'register', label: 'Register', icon: 'register' },
  { id: 'audit', label: 'Audit', icon: 'audit' },
  { id: 'guidance', label: 'Guidance', icon: 'guidance' },
  { id: 'users', label: 'Users', icon: 'users' },
];

const HEADS: Record<TabId, [string, (ctx: { openCount: number; hasCases: boolean; hasParties: boolean; userCount: number }) => string]> = {
  board: ['Board dashboard', () => 'periodic oversight summary, not a live feed to act from'],
  alerts: ['Alerts & approvals', (ctx) => (ctx.hasCases ? `${ctx.openCount} open` : 'nothing submitted yet')],
  intake: ['New transaction', () => 'screening runs as you type'],
  register: ['Related party register', (ctx) => (ctx.hasParties ? 'effective-dated, queryable as at any date' : 'no parties recorded')],
  audit: ['Audit trail', () => 'append-only event log'],
  guidance: ['Guidance — RPT or RRPT', () => 'decision flow, MMLR Chapter 10'],
  users: ['Users', (ctx) => `${ctx.userCount} account${ctx.userCount === 1 ? '' : 's'} with access`],
};

export function Console({ user, onSignedOut }: { user: CurrentUser; onSignedOut: () => void }) {
  const canUse = useCallback((...departments: CurrentUser['department'][]) => user.department === 'admin' || departments.includes(user.department), [user.department]);
  const [tab, setTab] = useState<TabId>('alerts');
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [users, setUsers] = useState<UserAccount[] | null>(null);
  const [partyRows, setPartyRows] = useState<PartyRow[] | null>(null);
  const [totalParties, setTotalParties] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);
  const [banner, setBanner] = useState('');
  const [kindOptions, setKindOptions] = useState<KindOption[]>([]);
  const [basisOptions, setBasisOptions] = useState<BasisOption[]>([]);
  const [ruleSet, setRuleSet] = useState<{ version: string; effectiveFrom: string; thresholds: Thresholds } | null>(null);
  const [prefillKind, setPrefillKind] = useState<CaseKind | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [caseRows, eventRows, parties, userRows] = await Promise.all([api.listCases(), api.listEvents(), api.listParties(''), api.listUsers()]);
      setCases(caseRows);
      setEvents(eventRows);
      setTotalParties(parties.totalParties);
      setPartyRows(parties.parties);
      setUsers(userRows);
    } catch (err) {
      if (err instanceof UnauthorizedError) onSignedOut();
      else throw err;
    }
  }, [onSignedOut]);

  useEffect(() => {
    refresh();
    api.intakeMeta().then((m) => {
      setKindOptions(m.kindOptions);
      setRuleSet(m.ruleSet);
    });
    api.registryMeta().then((m) => setBasisOptions(m.basisOptions));
  }, [refresh]);

  const openCount = useMemo(() => (cases ?? []).filter((c) => c.status !== 'decided').length, [cases]);

  const awaitingBoardCount = useMemo(
    () => (cases ?? []).filter((c) => c.evaluation?.gate.key === 'circular' && c.status !== 'decided').length,
    [cases]
  );

  const counts: Record<TabId, string> = {
    board: cases && awaitingBoardCount ? String(awaitingBoardCount) : '',
    alerts: cases ? String(openCount) : '',
    intake: '',
    register: totalParties ? String(totalParties) : '',
    audit: events?.length ? String(events.length) : '',
    guidance: '',
    users: users?.length ? String(users.length) : '',
  };

  const [headTitle, headNoteFn] = HEADS[tab];
  const headNote = headNoteFn({ openCount, hasCases: !!cases?.length, hasParties: totalParties > 0, userCount: users?.length ?? 0 });

  async function handleSubmitted(ref: string, note: string) {
    setBanner(`${ref} submitted. ${note}`);
    setTab('alerts');
    await refresh();
  }

  return (
    <div className="console-page">
      <div className="console">
        <nav className="rail">
          <div className="rail-brand">
            <div className="rail-brand-name">RPT GOVERNANCE</div>
            <div className="rail-brand-entity">Demo Group Berhad</div>
            {import.meta.env.MODE === 'demo' && (
              <span className="tag tag-outline rail-demo-badge" style={{ marginTop: 8 }}>
                Static demo · mock data
              </span>
            )}
          </div>
          <div className="rail-nav">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`rail-item${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
                title={t.label}
              >
                <Icon name={t.icon} />
                <span className="rail-item-label">{t.label}</span>
                <span className="rail-item-count">{counts[t.id]}</span>
              </button>
            ))}
          </div>
          <div className="rail-footer">
            <div className="rail-footer-label">Rule set</div>
            <div className="rail-footer-value">{ruleSet ? ruleSet.version.replace('-', ' ') : '—'}</div>
            <div className="rail-footer-meta">
              {ruleSet ? `effective ${new Date(ruleSet.effectiveFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
            </div>
          </div>
        </nav>

        <div className="panel">
          <div className="panel-header">
            <h1>{headTitle}</h1>
            <span className="tag tag-outline">{headNote}</span>
            <div className="panel-header-actions">
              {tab !== 'intake' && tab !== 'guidance' && tab !== 'users' && tab !== 'board' && (
                <button
                  className="btn btn-secondary"
                  disabled={!cases?.length}
                  onClick={() => api.downloadExport()}
                  style={{ minHeight: 38 }}
                >
                  ↓ Export to Excel
                </button>
              )}
              <span className="panel-user">
                {user.displayName} · {user.departmentLabel}
              </span>
              <span className="panel-avatar" title={`${user.displayName} · ${user.departmentLabel}`}>
                {initials(user.displayName)}
              </span>
              <button className="btn btn-ghost" style={{ minHeight: 34 }} onClick={onSignedOut}>
                Sign out
              </button>
            </div>
          </div>

          {banner && (
            <div className="banner">
              <span>{banner}</span>
              <button className="btn btn-ghost" style={{ marginLeft: 'auto', minHeight: 34 }} onClick={() => setBanner('')}>
                Dismiss
              </button>
            </div>
          )}

          {tab === 'board' && <Board cases={cases} events={events} users={users} parties={partyRows} ruleSet={ruleSet} />}
          {tab === 'alerts' && (
            <Alerts
              cases={cases}
              selId={selId}
              onSelect={setSelId}
              onGoIntake={() => setTab('intake')}
              onChanged={refresh}
              canDecide={canUse('compliance')}
              currentUserDisplayName={user.displayName}
            />
          )}
          {tab === 'intake' && (
            <Intake
              kindOptions={kindOptions}
              basisOptions={basisOptions}
              ruleSet={ruleSet}
              prefillKind={prefillKind}
              onSubmitted={handleSubmitted}
              canSubmit={canUse('finance')}
            />
          )}
          {tab === 'register' && <Register onChanged={refresh} canAdminister={canUse('secretariat')} />}
          {tab === 'audit' && <AuditTrail events={events} exportDisabled={!cases?.length} />}
          {tab === 'guidance' && (
            <Guidance
              onStartIntake={(kind) => {
                setPrefillKind(kind);
                setTab('intake');
              }}
            />
          )}
          {tab === 'users' && <Users users={users} onChanged={refresh} canManage={canUse('admin')} currentUserId={user.id} />}
        </div>
      </div>
    </div>
  );
}
