export const fmtMyr = (n: number): string => `RM ${n.toFixed(1)}m`;
export const fmtPct = (n: number): string => `${n.toFixed(2)}%`;

export function dateLabel(iso: string | null): string {
  if (!iso) return 'not stated';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function downloadRegisterExport(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.click();
}
