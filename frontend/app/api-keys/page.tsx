"use client";
import { useState, useEffect } from "react";
import AuthGuard from "@/components/shared/AuthGuard";
import Navbar from "@/components/shared/Navbar";
import { useTheme } from "@/components/shared/ThemeProvider";
import { api } from "@/lib/api";
import { Key, Plus, Trash2, Copy, Check, Shield, Clock, Activity, Eye, EyeOff } from "lucide-react";
import clsx from "clsx";

interface ApiKeyData {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  rate_limit: number;
  total_requests: number;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export default function ApiKeysPage() {
  const { isDark } = useTheme();
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["general", "coder", "ocr"]);
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(60);
  const [newKeyExpiry, setNewKeyExpiry] = useState<number | undefined>(undefined);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showDocs, setShowDocs] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(true);

  useEffect(() => { loadKeys(); }, []);

  const loadKeys = async () => {
    try { const data = await api.getApiKeys(); setKeys(data); } catch { }
    setLoading(false);
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const result = await api.createApiKey(newKeyName, newKeyScopes, newKeyRateLimit, newKeyExpiry);
      setCreatedKey(result.key);
      setKeys(prev => [{ ...result, key_prefix: result.key_prefix } as ApiKeyData, ...prev]);
      setNewKeyName("");
    } catch (e: any) { alert(e.message); }
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    await api.revokeApiKey(id);
    setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: false } : k));
  };

  const copyKey = () => {
    if (createdKey) { navigator.clipboard.writeText(createdKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const toggleScope = (scope: string) => {
    setNewKeyScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const SCOPE_COLORS_D: Record<string, string> = {
    general: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    coder: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    ocr: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  };
  const SCOPE_COLORS_L: Record<string, string> = {
    general: "bg-blue-50 text-blue-600 border-blue-200",
    coder: "bg-emerald-50 text-emerald-600 border-emerald-200",
    ocr: "bg-amber-50 text-amber-700 border-amber-200",
  };

  const card = clsx("rounded-2xl border p-6 transition-colors", isDark ? "bg-[#111118] border-white/[0.06]" : "bg-white border-gray-200 shadow-sm");
  const inputCls = clsx("w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none transition-colors border", isDark ? "bg-gray-800/50 border-white/[0.08] text-white focus:border-cyan-500/50" : "bg-gray-50 border-gray-200 text-gray-900 focus:border-amber-600/50");
  const btnPrimary = clsx("flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all", isDark ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20" : "bg-gradient-to-r from-amber-700 to-amber-900 text-white shadow-lg shadow-amber-900/20");
  const btnSecondary = clsx("text-sm px-4 py-2.5 rounded-lg border transition-colors", isDark ? "border-white/[0.08] text-gray-300 hover:bg-white/[0.06]" : "border-gray-200 text-gray-600 hover:bg-gray-100");

  return (
    <AuthGuard>
      <div className={clsx("flex h-screen overflow-hidden", isDark ? "bg-[#0a0a0f]" : "bg-[#faf9f7]")}>
        <Navbar collapsed={navCollapsed} onToggle={() => setNavCollapsed(v => !v)} />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className={clsx("text-2xl font-bold flex items-center gap-3", isDark ? "text-white" : "text-gray-900")}>
                  <Key size={24} className={isDark ? "text-cyan-400" : "text-amber-700"} />
                  API Keys
                </h1>
                <p className={clsx("text-sm mt-1", isDark ? "text-gray-400" : "text-gray-500")}>
                  Manage API keys for external access to BrewAI Gateway
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowDocs(v => !v)} className={btnSecondary}>
                  {showDocs ? "Hide" : "Show"} API Docs
                </button>
                <button onClick={() => { setShowCreate(true); setCreatedKey(null); }} className={btnPrimary}>
                  <Plus size={15} /> Create Key
                </button>
              </div>
            </div>

            {/* API Docs */}
            {showDocs && (
              <div className={clsx(card, "mb-8")}>
                <h2 className={clsx("text-lg font-semibold mb-4", isDark ? "text-white" : "text-gray-900")}>API Reference</h2>
                <div className="space-y-4 text-sm">
                  {[
                    { method: "POST", path: "/v1/chat", desc: "General chat (qwen3:14b)", color: "blue", example: `curl -X POST https://your-domain/v1/chat \\\n  -H "Authorization: Bearer bai_your_key" \\\n  -H "Content-Type: application/json" \\\n  -d '{"message": "Summarize this report...", "stream": false}'` },
                    { method: "POST", path: "/v1/code", desc: "Code assistant (qwen2.5-coder:14b)", color: "emerald", example: `curl -X POST https://your-domain/v1/code \\\n  -H "Authorization: Bearer bai_your_key" \\\n  -H "Content-Type: application/json" \\\n  -d '{"message": "Write a FastAPI middleware", "stream": false}'` },
                    { method: "POST", path: "/v1/ocr", desc: "OCR extraction (deepseek-ocr)", color: "amber", example: `curl -X POST https://your-domain/v1/ocr \\\n  -H "Authorization: Bearer bai_your_key" \\\n  -F "file=@invoice.png" \\\n  -F "prompt=Extract all text"` },
                    { method: "POST", path: "/v1/auto", desc: "Auto-routed (smart model selection)", color: "purple", example: `curl -X POST https://your-domain/v1/auto \\\n  -H "Authorization: Bearer bai_your_key" \\\n  -H "Content-Type: application/json" \\\n  -d '{"message": "Fix this SQL query...", "stream": false}'` },
                    { method: "POST", path: "/v1/ocr-and-ask", desc: "OCR + reasoning pipeline", color: "teal", example: `curl -X POST https://your-domain/v1/ocr-and-ask \\\n  -H "Authorization: Bearer bai_your_key" \\\n  -F "file=@screenshot.png" \\\n  -F "prompt=Fix this error" \\\n  -F "model_type=coder"` },
                  ].map(ep => (
                    <div key={ep.path}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={clsx("px-2 py-0.5 rounded text-xs font-mono", isDark ? `bg-${ep.color}-500/20 text-${ep.color}-400` : `bg-${ep.color}-50 text-${ep.color}-700`)}>
                          {ep.method}
                        </span>
                        <code className={isDark ? "text-gray-300" : "text-gray-700"}>{ep.path}</code>
                        <span className={isDark ? "text-gray-500" : "text-gray-400"}>— {ep.desc}</span>
                      </div>
                      <pre className={clsx("rounded-lg p-3 text-xs overflow-x-auto mt-1", isDark ? "bg-black/30 text-gray-400" : "bg-gray-50 text-gray-600")}>{ep.example}</pre>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Create key */}
            {showCreate && (
              <div className={clsx(card, "mb-8")}>
                {createdKey ? (
                  <div>
                    <h3 className={clsx("text-lg font-semibold mb-2", isDark ? "text-white" : "text-gray-900")}>Key Created</h3>
                    <p className={clsx("text-sm mb-3", isDark ? "text-amber-400" : "text-amber-600")}>Copy this key now. You won't be able to see it again.</p>
                    <div className="flex items-center gap-2">
                      <code className={clsx("flex-1 rounded-lg px-4 py-3 text-sm font-mono border", isDark ? "bg-black/30 border-white/[0.06] text-emerald-400" : "bg-gray-50 border-gray-200 text-emerald-700")}>{createdKey}</code>
                      <button onClick={copyKey} className={clsx("rounded-lg p-3 transition-colors", isDark ? "bg-white/[0.06] hover:bg-white/[0.10] text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-700")}>
                        {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                      </button>
                    </div>
                    <button onClick={() => { setShowCreate(false); setCreatedKey(null); }} className={clsx("mt-4 text-sm transition-colors", isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900")}>Done</button>
                  </div>
                ) : (
                  <div>
                    <h3 className={clsx("text-lg font-semibold mb-4", isDark ? "text-white" : "text-gray-900")}>Create API Key</h3>
                    <div className="space-y-4">
                      <div>
                        <label className={clsx("text-xs block mb-1", isDark ? "text-gray-400" : "text-gray-500")}>Name</label>
                        <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="e.g. OCR App, Team Bot..." className={inputCls} />
                      </div>
                      <div>
                        <label className={clsx("text-xs block mb-2", isDark ? "text-gray-400" : "text-gray-500")}>Scopes</label>
                        <div className="flex gap-2">
                          {["general", "coder", "ocr"].map(scope => (
                            <button
                              key={scope}
                              onClick={() => toggleScope(scope)}
                              className={clsx(
                                "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                                newKeyScopes.includes(scope)
                                  ? isDark ? SCOPE_COLORS_D[scope] : SCOPE_COLORS_L[scope]
                                  : isDark ? "bg-white/[0.03] border-white/[0.06] text-gray-500" : "bg-gray-50 border-gray-200 text-gray-400"
                              )}
                            >
                              {scope.charAt(0).toUpperCase() + scope.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className={clsx("text-xs block mb-1", isDark ? "text-gray-400" : "text-gray-500")}>Rate Limit (req/min)</label>
                          <input type="number" value={newKeyRateLimit} onChange={e => setNewKeyRateLimit(Number(e.target.value))} className={inputCls} />
                        </div>
                        <div className="flex-1">
                          <label className={clsx("text-xs block mb-1", isDark ? "text-gray-400" : "text-gray-500")}>Expires in (days, blank = never)</label>
                          <input type="number" value={newKeyExpiry ?? ""} onChange={e => setNewKeyExpiry(e.target.value ? Number(e.target.value) : undefined)} placeholder="Never" className={inputCls} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={createKey} disabled={!newKeyName.trim() || newKeyScopes.length === 0} className={clsx(btnPrimary, "disabled:opacity-40")}>Create Key</button>
                        <button onClick={() => setShowCreate(false)} className={btnSecondary}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Keys list */}
            {loading ? (
              <div className={clsx("text-center py-12", isDark ? "text-gray-500" : "text-gray-400")}>Loading...</div>
            ) : keys.length === 0 ? (
              <div className="text-center py-16">
                <Shield size={48} className={clsx("mx-auto mb-4", isDark ? "text-gray-700" : "text-gray-300")} />
                <p className={clsx("text-lg font-medium", isDark ? "text-gray-400" : "text-gray-500")}>No API keys yet</p>
                <p className={clsx("text-sm mt-1", isDark ? "text-gray-600" : "text-gray-400")}>Create a key to let external apps access BrewAI Gateway</p>
              </div>
            ) : (
              <div className="space-y-3">
                {keys.map(k => (
                  <div key={k.id} className={clsx(
                    "rounded-xl border p-5 transition-colors",
                    k.is_active
                      ? isDark ? "bg-[#111118] border-white/[0.06]" : "bg-white border-gray-200 shadow-sm"
                      : isDark ? "bg-[#111118] border-red-900/30 opacity-60" : "bg-white border-red-200 opacity-60"
                  )}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className={clsx("font-medium", isDark ? "text-white" : "text-gray-900")}>{k.name}</h3>
                          {!k.is_active && <span className={clsx("text-[10px] px-2 py-0.5 rounded-full", isDark ? "bg-red-900/30 text-red-400" : "bg-red-50 text-red-600")}>Revoked</span>}
                        </div>
                        <code className={clsx("text-xs font-mono mt-1 block", isDark ? "text-gray-500" : "text-gray-400")}>{k.key_prefix}</code>
                      </div>
                      {k.is_active && (
                        <button onClick={() => revokeKey(k.id)} className={clsx("p-1 transition-colors", isDark ? "text-gray-600 hover:text-red-400" : "text-gray-400 hover:text-red-500")} title="Revoke key">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-3 flex-wrap">
                      <div className="flex gap-1.5">
                        {k.scopes.map(s => (
                          <span key={s} className={clsx("px-2 py-0.5 rounded-full text-[10px] font-medium border", isDark ? SCOPE_COLORS_D[s] : SCOPE_COLORS_L[s] || (isDark ? "bg-gray-700 text-gray-400 border-gray-600" : "bg-gray-100 text-gray-500 border-gray-200"))}>
                            {s}
                          </span>
                        ))}
                      </div>
                      <span className={isDark ? "text-gray-700" : "text-gray-300"}>|</span>
                      <div className={clsx("flex items-center gap-1 text-xs", isDark ? "text-gray-500" : "text-gray-400")}><Activity size={11} /><span>{k.total_requests.toLocaleString()} requests</span></div>
                      <div className={clsx("flex items-center gap-1 text-xs", isDark ? "text-gray-500" : "text-gray-400")}><Shield size={11} /><span>{k.rate_limit}/min</span></div>
                      {k.last_used_at && <div className={clsx("flex items-center gap-1 text-xs", isDark ? "text-gray-500" : "text-gray-400")}><Clock size={11} /><span>Last used {timeAgo(k.last_used_at)}</span></div>}
                      {k.expires_at && <div className={clsx("flex items-center gap-1 text-xs", isDark ? "text-gray-500" : "text-gray-400")}><Clock size={11} /><span>Expires {new Date(k.expires_at).toLocaleDateString()}</span></div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
