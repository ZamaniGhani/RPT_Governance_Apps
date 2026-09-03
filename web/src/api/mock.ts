import type { Api } from './client';
import { computeRatios, gateFor, topRatio } from '../lib/materiality';
import type {
  AuditEvent,
  BasisOption,
  CaseKind,
  CaseSummary,
  Gate,
  KindOption,
  PartyRow,
  RatioResult,
  SubmitCasePayload,
  Thresholds,
  UploadedDocument,
} from './types';

/**
 * A self-contained, in-memory stand-in for server/src used only by the
 * static demo build (see vite.demo.config.ts). Same shape as api/client.ts
 * so the console components are none the wiser — the only thing that
 * differs is where the data lives. Reuses the real ratio/gate engine
 * (lib/materiality.ts) so the numbers behave identically to the live app.
 */

const RULE_SET = { version: 'MMLR-CH10 v2026.1', effectiveFrom: '2026-01-01T00:00:00Z' };
const ROUTE_VERSION = 'RPT-STD v1';
const THRESHOLDS: Thresholds = { announceThreshold: 0.25, circularThreshold: 5, profitAttributableFactor: 0.14 };

const KIND_OPTIONS: KindOption[] = [
  { code: 'rpt_one_off', label: 'One-off related party transaction' },
  { code: 'rrpt', label: 'Recurrent related party transaction' },
  { code: 'rpt_recurring_non_ordinary', label: 'Recurring transaction outside the RRPT mandate regime' },
];

const BASIS_OPTIONS: BasisOption[] = [
  { code: 'spouse', label: 'Spouse of a director' },
  { code: 'child', label: 'Child or parent of a director' },
  { code: 'director', label: 'Director in common' },
  { code: 'shareholder', label: 'Major shareholder — 5% or more' },
  { code: 'control', label: 'Controlled by a director or major shareholder' },
  { code: 'associate', label: 'Associate of the group' },
];

const APPROVE_LABEL_BY_GATE: Record<string, string> = {
  circular: 'Escalate to circular',
  announce: 'Approve for announcement',
  record: 'Record as reviewed',
  none: 'Record as reviewed',
};

let seq = 0;
const rid = (prefix: string) => `${prefix}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function daysAgo(n: number, hour = 10): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 15, 0, 0);
  return d.toISOString();
}

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Deterministic 64-hex "hash" — not cryptographic, just plausible-looking and stable per input. */
function fakeHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = (h1 ^ c) * 0x01000193;
    h2 = (h2 * 33) ^ c;
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return (hex(h1) + hex(h2) + hex(h1 ^ h2) + hex(h1 + h2) + hex(h1 * 3 + 7) + hex(h2 * 5 + 11) + hex(h1 ^ 0x5a5a5a5a) + hex(h2 ^ 0xa5a5a5a5)).slice(0, 64);
}

interface Party {
  id: string;
  name: string;
  type: 'Person' | 'Entity';
  basis: string;
  effectiveFrom: string;
  confirmed: boolean;
}

const parties: Party[] = [
  { id: rid('party_'), name: 'Sinar Logistics Sdn Bhd', type: 'Entity', basis: 'Spouse of a director', effectiveFrom: daysAgo(35), confirmed: false },
  { id: rid('party_'), name: 'Tuah Advisory Partners', type: 'Entity', basis: 'Director in common', effectiveFrom: daysAgo(95), confirmed: true },
  { id: rid('party_'), name: 'Farid bin Rahman', type: 'Person', basis: 'Major shareholder — 5% or more', effectiveFrom: daysAgo(210), confirmed: true },
];

const documents = new Map<string, { filename: string }>();

const cases: CaseSummary[] = [];
const events: { id: string; occurredAt: string; actor: string; type: string; detail: string; hash: string; prevHash: string | null; aggregateId: string }[] = [];

function pushEvent(aggregateId: string, occurredAt: string, actor: string, type: string, detail: string) {
  const chain = events.filter((e) => e.aggregateId === aggregateId);
  const prevHash = chain.length ? chain[chain.length - 1]!.hash : null;
  const id = rid('evt_');
  events.push({ id, occurredAt, actor, type, detail, prevHash, hash: fakeHash(`${prevHash ?? ''}|${id}|${type}|${detail}|${occurredAt}`), aggregateId });
}

function evaluate(considerationMyr: number, financials: SubmitCasePayload['financials'], priorMyr: number) {
  const ratios: RatioResult[] = computeRatios(considerationMyr, financials, THRESHOLDS);
  const topPct = topRatio(ratios);
  const gate: Gate = gateFor(topPct, THRESHOLDS);
  const aggregateMyr = financials.netAssets ? priorMyr + considerationMyr : null;
  const aggregatePct = financials.netAssets && aggregateMyr !== null ? (aggregateMyr / financials.netAssets) * 100 : null;
  return { ratios, topPct, gate, aggregateMyr, aggregatePct };
}

function priorConsideration(partyId: string, before: string): number {
  const cutoff = new Date(before).getTime() - 365 * 24 * 3600 * 1000;
  return cases
    .filter((c) => c.party.id === partyId && new Date(c.createdAt).getTime() >= cutoff && new Date(c.createdAt).getTime() < new Date(before).getTime())
    .reduce((sum, c) => sum + c.considerationMyr, 0);
}

let refCounter = 0;
const nextRef = () => `RPT-2026-${String(++refCounter).padStart(3, '0')}`;

function createCase(input: {
  createdAt: string;
  kind: CaseKind;
  party: Party;
  nature: string;
  considerationMyr: number;
  transactionDate: string | null;
  submittedBy: string;
  financials: SubmitCasePayload['financials'];
  financialLabel: string | null;
  financialConfirmed: boolean;
}): CaseSummary {
  const prior = priorConsideration(input.party.id, input.createdAt);
  const { ratios, topPct, gate, aggregateMyr, aggregatePct } = evaluate(input.considerationMyr, input.financials, prior);
  const hasFinancials = input.financials.netAssets !== null || input.financials.totalAssets !== null || input.financials.profitBeforeTax !== null || input.financials.marketCap !== null;

  const kase: CaseSummary = {
    id: rid('case_'),
    ref: nextRef(),
    kind: input.kind,
    kindLabel: KIND_OPTIONS.find((k) => k.code === input.kind)!.label,
    nature: input.nature,
    considerationMyr: input.considerationMyr,
    currency: 'MYR',
    transactionDate: input.transactionDate,
    createdAt: input.createdAt,
    submittedBy: input.submittedBy,
    party: { id: input.party.id, name: input.party.name, relationLabel: input.party.basis, relationConfirmed: input.party.confirmed },
    evaluation: topPct === null ? null : { ratios, topPct, aggregateMyr, aggregatePct, gate },
    financialBasis: { status: !hasFinancials ? 'none' : input.financialConfirmed ? 'confirmed' : 'unconfirmed', label: input.financialLabel },
    ruleSetVersion: RULE_SET.version,
    routeVersion: ROUTE_VERSION,
    status: 'open',
    decision: null,
  };

  pushEvent(kase.id, input.createdAt, input.submittedBy, 'TransactionSubmitted', `${kase.ref} created. ${input.nature}, consideration RM ${input.considerationMyr.toFixed(1)}m${input.transactionDate ? `, transaction date ${input.transactionDate}` : ''}.`);
  if (input.party.confirmed || cases.some((c) => c.party.id === input.party.id)) {
    pushEvent(kase.id, input.createdAt, 'system', 'CounterpartyScreened', `Matched register party ${input.party.name}.`);
  } else {
    pushEvent(kase.id, input.createdAt, 'system', 'PartyRelationProposed', `New party proposed: ${input.party.name} (${input.party.type}), basis: ${input.party.basis}. Unconfirmed until the secretariat accepts it.`);
  }
  if (topPct === null) {
    pushEvent(kase.id, input.createdAt, 'system', 'MaterialityDeferred', 'No usable financial basis. Evaluation deferred; the case cannot pass secretariat review until a financial period is supplied.');
  } else {
    pushEvent(kase.id, input.createdAt, 'system', 'MaterialityEvaluated', `Rule set ${RULE_SET.version}. Highest ratio ${topPct.toFixed(2)}% → ${gate.title}.`);
  }
  if (prior > 0 && aggregatePct !== null && aggregateMyr !== null) {
    pushEvent(kase.id, input.createdAt, 'system', 'AggregationRecomputed', `Rolling twelve-month total with this party: RM ${aggregateMyr.toFixed(1)}m = ${aggregatePct.toFixed(2)}% of net assets.`);
  }

  return kase;
}

function decide(kase: CaseSummary, at: string, decisionKey: 'approve' | 'reject' | 'refer', rationale: string | null): CaseSummary {
  const gateKey = kase.evaluation?.gate.key ?? 'none';
  const label =
    decisionKey === 'approve'
      ? `${APPROVE_LABEL_BY_GATE[gateKey]} — recorded`
      : decisionKey === 'reject'
        ? 'Rejected — returned to submitter'
        : 'Returned for further information';
  const actor = 'Nurul Aziz · Compliance';
  pushEvent(kase.id, at, actor, 'DecisionRecorded', `${label}${rationale ? ` — ${rationale}` : ''}.`);
  return { ...kase, status: 'decided', decision: { id: rid('decision_'), label, rationale, decidedAt: at, actor } };
}

// ---- seed data -------------------------------------------------------

const sinar = parties[0]!;
const tuah = parties[1]!;
const farid = parties[2]!;

const financialsGroup = { netAssets: 480, totalAssets: 900, profitBeforeTax: 60, marketCap: 1200 };

let kase1 = createCase({
  createdAt: daysAgo(35),
  kind: 'rrpt',
  party: sinar,
  nature: 'Provision of monthly haulage services',
  considerationMyr: 2.4,
  transactionDate: daysAgo(35).slice(0, 10),
  submittedBy: 'Faridah · Finance',
  financials: financialsGroup,
  financialLabel: 'keyed manually',
  financialConfirmed: false,
});
kase1 = decide(kase1, daysAgo(33), 'approve', 'Arms length terms confirmed against comparable haulage contracts.');
cases.push(kase1);

const kase2 = createCase({
  createdAt: daysAgo(9),
  kind: 'rpt_one_off',
  party: tuah,
  nature: 'Corporate restructuring advisory fee',
  considerationMyr: 26,
  transactionDate: daysAgo(9).slice(0, 10),
  submittedBy: 'Faridah · Finance',
  financials: financialsGroup,
  financialLabel: 'FY2025 audited accounts.pdf',
  financialConfirmed: true,
});
cases.push(kase2);

let kase3 = createCase({
  createdAt: daysAgo(58),
  kind: 'rpt_one_off',
  party: farid,
  nature: 'Reimbursement of travel and accommodation expenses',
  considerationMyr: 0.5,
  transactionDate: daysAgo(58).slice(0, 10),
  submittedBy: 'Faridah · Finance',
  financials: financialsGroup,
  financialLabel: 'FY2025 audited accounts.pdf',
  financialConfirmed: true,
});
kase3 = decide(kase3, daysAgo(56), 'approve', null);
cases.push(kase3);

const cempaka: Party = { id: rid('party_'), name: 'Cempaka Resources Bhd', type: 'Entity', basis: 'Associate of the group', effectiveFrom: daysAgo(2), confirmed: false };
parties.push(cempaka);
const kase4 = createCase({
  createdAt: daysAgo(2),
  kind: 'rpt_one_off',
  party: cempaka,
  nature: 'Sale of surplus factory machinery',
  considerationMyr: 0.8,
  transactionDate: daysAgo(2).slice(0, 10),
  submittedBy: 'Faridah · Finance',
  financials: { netAssets: null, totalAssets: null, profitBeforeTax: null, marketCap: null },
  financialLabel: null,
  financialConfirmed: false,
});
cases.push(kase4);

// ---- the mock api ------------------------------------------------------

function byCreatedDesc(a: CaseSummary, b: CaseSummary) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function toPartyRow(p: Party): PartyRow {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    basis: p.basis,
    effectiveFrom: p.effectiveFrom,
    status: p.confirmed ? 'Confirmed' : 'Unconfirmed',
    rptCount: cases.filter((c) => c.party.id === p.id).length,
  };
}

function downloadExport() {
  const head = ['Ref', 'Classification', 'Counterparty', 'Basis of relationship', 'Transaction date', 'Consideration (RM m)', 'Highest ratio', 'Aggregated 12 mth', 'Gate', 'Decision', 'Rule set', 'Financial basis'];
  const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = [...cases].sort(byCreatedDesc).map((c) => [
    c.ref,
    c.kindLabel,
    c.party.name,
    c.party.relationLabel,
    c.transactionDate ?? 'not stated',
    c.considerationMyr.toFixed(1),
    c.evaluation?.topPct !== null && c.evaluation?.topPct !== undefined ? `${c.evaluation.topPct.toFixed(2)}%` : 'not computed',
    c.evaluation?.aggregatePct !== null && c.evaluation?.aggregatePct !== undefined ? `${c.evaluation.aggregatePct.toFixed(2)}%` : '—',
    c.evaluation?.gate.title ?? 'Awaiting inputs',
    c.decision ? c.decision.label : 'Open',
    c.ruleSetVersion,
    c.financialBasis.label ? `${c.financialBasis.label} · ${c.financialBasis.status}` : 'none on file',
  ]);
  const tr = (cells: string[], tag: 'th' | 'td') => `<tr>${cells.map((cell) => `<${tag}>${esc(cell)}</${tag}>`).join('')}</tr>`;
  const html =
    `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">` +
    `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>RPT Register</x:Name>` +
    `<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->` +
    `<style>td,th{font-family:Calibri,sans-serif;font-size:11pt;border:.5pt solid #bfbfbf;padding:3pt 5pt;vertical-align:top}th{background:#1d2d3d;color:#fff;font-weight:600}</style></head>` +
    `<body><table>${tr(head, 'th')}${rows.map((r) => tr(r, 'td')).join('')}</table></body></html>`;
  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rpt-register-demo-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 220));

export const api: Api = {
  listCases: () => delay([...cases].sort(byCreatedDesc)),

  getCase: (id) => {
    const found = cases.find((c) => c.id === id);
    if (!found) return Promise.reject(new Error('Case not found'));
    return delay(found);
  },

  submitCase: (payload: SubmitCasePayload) => {
    const name = payload.party.trim();
    let party = parties.find((p) => p.name.toLowerCase() === name.toLowerCase());
    const isNewParty = !party;
    if (!party) {
      party = { id: rid('party_'), name, type: payload.partyType, basis: payload.basisLabel ?? 'unstated', effectiveFrom: new Date().toISOString(), confirmed: false };
      parties.push(party);
    }
    const doc = payload.financialDocumentId ? documents.get(payload.financialDocumentId) : undefined;
    const hasFinancials =
      payload.financials.netAssets !== null || payload.financials.totalAssets !== null || payload.financials.profitBeforeTax !== null || payload.financials.marketCap !== null;

    const kase = createCase({
      createdAt: new Date().toISOString(),
      kind: payload.kind,
      party,
      nature: payload.nature,
      considerationMyr: payload.considerationMyr,
      transactionDate: payload.transactionDate,
      submittedBy: 'Faridah · Finance',
      financials: payload.financials,
      financialLabel: hasFinancials ? (doc ? doc.filename : 'keyed manually') : null,
      financialConfirmed: false,
    });
    cases.push(kase);
    return delay({ case: kase, isNewParty });
  },

  decideCase: (id, decision, rationale) => {
    const idx = cases.findIndex((c) => c.id === id);
    if (idx === -1) return Promise.reject(new Error('Case not found'));
    cases[idx] = decide(cases[idx]!, new Date().toISOString(), decision, rationale);
    return delay(cases[idx]!);
  },

  reopenCase: (id) => {
    const idx = cases.findIndex((c) => c.id === id);
    if (idx === -1) return Promise.reject(new Error('Case not found'));
    pushEvent(id, new Date().toISOString(), 'Nurul Aziz · Compliance', 'CaseReopened', 'Case reopened for further review.');
    cases[idx] = { ...cases[idx]!, status: 'open', decision: null };
    return delay(cases[idx]!);
  },

  uploadDocument: (file: File) => {
    const id = rid('doc_');
    documents.set(id, { filename: file.name });
    const result: UploadedDocument = { id, filename: file.name, byteSize: file.size, sha256: fakeHash(`${file.name}:${file.size}:${file.lastModified}`) };
    return delay(result);
  },

  listParties: (q: string) => {
    const needle = q.trim().toLowerCase();
    const rows = parties
      .filter((p) => !needle || `${p.name} ${p.basis} ${p.type}`.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toPartyRow);
    return delay({ totalParties: parties.length, parties: rows });
  },

  listEvents: () =>
    delay(
      [...events]
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
        .map((e): AuditEvent => ({ id: e.id, at: relativeAge(e.occurredAt), occurredAt: e.occurredAt, actor: e.actor, type: e.type, detail: e.detail, hash: e.hash, prevHash: e.prevHash }))
    ),

  intakeMeta: () => delay({ kindOptions: KIND_OPTIONS, routeVersion: ROUTE_VERSION, ruleSet: { ...RULE_SET, thresholds: THRESHOLDS } }),

  registryMeta: () => delay({ basisOptions: BASIS_OPTIONS }),

  downloadExport,
};
