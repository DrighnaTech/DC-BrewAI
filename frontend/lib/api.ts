import { getToken, clearTokens } from "./auth";

const BASE = "/api";

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearTokens();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Auth
export const api = {
  login: (email: string, password: string) =>
    req<{ access_token: string; refresh_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string) =>
    req<{ id: string; email: string; role: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => req<{ id: string; email: string; full_name: string; role: string }>("/auth/me"),

  // Sessions
  getSessions: () => req<{ id: string; title: string; created_at: string }[]>("/chat/sessions"),
  createSession: () => req<{ id: string; title: string; created_at: string }>("/chat/sessions", { method: "POST" }),
  deleteSession: (id: string) => req<void>(`/chat/sessions/${id}`, { method: "DELETE" }),
  getMessages: (sessionId: string) =>
    req<{ id: string; role: string; content: string; created_at: string; latency_ms: number | null }[]>(
      `/chat/sessions/${sessionId}/messages`
    ),

  // Feedback
  submitFeedback: (runId: string, rating: number, correction?: string) =>
    req<{ id: string; approved_for_training: boolean }>("/feedback", {
      method: "POST",
      body: JSON.stringify({ run_id: runId, rating, correction }),
    }),

  approveFeedback: (feedbackId: string) =>
    req<{ id: string; approved_for_training: boolean }>(`/feedback/${feedbackId}/approve`, { method: "PATCH" }),

  // Dataset
  getDatasetStats: () => req<{ total_runs: number; with_feedback: number; approved: number }>("/dataset/stats"),
  getDatasetRuns: (page = 1, approvedOnly = false) =>
    req<{ id: string; prompt: string; response: string; model_name: string; latency_ms: number | null; tokens_out: number | null; created_at: string; feedback: { rating: number; correction: string | null; approved_for_training: boolean } | null }[]>(
      `/dataset/runs?page=${page}&approved_only=${approvedOnly}`
    ),

  exportDataset: async (fmt: "alpaca" | "chatml") => {
    const token = getToken();
    const res = await fetch(`${BASE}/dataset/export?fmt=${fmt}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brewai_dataset_${fmt}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Fine-tune
  getFinetuneReadiness: () => req<{ approved_count: number; min_required: number; ready: boolean }>("/finetune/readiness"),
  triggerFinetune: (export_format: string) =>
    req<{ id: string; status: string; dataset_size: number }>("/finetune/trigger", {
      method: "POST",
      body: JSON.stringify({ export_format }),
    }),
  getFinetuneJobs: () =>
    req<{ id: string; status: string; dataset_size: number | null; export_format: string; log_output: string | null; started_at: string | null; completed_at: string | null; created_at: string }[]>(
      "/finetune/jobs"
    ),
  markJobComplete: (jobId: string) => req<{ id: string; status: string }>(`/finetune/jobs/${jobId}/complete`, { method: "PATCH" }),

  // Models
  getModels: () =>
    req<{ id: string; name: string; ollama_model_id: string; description: string | null; is_active: boolean; created_at: string }[]>(
      "/models"
    ),
  getOllamaModels: () => req<{ name: string; size: number; modified_at: string }[]>("/models/ollama"),
  registerModel: (name: string, ollama_model_id: string, description?: string) =>
    req("/models", { method: "POST", body: JSON.stringify({ name, ollama_model_id, description }) }),
  activateModel: (modelId: string) => req(`/models/${modelId}/activate`, { method: "POST" }),

  // API Keys
  getApiKeys: () =>
    req<{ id: string; name: string; key_prefix: string; scopes: string[]; is_active: boolean; rate_limit: number; total_requests: number; created_at: string; last_used_at: string | null; expires_at: string | null }[]>(
      "/api-keys"
    ),
  createApiKey: (name: string, scopes: string[] = ["general", "coder", "ocr"], rateLimit = 60, expiresInDays?: number) =>
    req<{ id: string; name: string; key: string; key_prefix: string; scopes: string[]; is_active: boolean; rate_limit: number; total_requests: number; created_at: string; last_used_at: string | null; expires_at: string | null }>(
      "/api-keys",
      { method: "POST", body: JSON.stringify({ name, scopes, rate_limit: rateLimit, expires_in_days: expiresInDays }) }
    ),
  revokeApiKey: (keyId: string) => req<void>(`/api-keys/${keyId}`, { method: "DELETE" }),
};
