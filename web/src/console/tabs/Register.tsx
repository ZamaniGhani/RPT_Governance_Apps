import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { PartyRow } from '../../api/types';
import { dateLabel } from '../../lib/format';

export function Register() {
  const [query, setQuery] = useState('');
  const [parties, setParties] = useState<PartyRow[] | null>(null);
  const [totalParties, setTotalParties] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const result = await api.listParties(query.trim());
      if (cancelled) return;
      setParties(result.parties);
      setTotalParties(result.totalParties);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const resultCount = totalParties ? `${parties?.length ?? 0} of ${totalParties} parties` : '';

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <div className="register-toolbar">
        <div className="field" style={{ flex: '1 1 240px' }}>
          <label htmlFor="q">Search the related party register</label>
          <input className="input" id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, entity or basis of relationship" />
        </div>
        <span className="register-count">{resultCount}</span>
      </div>
      <div className="register-table-wrap">
        {parties && parties.length > 0 && (
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Party</th>
                <th style={{ textAlign: 'left' }}>Type</th>
                <th style={{ textAlign: 'left' }}>Basis of relationship</th>
                <th style={{ textAlign: 'left' }}>Effective from</th>
                <th style={{ textAlign: 'left' }}>Status</th>
                <th style={{ textAlign: 'right' }}>RPTs</th>
              </tr>
            </thead>
            <tbody>
              {parties.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14.5 }}>{p.name}</span>
                  </td>
                  <td>
                    <span className="tag tag-neutral">{p.type}</span>
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--color-neutral-800)' }}>{p.basis}</td>
                  <td style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{dateLabel(p.effectiveFrom)}</td>
                  <td>
                    <span className={p.status === 'Confirmed' ? 'tag tag-accent' : 'tag tag-outline'}>{p.status}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{p.rptCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {parties && parties.length === 0 && (
          <div className="empty-state" style={{ maxWidth: 520 }}>
            <span className="empty-state-title">{totalParties ? 'No match' : 'Register is empty'}</span>
            <span className="empty-state-body">
              {totalParties
                ? `No party matches that search. Clear the field to see all ${totalParties} entries.`
                : 'Parties enter the register two ways: proposed by a submitter during Intake, or declared by an employee in their annual COI declaration. Both are proposals a human confirms — nothing writes here directly.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
