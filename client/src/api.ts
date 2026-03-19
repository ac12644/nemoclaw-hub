const BASE = "/api";

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("hub:unauthorized"));
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (token: string) =>
    request<{ ok: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  // Sandboxes
  listSandboxes: () =>
    request<{
      sandboxes: Array<{
        name: string;
        model?: string;
        provider?: string;
        policies?: string[];
        createdAt?: string;
      }>;
      defaultSandbox: string | null;
    }>("/sandboxes"),
  getSandbox: (name: string) => request<Record<string, unknown>>(`/sandboxes/${name}`),
  deleteSandbox: (name: string) =>
    request<{ ok: boolean }>(`/sandboxes/${name}`, { method: "DELETE" }),
  setDefault: (name: string) =>
    request<{ ok: boolean }>(`/sandboxes/${name}/default`, { method: "PUT" }),
  getLogs: (name: string, lines = 50) =>
    request<{ logs: string }>(`/sandboxes/${name}/logs?lines=${lines}`),

  // Policies
  listPresets: () =>
    request<{
      presets: Array<{ name: string; description: string; file: string; endpoints: string[] }>;
    }>("/policies/presets"),
  getPreset: (name: string) =>
    request<{ name: string; content: string; endpoints: string[] }>(`/policies/presets/${name}`),
  getSandboxPolicies: (name: string) =>
    request<{ policies: string[] }>(`/sandboxes/${name}/policies`),
  applyPreset: (sandbox: string, preset: string) =>
    request<{ ok: boolean; applied: string[] }>(`/sandboxes/${sandbox}/policies`, {
      method: "POST",
      body: JSON.stringify({ preset }),
    }),

  // NIM
  listModels: () =>
    request<{
      models: Array<{ name: string; image: string; minGpuMemoryMB: number }>;
    }>("/nim/models"),
  getGpu: () => request<{ gpu: Record<string, unknown> | null }>("/nim/gpu"),

  // Messages
  getMessages: (sandbox: string) =>
    request<{
      messages: Array<{ id: number; role: string; content: string; created_at: string }>;
    }>(`/messages/${sandbox}`),
  sendMessage: (sandbox: string, content: string) =>
    request<{
      user: { role: string; content: string };
      assistant: { role: string; content: string };
    }>(`/messages/${sandbox}`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  // Audit
  getAudit: (params?: { sandbox?: string; type?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.sandbox) q.set("sandbox", params.sandbox);
    if (params?.type) q.set("type", params.type);
    if (params?.limit) q.set("limit", String(params.limit));
    return request<{
      events: Array<{
        id: number;
        sandbox: string | null;
        event_type: string;
        detail: string | null;
        created_at: string;
      }>;
    }>(`/audit?${q}`);
  },

  // Workflows
  createWorkflow: (yaml: string) =>
    request<{ id: string; name: string }>("/workflows", {
      method: "POST",
      body: JSON.stringify({ yaml }),
    }),
  listWorkflows: () => request<{ workflows: Record<string, unknown>[] }>("/workflows"),
  getWorkflow: (id: string) => request<Record<string, unknown>>(`/workflows/${id}`),
  updateWorkflow: (id: string, yaml: string) =>
    request<{ ok: boolean }>(`/workflows/${id}`, {
      method: "PUT",
      body: JSON.stringify({ yaml }),
    }),
  deleteWorkflow: (id: string) =>
    request<{ ok: boolean }>(`/workflows/${id}`, { method: "DELETE" }),
  triggerRun: (id: string) =>
    request<{ runId: string }>(`/workflows/${id}/run`, { method: "POST" }),
  listRuns: (workflowId: string) =>
    request<{ runs: Record<string, unknown>[] }>(`/workflows/${workflowId}/runs`),
  getRun: (runId: string) =>
    request<{ run: Record<string, unknown>; steps: Record<string, unknown>[] }>(
      `/workflows/runs/${runId}`
    ),

  // System
  health: () => request<{ ok: boolean }>("/system/health"),
  credentials: () =>
    request<{ credentials: Array<{ key: string; set: boolean }> }>("/credentials"),
};
