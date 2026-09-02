import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { BasisOption, CaseKind, KindOption, PartyRow, Thresholds } from '../../api/types';
import { Blueprint } from '../../components/Blueprint';
import { computeRatios, gateFor, topRatio } from '../../lib/materiality';
import { fmtPct } from '../../lib/format';

interface FormState {
  party: string;
  partyType: 'Person' | 'Entity';
  basisLabel: string;
  nature: string;
  kind: CaseKind;
  date: string;
  amount: string;
  na: string;
  ta: string;
  pbt: string;
  cap: string;
}

const EMPTY_FORM: FormState = {
  party: '',
  partyType: 'Entity',
  basisLabel: '',
  nature: '',
  kind: 'rpt_one_off',
  date: '',
  amount: '',
  na: '',
  ta: '',
  pbt: '',
  cap: '',
};

function toNum(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function Intake({
  kindOptions,
  basisOptions,
  ruleSet,
  prefillKind,
  onSubmitted,
}: {
  kindOptions: KindOption[];
  basisOptions: BasisOption[];
  ruleSet: { version: string; effectiveFrom: string; thresholds: Thresholds } | null;
  prefillKind: CaseKind | null;
  onSubmitted: (ref: string, note: string) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (prefillKind) setForm((f) => ({ ...f, kind: prefillKind }));
  }, [prefillKind]);
  const [matchedParty, setMatchedParty] = useState<PartyRow | null>(null);
  const [screeningDone, setScreeningDone] = useState(false);
  const [finFile, setFinFile] = useState<{ id: string; filename: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const name = form.party.trim();
    if (!name) {
      setMatchedParty(null);
      setScreeningDone(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const result = await api.listParties(name);
      if (cancelled) return;
      const exact = result.parties.find((p) => p.name.toLowerCase() === name.toLowerCase());
      setMatchedParty(exact ?? null);
      setScreeningDone(true);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [form.party]);

  const amount = toNum(form.amount);
  const fin = { netAssets: toNum(form.na), totalAssets: toNum(form.ta), profitBeforeTax: toNum(form.pbt), marketCap: toNum(form.cap) };
  const thresholds = ruleSet?.thresholds;
  const ratios = useMemo(() => (thresholds ? computeRatios(amount, fin, thresholds) : []), [amount, fin.netAssets, fin.totalAssets, fin.profitBeforeTax, fin.marketCap, thresholds]);
  const top = thresholds ? topRatio(ratios) : null;
  const gate = thresholds ? gateFor(top, thresholds) : null;
  const hasFinancials = fin.netAssets !== null || fin.totalAssets !== null || fin.profitBeforeTax !== null || fin.marketCap !== null;

  const missing: string[] = [];
  if (!form.party.trim()) missing.push('counterparty');
  if (!form.nature.trim()) missing.push('nature');
  if (!amount) missing.push('consideration');
  if (!matchedParty && form.party.trim() && !form.basisLabel) missing.push('basis of relationship');

  const submitLabel = missing.length
    ? `Complete ${missing.length} required field${missing.length > 1 ? 's' : ''}`
    : 'Submit for secretariat review';
  const submitHint = missing.length
    ? `Still needed: ${missing.join(', ')}.`
    : top === null
      ? 'Will submit with materiality deferred — no financial basis on file.'
      : `Will submit as: ${gate!.title.toLowerCase()}.`;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const doc = await api.uploadDocument(file);
      setFinFile({ id: doc.id, filename: doc.filename });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (missing.length || !amount) return;
    setSubmitting(true);
    setError('');
    try {
      const { case: kase, isNewParty } = await api.submitCase({
        party: form.party.trim(),
        partyType: form.partyType,
        basisLabel: matchedParty ? null : form.basisLabel || null,
        nature: form.nature.trim(),
        kind: form.kind,
        transactionDate: form.date || null,
        considerationMyr: amount,
        financials: fin,
        financialDocumentId: finFile?.id ?? null,
      });
      const note =
        (isNewParty ? `A register entry has been proposed for ${kase.party.name}.` : 'Counterparty matched in the register.') +
        ' ' +
        (kase.evaluation ? `${kase.evaluation.gate.title}.` : 'Materiality deferred — no financial basis.');
      setForm(EMPTY_FORM);
      setFinFile(null);
      setMatchedParty(null);
      setScreeningDone(false);
      onSubmitted(kase.ref, note);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  const writes = [
    { op: 'INSERT', table: 'intake.rpt_case', note: '1 row, status submitted' },
    {
      op: matchedParty ? 'UPDATE' : 'INSERT',
      table: matchedParty ? 'registry.party' : 'registry.party_relation',
      note: matchedParty ? 'usage read only' : '1 party + 1 unconfirmed edge',
    },
    { op: hasFinancials ? 'INSERT' : 'SKIP', table: 'materiality.financial_period', note: hasFinancials ? '1 row, unconfirmed' : 'no figures supplied' },
    { op: top === null ? 'SKIP' : 'INSERT', table: 'materiality.materiality_evaluation', note: top === null ? 'deferred' : 'ratios + gate, immutable' },
    { op: 'INSERT', table: 'audit.event', note: `${top === null ? 2 : 3} rows, hash-chained` },
  ];

  return (
    <div className="intake-body">
      <div className="intake-form-col">
        <div className="intake-form-scroll">
          <div className="field">
            <label htmlFor="cp">
              Counterparty <span style={{ color: 'var(--color-accent-700)' }}>· required</span>
            </label>
            <input className="input" id="cp" value={form.party} onChange={set('party')} placeholder="Legal name of the person or entity" />
          </div>

          {screeningDone && matchedParty && (
            <Blueprint style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, border: '1px solid var(--color-accent)', background: 'var(--color-accent-100)' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 13.5 }}>Already in the register</span>
              <span style={{ fontSize: 12, lineHeight: 1.45 }}>
                {matchedParty.name} — {matchedParty.basis}, effective from{' '}
                {new Date(matchedParty.effectiveFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}.{' '}
                {matchedParty.status === 'Unconfirmed' ? 'The edge is still unconfirmed, so the case will carry that caveat.' : 'Confirmed edge.'}
              </span>
            </Blueprint>
          )}
          {screeningDone && !matchedParty && form.party.trim() && (
            <Blueprint style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 13.5 }}>
                Not in the register — this submission will propose an entry
              </span>
              <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--color-neutral-800)' }}>
                Submitting inserts a <code>party</code> row and an unconfirmed <code>party_relation</code> edge for the
                secretariat to confirm. It is a proposal, never a direct write to the register (ADR-07).
              </span>
              <div className="intake-row-2">
                <div className="field">
                  <label htmlFor="ptype">Party type</label>
                  <select className="input" id="ptype" value={form.partyType} onChange={set('partyType')}>
                    <option value="Entity">Entity</option>
                    <option value="Person">Person</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="basis">
                    Basis of relationship <span style={{ color: 'var(--color-accent-700)' }}>· required</span>
                  </label>
                  <select className="input" id="basis" value={form.basisLabel} onChange={set('basisLabel')}>
                    <option value="">Select a basis…</option>
                    {basisOptions.map((b) => (
                      <option key={b.code} value={b.label}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </Blueprint>
          )}

          <div className="intake-row-2">
            <div className="field">
              <label htmlFor="nat">
                Nature of transaction <span style={{ color: 'var(--color-accent-700)' }}>· required</span>
              </label>
              <input className="input" id="nat" value={form.nature} onChange={set('nature')} placeholder="e.g. provision of haulage services" />
            </div>
            <div className="field">
              <label htmlFor="tdate">Transaction date</label>
              <input className="input" type="date" id="tdate" value={form.date} onChange={set('date')} />
            </div>
          </div>

          <div className="intake-row-2">
            <div className="field">
              <label htmlFor="kind">Classification</label>
              <select className="input" id="kind" value={form.kind} onChange={set('kind')}>
                {kindOptions.map((k) => (
                  <option key={k.code} value={k.code}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="amt">
                Consideration, RM million <span style={{ color: 'var(--color-accent-700)' }}>· required</span>
              </label>
              <input className="input" type="number" id="amt" min="0" step="0.1" value={form.amount} onChange={set('amount')} placeholder="0.0" />
            </div>
          </div>

          <Blueprint
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 12,
              border: `1px solid ${hasFinancials ? 'var(--color-accent)' : 'var(--color-divider)'}`,
              background: hasFinancials ? 'var(--color-accent-100)' : 'transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="kicker">Financial basis — the ratio denominators</span>
              <label htmlFor="fin" className="btn btn-secondary" style={{ marginLeft: 'auto', minHeight: 38, cursor: 'pointer' }}>
                {uploading ? 'Uploading…' : '↑ Upload balance sheet & P&L'}
              </label>
              <input type="file" id="fin" accept=".xlsx,.xls,.csv,.pdf" onChange={handleUpload} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
            </div>
            <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--color-neutral-800)' }}>
              {finFile
                ? `${finFile.filename} attached and hashed. Key the four figures below as they appear in the statements — extraction is assistive only, and nothing may cite them until the secretariat confirms the period (ADR-06).`
                : 'No financial basis on file. Upload the balance sheet and P&L, or key the figures, before materiality can be evaluated. Market capitalisation is in neither statement and must come from a price source.'}
            </span>
            <div className="intake-row-2">
              <div className="field">
                <label htmlFor="fna">Net assets, RM m</label>
                <input className="input" id="fna" type="number" step="0.1" value={form.na} onChange={set('na')} placeholder="from balance sheet" />
              </div>
              <div className="field">
                <label htmlFor="fta">Total assets, RM m</label>
                <input className="input" id="fta" type="number" step="0.1" value={form.ta} onChange={set('ta')} placeholder="from balance sheet" />
              </div>
              <div className="field">
                <label htmlFor="fpbt">Profit before tax, RM m</label>
                <input className="input" id="fpbt" type="number" step="0.1" value={form.pbt} onChange={set('pbt')} placeholder="from P&amp;L" />
              </div>
              <div className="field">
                <label htmlFor="fcap">Market capitalisation, RM m</label>
                <input className="input" id="fcap" type="number" step="0.1" value={form.cap} onChange={set('cap')} placeholder="not in the statements" />
              </div>
            </div>
          </Blueprint>
          {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-accent-900)' }}>{error}</p>}
        </div>

        <div className="intake-submit-bar">
          <button
            className="btn btn-primary blueprint"
            disabled={missing.length > 0 || submitting}
            onClick={submit}
            style={{ minHeight: 46, padding: '0 20px', flex: '1 1 240px', justifyContent: 'center' }}
          >
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            {submitting ? 'Submitting…' : submitLabel}
          </button>
          <button
            className="btn btn-ghost"
            style={{ minHeight: 46 }}
            onClick={() => {
              setForm(EMPTY_FORM);
              setFinFile(null);
              setMatchedParty(null);
              setScreeningDone(false);
              setError('');
            }}
          >
            Clear form
          </button>
          <span style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-neutral-600)', flex: '1 1 160px' }}>{submitHint}</span>
        </div>
      </div>

      <div className="intake-side">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="kicker">Percentage ratio tests · MMLR 10.02(g)</span>
          <span style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>
            {hasFinancials ? `Live, from rule set ${ruleSet?.version}` : 'Awaiting denominators'}
          </span>
        </div>
        <Blueprint style={{ display: 'flex', flexDirection: 'column' }}>
          {ratios.map((t) => (
            <div className="ratio-row" key={t.code}>
              <div className="ratio-row-top">
                <span style={{ fontSize: 12, color: 'var(--color-neutral-800)' }}>{t.label}</span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 600,
                    fontSize: 16,
                    fontVariantNumeric: 'tabular-nums',
                    color: t.pct === null ? 'var(--color-neutral-500)' : t.pct >= 5 ? 'var(--color-accent-900)' : t.pct >= 0.25 ? 'var(--color-accent-800)' : 'var(--color-neutral-700)',
                  }}
                >
                  {t.pct === null ? '—' : fmtPct(t.pct)}
                </span>
              </div>
              <div className="ratio-bar-track">
                <i
                  className="ratio-bar-fill"
                  style={{
                    width: `${t.pct === null ? 0 : Math.min(100, (t.pct / 8) * 100).toFixed(1)}%`,
                    background: t.pct !== null && t.pct >= 5 ? 'var(--color-accent-900)' : 'var(--color-accent)',
                  }}
                />
                <span className="ratio-bar-gate" />
              </div>
            </div>
          ))}
        </Blueprint>
        {gate && (
          <Blueprint
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 13,
              border: `1px solid ${gate.key === 'circular' ? 'var(--color-accent-900)' : gate.key === 'announce' ? 'var(--color-accent)' : 'var(--color-divider)'}`,
              background: gate.key === 'circular' ? 'var(--color-accent-900)' : gate.key === 'announce' ? 'var(--color-accent-100)' : 'transparent',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 600,
                fontSize: 16,
                lineHeight: 1.15,
                color: gate.key === 'circular' ? '#fff' : gate.key === 'announce' ? 'var(--color-accent-900)' : 'var(--color-text)',
              }}
            >
              {gate.title}
            </span>
            <span
              style={{
                fontSize: 12.5,
                lineHeight: 1.5,
                color: gate.key === 'circular' ? '#fff' : gate.key === 'announce' ? 'var(--color-accent-900)' : 'var(--color-text)',
              }}
            >
              {gate.body}
            </span>
          </Blueprint>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="kicker">What submitting writes</span>
          {writes.map((w) => (
            <div className="write-row" key={w.table}>
              <span className="write-op">{w.op}</span>
              <span className="write-table">{w.table}</span>
              <span className="write-note">{w.note}</span>
            </div>
          ))}
          <span style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-neutral-600)' }}>
            All of it in one transaction. If any row fails, nothing is written and the submitter keeps the form — a
            half-registered transaction is worse than none.
          </span>
        </div>
      </div>
    </div>
  );
}
