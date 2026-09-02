import type { Gate, RatioResult, Thresholds } from '../api/types';

/**
 * Mirrors server/src/modules/materiality/engine.ts so the ratio panel can
 * update live as the submitter types, without a round trip per keystroke.
 * Thresholds always come from the API (ADR-03) — nothing here is a literal.
 */
export function computeRatios(
  considerationMyr: number | null,
  fin: { netAssets: number | null; totalAssets: number | null; profitBeforeTax: number | null; marketCap: number | null },
  thresholds: Thresholds
): RatioResult[] {
  const v = considerationMyr;
  const rows: Array<{ code: RatioResult['code']; label: string; denom: number | null; factor?: number }> = [
    { code: 'net_assets', label: 'Value / net assets', denom: fin.netAssets },
    { code: 'market_cap', label: 'Value / market capitalisation', denom: fin.marketCap },
    { code: 'profits', label: 'Profits attributable / net profits', denom: fin.profitBeforeTax, factor: thresholds.profitAttributableFactor },
    { code: 'total_assets', label: 'Consideration / total assets', denom: fin.totalAssets },
  ];
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    pct: v !== null && r.denom !== null && r.denom > 0 ? (v * (r.factor ?? 1) * 100) / r.denom : null,
  }));
}

export function topRatio(ratios: RatioResult[]): number | null {
  const usable = ratios.map((r) => r.pct).filter((p): p is number => p !== null);
  return usable.length ? Math.max(...usable) : null;
}

export function gateFor(topPct: number | null, thresholds: Thresholds): Gate {
  const fmtPct = (n: number) => `${n.toFixed(2)}%`;
  if (topPct === null) {
    return {
      key: 'none',
      title: 'Awaiting inputs',
      body: 'A consideration and at least one denominator are needed before any ratio can be computed. No gate is asserted and no default is applied.',
    };
  }
  if (topPct >= thresholds.circularThreshold) {
    return {
      key: 'circular',
      title: 'Circular and shareholder approval',
      body: `Highest ratio ${fmtPct(topPct)} meets the ${thresholds.circularThreshold}% gate. Requires an immediate announcement, a circular to shareholders, an independent adviser's opinion, and approval in general meeting. Interested directors and shareholders must abstain.`,
    };
  }
  if (topPct >= thresholds.announceThreshold) {
    return {
      key: 'announce',
      title: 'Immediate announcement',
      body: `Highest ratio ${fmtPct(topPct)} is above the ${thresholds.announceThreshold}% trigger and below ${thresholds.circularThreshold}%. Announce to Bursa immediately on entry; no shareholder approval, but the transaction consumes mandate headroom and enters the twelve-month aggregation window.`,
    };
  }
  return {
    key: 'record',
    title: 'Record only',
    body: `Highest ratio ${fmtPct(topPct)} is below every listing-rule trigger. Recorded in the register and the annual-report RPT schedule, and still counted towards aggregation — a later transaction with the same party can pull this one over a gate.`,
  };
}
