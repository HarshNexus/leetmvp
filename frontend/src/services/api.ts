import type { AuthResponse, DashboardAnalytics, Revision, SolvedProblem, User } from '../types';
const base = import.meta.env.VITE_API_URL;
const inflightGets = new Map<string, Promise<unknown>>();
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isGet = !options.method || options.method.toUpperCase() === 'GET';
  if (isGet && inflightGets.has(path)) return inflightGets.get(path) as Promise<T>;
  const run = (async () => {
    const token = localStorage.getItem('dsa_token');
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || 'Request failed');
    return body?.data as T;
  })();
  if (isGet) { inflightGets.set(path, run); run.finally(() => inflightGets.delete(path)); }
  return run;
}
export const api = {
  login: (email: string, password: string) => request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) => request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  me: () => request<{ user: User }>('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  authorizeExtension: (clientId: string, redirectUri: string) => request<{ code: string }>('/auth/extension/authorize', { method: 'POST', body: JSON.stringify({ clientId, redirectUri }) }),
  problems: () => request<{ items: SolvedProblem[] }>('/problems'),
  deleteProblem: (id: string) => request<{ deletedId: string; record: Record<string, unknown> }>(`/problems/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  restoreProblem: (id: string, record: Record<string, unknown>) => request<{ record: Record<string, unknown> }>(`/problems/${encodeURIComponent(id)}/restore`, { method: 'POST', body: JSON.stringify({ record }) }),
  analytics: (timezone: string) => request<DashboardAnalytics>(`/dashboard/analytics?timezone=${encodeURIComponent(timezone)}`),
  updateGoals: (goals: { daily: number; weekly: number; monthly: number }) => request<{ goals: typeof goals }>('/dashboard/goals', { method: 'PATCH', body: JSON.stringify(goals) }),
  revisions: () => request<Revision[]>('/revisions'),
  revisionsToday: () => request<Revision[]>('/revisions/today'),
  revisionsSettings: () => request<{ revisionStages: number[] }>('/revisions/settings'),
  updateRevisionSettings: (intervals: number[]) => request<{ revisionStages: number[] }>('/revisions/settings', { method: 'PATCH', body: JSON.stringify({ intervals }) }),
  deleteRevision: (id: string) => request<{ deletedId: string }>('/revisions/' + encodeURIComponent(id), { method: 'DELETE' }),
  completeRevision: (id: string, result: string) => request<Revision>(`/revisions/${id}/complete`, { method: 'POST', body: JSON.stringify({ result }) }),
  addRevision: (problemId: string, stageDays: number) => request<Revision>('/revisions', { method: 'POST', body: JSON.stringify({ problemId, stageDays }) }),
};
