export interface GuidanceAnswers {
  related: boolean | null;
  repeat: boolean | null;
  ordinary: boolean | null;
}

export interface WorkedExample {
  id: string;
  title: string;
  note: string;
  a: GuidanceAnswers;
}

export const EXAMPLES: WorkedExample[] = [
  {
    id: 'ex1',
    title: "Monthly haulage contract with a company owned by the Managing Director's spouse",
    note: "Recurring, commercial, in the ordinary course of the group's logistics operations.",
    a: { related: true, repeat: true, ordinary: true },
  },
  {
    id: 'ex2',
    title: 'One-off purchase of a plot of land from a non-executive director',
    note: 'A single asset acquisition, not something the group does day to day.',
    a: { related: true, repeat: false, ordinary: null },
  },
  {
    id: 'ex3',
    title: 'Restructuring advisory fee to a firm in which a director is a partner',
    note: "Repeats across the engagement, but corporate restructuring is not the group's trade.",
    a: { related: true, repeat: true, ordinary: false },
  },
  {
    id: 'ex4',
    title: 'Office stationery bought from an unrelated supplier on a framework contract',
    note: 'No relationship exists — the first question ends it.',
    a: { related: false, repeat: null, ordinary: null },
  },
];

export type VerdictKey = 'none' | 'not' | 'rpt' | 'rptRecurring' | 'rrpt';

export const VERDICTS: Record<VerdictKey, { label: string; body: string; tag: string }> = {
  none: {
    label: 'Answer the questions',
    body: "Work down the flow. Each answer narrows the classification, and the classification decides which of Chapter 10's obligations attach.",
    tag: '',
  },
  not: {
    label: 'Not a related party transaction',
    body: 'Chapter 10 does not attach. Record it in the ordinary procurement trail if internal policy requires, but no announcement, circular or mandate applies. Re-test if the counterparty later enters the register — relatedness is effective-dated, so a transaction is judged on the position at its own date.',
    tag: 'tag tag-neutral',
  },
  rpt: {
    label: 'RPT — one-off related party transaction',
    body: 'Run the four percentage-ratio tests under 10.02(g). Below 5% it is recorded only; at 5% or above it needs an immediate announcement, a circular, an independent adviser and shareholder approval, with interested directors and major shareholders abstaining. Either way it joins the twelve-month aggregation window for this party.',
    tag: 'tag tag-accent',
  },
  rptRecurring: {
    label: 'RPT — recurring, but outside the RRPT regime',
    body: 'It repeats, but it is not the group’s ordinary trade, so it cannot sit under an AGM mandate. Each occurrence is approved individually as an RPT and run through the percentage-ratio tests, and because the occurrences share a counterparty they aggregate fast inside the twelve-month window — the second or third instalment is what usually crosses 5%. Test the aggregate, not just the invoice in front of you.',
    tag: 'tag tag-accent',
  },
  rrpt: {
    label: 'RRPT — recurrent related party transaction',
    body: 'Recurrent and in the ordinary course of business, so it belongs under a shareholder mandate obtained at the AGM (10.09) rather than being approved one by one. Each transaction consumes mandate headroom; exceeding the ceiling means a fresh mandate, and the aggregate is disclosed in the annual report.',
    tag: 'tag tag-accent',
  },
};

export function classify(g: GuidanceAnswers): VerdictKey {
  if (g.related === false) return 'not';
  if (g.related === true && g.repeat === false) return 'rpt';
  if (g.related === true && g.repeat === true && g.ordinary === false) return 'rptRecurring';
  if (g.related === true && g.repeat === true && g.ordinary === true) return 'rrpt';
  return 'none';
}
