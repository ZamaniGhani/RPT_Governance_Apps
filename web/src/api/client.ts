import type {
  AuditEvent,
  BasisOption,
  CaseSummary,
  CreatePartyPayload,
  KindOption,
  PartyRow,
  SubmitCasePayload,
  Thresholds,
  UpdatePartyPayload,
  UploadedDocument,
} from './types';

export type Actor = 'finance' | 'compliance';

async function request<T>(path: string, actor: Actor, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      'x-actor': actor,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listCases: () => request<CaseSummary[]>('/cases', 'compliance'),
  getCase: (id: string) => request<CaseSummary>(`/cases/${id}`, 'compliance'),
  submitCase: (payload: SubmitCasePayload) =>
    request<{ case: CaseSummary; isNewParty: boolean }>('/cases', 'finance', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  decideCase: (id: string, decision: 'approve' | 'reject' | 'refer', rationale: string | null) =>
    request<CaseSummary>(`/cases/${id}/decision`, 'compliance', {
      method: 'POST',
      body: JSON.stringify({ decision, rationale }),
    }),
  reopenCase: (id: string) => request<CaseSummary>(`/cases/${id}/reopen`, 'compliance', { method: 'POST' }),
  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<UploadedDocument>('/documents', 'finance', { method: 'POST', body: form });
  },
  listParties: (q: string) => request<{ totalParties: number; parties: PartyRow[] }>(`/parties?q=${encodeURIComponent(q)}`, 'compliance'),
  createParty: (payload: CreatePartyPayload) =>
    request<PartyRow>('/parties', 'compliance', { method: 'POST', body: JSON.stringify(payload) }),
  updateParty: (id: string, payload: UpdatePartyPayload) =>
    request<PartyRow>(`/parties/${id}`, 'compliance', { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteParty: (id: string) => request<void>(`/parties/${id}`, 'compliance', { method: 'DELETE' }),
  listEvents: () => request<AuditEvent[]>('/events', 'compliance'),
  intakeMeta: () =>
    request<{
      kindOptions: KindOption[];
      routeVersion: string;
      ruleSet: { version: string; effectiveFrom: string; thresholds: Thresholds };
    }>('/intake-meta', 'finance'),
  registryMeta: () => request<{ basisOptions: BasisOption[] }>('/registry-meta', 'finance'),
  downloadExport: () => {
    window.location.href = '/api/export/register.xls';
  },
};

/** Shape the demo build's mock client (src/api/mock.ts) must match exactly. */
export type Api = typeof api;
