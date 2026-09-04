import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { BasisOption, PartyRow } from '../../api/types';
import { Blueprint } from '../../components/Blueprint';
import { dateLabel } from '../../lib/format';

interface PartyForm {
  name: string;
  type: 'Person' | 'Entity';
  basisLabel: string;
}

const EMPTY_FORM: PartyForm = { name: '', type: 'Entity', basisLabel: '' };

export function Register({ onChanged, canAdminister }: { onChanged?: () => void; canAdminister: boolean }) {
  const [query, setQuery] = useState('');
  const [parties, setParties] = useState<PartyRow[] | null>(null);
  const [totalParties, setTotalParties] = useState(0);
  const [basisOptions, setBasisOptions] = useState<BasisOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<PartyForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PartyForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const result = await api.listParties(query.trim());
    setParties(result.parties);
    setTotalParties(result.totalParties);
  }

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

  useEffect(() => {
    api.registryMeta().then((m) => setBasisOptions(m.basisOptions));
  }, []);

  const resultCount = totalParties ? `${parties?.length ?? 0} of ${totalParties} parties` : '';

  function startCreate() {
    setError('');
    setEditingId(null);
    setCreateForm(EMPTY_FORM);
    setCreating(true);
  }

  async function submitCreate() {
    if (!createForm.name.trim() || !createForm.basisLabel) return;
    setBusy(true);
    setError('');
    try {
      await api.createParty({ name: createForm.name.trim(), type: createForm.type, basisLabel: createForm.basisLabel });
      setCreating(false);
      setCreateForm(EMPTY_FORM);
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create party');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(p: PartyRow) {
    setError('');
    setCreating(false);
    setEditingId(p.id);
    setEditForm({ name: p.name, type: p.type, basisLabel: p.basis });
  }

  async function submitEdit(id: string) {
    if (!editForm.name.trim() || !editForm.basisLabel) return;
    setBusy(true);
    setError('');
    try {
      await api.updateParty(id, { name: editForm.name.trim(), type: editForm.type, basisLabel: editForm.basisLabel });
      setEditingId(null);
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update party');
    } finally {
      setBusy(false);
    }
  }

  async function removeParty(p: PartyRow) {
    const warn = p.rptCount
      ? `Remove ${p.name} from the register? It has ${p.rptCount} related transaction${p.rptCount > 1 ? 's' : ''}, which are unaffected — only the current register entry is removed.`
      : `Remove ${p.name} from the register?`;
    if (!window.confirm(warn)) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteParty(p.id);
      if (editingId === p.id) setEditingId(null);
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove party');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <div className="register-toolbar">
        <div className="field" style={{ flex: '1 1 240px' }}>
          <label htmlFor="q">Search the related party register</label>
          <input className="input" id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, entity or basis of relationship" />
        </div>
        <span className="register-count">{resultCount}</span>
        {canAdminister ? (
          <button className="btn btn-secondary" style={{ minHeight: 38 }} onClick={startCreate} disabled={creating}>
            + Add party
          </button>
        ) : (
          <span className="tag tag-outline">Read-only · Secretariat access required to edit</span>
        )}
      </div>

      {error && (
        <div className="alert alert-error" style={{ margin: '10px 24px 0' }}>
          {error}
        </div>
      )}

      {canAdminister && creating && (
        <Blueprint style={{ margin: '16px 24px 0', display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
          <span className="kicker">New register entry</span>
          <div className="intake-row-2">
            <div className="field">
              <label htmlFor="newName">Legal name</label>
              <input className="input" id="newName" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="Person or entity name" />
            </div>
            <div className="field">
              <label htmlFor="newType">Type</label>
              <select className="input" id="newType" value={createForm.type} onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value as PartyForm['type'] }))}>
                <option value="Entity">Entity</option>
                <option value="Person">Person</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="newBasis">Basis of relationship</label>
            <select className="input" id="newBasis" value={createForm.basisLabel} onChange={(e) => setCreateForm((f) => ({ ...f, basisLabel: e.target.value }))}>
              <option value="">Select a basis…</option>
              {basisOptions.map((b) => (
                <option key={b.code} value={b.label}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <button className="btn btn-primary" disabled={busy || !createForm.name.trim() || !createForm.basisLabel} onClick={submitCreate} style={{ minHeight: 40 }}>
              Add to register
            </button>
            <button className="btn btn-ghost" onClick={() => setCreating(false)} style={{ minHeight: 40 }}>
              Cancel
            </button>
          </div>
        </Blueprint>
      )}

      <div className="register-table-wrap">
        {parties === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton" style={{ height: 40, borderRadius: 'var(--radius-md)' }} />
            ))}
          </div>
        )}
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
                {canAdminister && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {parties.map((p) =>
                canAdminister && editingId === p.id ? (
                  <tr key={p.id}>
                    <td>
                      <input className="input" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} style={{ minHeight: 32 }} />
                    </td>
                    <td>
                      <select className="input" value={editForm.type} onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value as PartyForm['type'] }))} style={{ minHeight: 32 }}>
                        <option value="Entity">Entity</option>
                        <option value="Person">Person</option>
                      </select>
                    </td>
                    <td>
                      <select className="input" value={editForm.basisLabel} onChange={(e) => setEditForm((f) => ({ ...f, basisLabel: e.target.value }))} style={{ minHeight: 32 }}>
                        {basisOptions.map((b) => (
                          <option key={b.code} value={b.label}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{dateLabel(p.effectiveFrom)}</td>
                    <td>
                      <span className={p.status === 'Confirmed' ? 'tag tag-success' : 'tag tag-warning'}>{p.status}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{p.rptCount}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost" disabled={busy} onClick={() => submitEdit(p.id)} style={{ minHeight: 30 }}>
                        Save
                      </button>
                      <button className="btn btn-ghost" disabled={busy} onClick={() => setEditingId(null)} style={{ minHeight: 30 }}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
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
                      <span className={p.status === 'Confirmed' ? 'tag tag-success' : 'tag tag-warning'}>{p.status}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{p.rptCount}</td>
                    {canAdminister && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost" disabled={busy} onClick={() => startEdit(p)} style={{ minHeight: 30 }}>
                          Edit
                        </button>
                        <button className="btn btn-ghost" disabled={busy} onClick={() => removeParty(p)} style={{ minHeight: 30 }}>
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
        {parties && parties.length === 0 && (
          <div className="empty-state" style={{ maxWidth: 520 }}>
            <span className="empty-state-title">{totalParties ? 'No match' : 'Register is empty'}</span>
            <span className="empty-state-body">
              {totalParties
                ? `No party matches that search. Clear the field to see all ${totalParties} entries.`
                : 'Add a party directly with "Add party" above, or it enters the register when proposed by a submitter during Intake.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
