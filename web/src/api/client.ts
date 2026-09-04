import type {
  AuditEvent,
  BasisOption,
  CaseSummary,
  CreatePartyPayload,
  CurrentUser,
  KindOption,
  PartyRow,
  SubmitCasePayload,
  Thresholds,
  UpdatePartyPayload,
  UploadedDocument,
} from './types';

export class UnauthorizedError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401) throw new UnauthorizedError(body.error ?? 'Sign in required');
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (username: string, password: string) =>
    request<CurrentUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<CurrentUser>('/auth/me'),

  listCases: () => request<CaseSummary[]>('/cases'),
  getCase: (id: string) => request<CaseSummary>(`/cases/${id}`),
  submitCase: (payload: SubmitCasePayload) =>
    request<{ case: CaseSummary; isNewParty: boolean }>('/cases', { method: 'POST', body: JSON.stringify(payload) }),
  decideCase: (id: string, decision: 'approve' | 'reject' | 'refer', rationale: string | null) =>
    request<CaseSummary>(`/cases/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision, rationale }) }),
  reopenCase: (id: string) => request<CaseSummary>(`/cases/${id}/reopen`, { method: 'POST' }),
  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<UploadedDocument>('/documents', { method: 'POST', body: form });
  },
  listParties: (q: string) => request<{ totalParties: number; parties: PartyRow[] }>(`/parties?q=${encodeURIComponent(q)}`),
  createParty: (payload: CreatePartyPayload) => request<PartyRow>('/parties', { method: 'POST', body: JSON.stringify(payload) }),
  updateParty: (id: string, payload: UpdatePartyPayload) =>
    request<PartyRow>(`/parties/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteParty: (id: string) => request<void>(`/parties/${id}`, { method: 'DELETE' }),
  listEvents: () => request<AuditEvent[]>('/events'),
  intakeMeta: () =>
    request<{
      kindOptions: KindOption[];
      routeVersion: string;
      ruleSet: { version: string; effectiveFrom: string; thresholds: Thresholds };
    }>('/intake-meta'),
  registryMeta: () => request<{ basisOptions: BasisOption[] }>('/registry-meta'),
  downloadExport: () => {
    window.location.href = '/api/export/register.xls';
  },
};

/** Shape the demo build's mock client (src/api/mock.ts) must match exactly. */
export type Api = typeof api;
