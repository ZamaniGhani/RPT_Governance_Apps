import type { FinancialInputs, Gate, RatioResult, Thresholds } from './types.js';

/**
 * Percentage ratio tests under MMLR 10.02(g). Pure functions over a
 * versioned rule set (ADR-03) — thresholds never appear as literals here,
 * they are always passed in from the rule set effective at the time.
 */
export function computeRatios(considerationMyr: number | null, fin: FinancialInputs, thresholds: Thresholds): RatioResult[] {
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

/**
 * A single 5%-class trigger, not two: Bursa Ch.10 Part III puts immediate
 * announcement and the circular/shareholder-approval requirement at the same
 * percentage-ratio threshold for a one-off or non-ordinary-course-recurring
 * RPT (a materially different structure from the 0.25%/5% two-tier gate this
 * rule set replaces — see migration 1700000007000). A transaction submitted
 * under an RRPT shareholder mandate is evaluated differently — against the
 * mandate's headroom, not this ratio gate — which is tracked separately and
 * out of scope for this rule set.
 */
export function gateFor(topPct: number | null, thresholds: Thresholds): Gate {
  const fmtPct = (n: number) => `${n.toFixed(2)}%`;
  if (topPct === null) {
    return {
      key: 'none',
      title: 'Awaiting inputs',
      body: 'A consideration and at least one denominator are needed before any ratio can be computed. No gate is asserted and no default is applied.',
    };
  }
  if (topPct >= thresholds.materialThreshold) {
    return {
      key: 'circular',
      title: 'Circular and shareholder approval',
      body: `Highest ratio ${fmtPct(topPct)} meets the ${thresholds.materialThreshold}% gate. Requires an immediate announcement, a circular to shareholders, an independent adviser's opinion, and approval in general meeting. Interested directors and major shareholders must abstain from voting, and must ensure their associates also abstain.`,
    };
  }
  return {
    key: 'record',
    title: 'Record only',
    body: `Highest ratio ${fmtPct(topPct)} is below the ${thresholds.materialThreshold}% trigger. Recorded in the register and the annual-report RPT schedule, and still counted towards aggregation — a later transaction with the same party can pull this one over the gate.`,
  };
}
