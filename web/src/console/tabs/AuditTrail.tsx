import type { AuditEvent } from '../../api/types';

export function AuditTrail({ events, exportDisabled }: { events: AuditEvent[] | null; exportDisabled: boolean }) {
  if (events === null) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 26px' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: 60, borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <div className="audit-toolbar">
        <span className="tag tag-accent">{events.length ? `${events.length} events` : '0 events'}</span>
        <span style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>Append-only, hash-chained · 7-year retention</span>
        <button className="btn btn-secondary" disabled={exportDisabled} style={{ marginLeft: 'auto', minHeight: 38 }}>
          Export evidence pack
        </button>
      </div>
      <div className="audit-list">
        {events.map((e) => (
          <div className="audit-row" key={e.id}>
            <div className="audit-row-time">
              <span>{e.at}</span>
              <span>{e.actor}</span>
            </div>
            <div className="audit-row-body">
              <span className="audit-row-type">{e.type}</span>
              <span className="audit-row-detail">{e.detail}</span>
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <div className="empty-state" style={{ padding: '20px 0', maxWidth: 520 }}>
            <span className="empty-state-title">No events recorded</span>
            <span className="empty-state-body">
              The log is written by the system, never by hand. Submit a transaction in Intake and the chain begins:
              submission, counterparty screening, materiality evaluation, then every decision taken on it.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
