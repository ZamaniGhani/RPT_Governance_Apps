import { useState } from 'react';
import type { CaseKind } from '../../api/types';
import { Blueprint } from '../../components/Blueprint';
import { EXAMPLES, VERDICTS, classify, type GuidanceAnswers } from './guidanceData';

const EMPTY: GuidanceAnswers = { related: null, repeat: null, ordinary: null };

const KIND_FOR_VERDICT: Record<string, CaseKind> = {
  rrpt: 'rrpt',
  rptRecurring: 'rpt_recurring_non_ordinary',
  rpt: 'rpt_one_off',
};

export function Guidance({ onStartIntake }: { onStartIntake: (kind: CaseKind) => void }) {
  const [g, setG] = useState<GuidanceAnswers>(EMPTY);
  const [exampleId, setExampleId] = useState('');

  const key = classify(g);
  const verdict = VERDICTS[key];
  const answered = g.related !== null;
  const canStart = key === 'rpt' || key === 'rptRecurring' || key === 'rrpt';

  function answer(field: keyof GuidanceAnswers, value: boolean) {
    setG((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'related' && value === false) {
        next.repeat = null;
        next.ordinary = null;
      }
      if (field === 'repeat' && value === false) next.ordinary = null;
      return next;
    });
    setExampleId('');
  }

  function reset() {
    setG(EMPTY);
    setExampleId('');
  }

  function runExample(id: string) {
    const x = EXAMPLES.find((e) => e.id === id);
    if (x) {
      setG(x.a);
      setExampleId(id);
    }
  }

  function startIntake() {
    onStartIntake(KIND_FOR_VERDICT[key] ?? 'rpt_one_off');
  }

  const steps = [
    {
      n: '01',
      q: 'Is the counterparty a related party?',
      hint: 'A director, major shareholder, a person connected to either, or an entity they control. Tested as at the transaction date.',
      answer: g.related,
      active: true,
      field: 'related' as const,
    },
    {
      n: '02',
      q: 'Does it happen repeatedly?',
      hint: 'Recurrent means a continuing stream of like transactions with the same party, not a single contract paid in instalments.',
      answer: g.repeat,
      active: g.related === true,
      field: 'repeat' as const,
      yesText: 'Yes — recurring',
      noText: 'No — one-off',
    },
    {
      n: '03',
      q: 'Is it in the ordinary course of business?',
      hint: "The group's own trade, on commercial terms. Asset transfers, funding and advisory work are not ordinary course.",
      answer: g.ordinary,
      active: g.related === true && g.repeat === true,
      field: 'ordinary' as const,
      yesText: 'Yes — trade activity',
      noText: 'No',
    },
  ];

  const terminals = [
    { label: 'Not RPT', on: g.related === false },
    { label: 'RPT', on: key === 'rpt' || key === 'rptRecurring', reach: key === 'rptRecurring' ? 'Recurring, No at question 3' : 'No at question 2' },
    { label: 'RRPT', on: key === 'rrpt', reach: 'Yes throughout' },
  ];

  return (
    <div className="guidance-body">
      <div className="guidance-main">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="kicker">Decision flow</span>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, maxWidth: 560 }}>
            Three questions decide the classification, and the classification decides which obligations attach. Answer
            them here, or run one of the worked examples on the right to see the path light up.
          </p>
        </div>

        {steps.map((s) => (
          <Blueprint
            key={s.n}
            style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 13, borderLeft: `2px solid ${s.active ? 'var(--color-accent)' : 'var(--color-divider)'}`, opacity: s.active ? 1 : 0.4 }}
          >
            <div className="guidance-step-head">
              <span className="guidance-step-n">{s.n}</span>
              <span className="guidance-step-q">{s.q}</span>
            </div>
            <span className="guidance-step-hint">{s.hint}</span>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                disabled={!s.active}
                onClick={() => answer(s.field, false)}
                style={{
                  minHeight: 42,
                  background: s.answer === false ? 'var(--color-accent-900)' : 'transparent',
                  color: s.answer === false ? '#fff' : 'var(--color-text)',
                }}
              >
                {s.noText ?? 'No'}
              </button>
              <button
                className="btn btn-secondary"
                disabled={!s.active}
                onClick={() => answer(s.field, true)}
                style={{
                  minHeight: 42,
                  background: s.answer === true ? 'var(--color-accent-900)' : 'transparent',
                  color: s.answer === true ? '#fff' : 'var(--color-text)',
                }}
              >
                {s.yesText ?? 'Yes — in the register'}
              </button>
            </div>
          </Blueprint>
        ))}

        <div className="guidance-terminals">
          {terminals.map((t) => (
            <div
              key={t.label}
              className="guidance-terminal"
              style={{ borderColor: t.on ? 'var(--color-accent-900)' : 'var(--color-divider)', background: t.on ? 'var(--color-accent-900)' : 'transparent' }}
            >
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 18, lineHeight: 1, color: t.on ? '#fff' : 'var(--color-neutral-600)' }}>{t.label}</span>
              <span style={{ fontSize: 11, lineHeight: 1.4, color: t.on ? '#fff' : 'var(--color-neutral-600)' }}>{t.reach ?? 'No at question 1'}</span>
            </div>
          ))}
        </div>

        <Blueprint
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
            padding: 13,
            border: `1px solid ${key === 'none' ? 'var(--color-divider)' : 'var(--color-accent)'}`,
            background: key === 'none' ? 'transparent' : 'var(--color-accent-100)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 18, lineHeight: 1.15 }}>{verdict.label}</span>
            <span className="tag tag-outline">Chapter 10</span>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>{verdict.body}</p>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', paddingTop: 4 }}>
            {canStart && (
              <button className="btn btn-primary blueprint" onClick={startIntake} style={{ minHeight: 44, padding: '0 16px' }}>
                <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
                {key === 'rrpt' ? 'Start Intake as recurrent (RRPT)' : key === 'rptRecurring' ? 'Start Intake as recurring, approved individually' : 'Start Intake as one-off (RPT)'}
              </button>
            )}
            {answered && (
              <button className="btn btn-ghost" onClick={reset} style={{ minHeight: 44 }}>
                Start over
              </button>
            )}
          </div>
        </Blueprint>
      </div>

      <div className="guidance-side">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="kicker">Worked examples</span>
          <span style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>Illustrative only — these are teaching cases, not records</span>
        </div>
        {EXAMPLES.map((x) => (
          <button key={x.id} className={`guidance-example${exampleId === x.id ? ' active' : ''}`} onClick={() => runExample(x.id)}>
            <span className="guidance-example-title">{x.title}</span>
            <span className="guidance-example-note">{x.note}</span>
          </button>
        ))}
        <p style={{ margin: '4px 0 0', fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-neutral-700)' }}>
          The flow settles classification only. Materiality is a separate test: an RPT still has to pass the
          percentage-ratio thresholds in Intake, and an RRPT still consumes mandate headroom. Classification never
          substitutes for the ratio calculation.
        </p>
      </div>
    </div>
  );
}
