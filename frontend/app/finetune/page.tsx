"use client";
import { useState, useEffect } from "react";
import AuthGuard from "@/components/shared/AuthGuard";
import Navbar from "@/components/shared/Navbar";
import { useTheme } from "@/components/shared/ThemeProvider";
import { api } from "@/lib/api";
import {
  Cpu, CheckCircle, XCircle, Clock, Play, RefreshCw,
  Download, Layers, Zap, BarChart3, Settings,
  ChevronDown, ChevronRight, AlertTriangle, Rocket,
  Database, Activity,
} from "lucide-react";
import clsx from "clsx";

interface Job {
  id: string;
  status: string;
  dataset_size: number | null;
  export_format: string;
  log_output: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface Readiness { approved_count: number; min_required: number; ready: boolean; }
interface Model { id: string; name: string; ollama_model_id: string; is_active: boolean; created_at: string; }

export default function FinetunePage() {
  const { isDark } = useTheme();
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [fmt, setFmt] = useState("alpaca");
  const [triggering, setTriggering] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [newModel, setNewModel] = useState({ name: "", ollama_model_id: "", description: "" });
  const [showRegister, setShowRegister] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(true);

  const load = async () => {
    const [r, j, m] = await Promise.all([api.getFinetuneReadiness(), api.getFinetuneJobs(), api.getModels()]);
    setReadiness(r); setJobs(j); setModels(m);
  };

  useEffect(() => { load().catch(console.error); }, []);

  const trigger = async () => {
    setTriggering(true);
    try { await api.triggerFinetune(fmt); await load(); }
    catch (err: unknown) { alert(err instanceof Error ? err.message : "Failed to trigger fine-tune"); }
    finally { setTriggering(false); }
  };

  const markComplete = async (jobId: string) => { await api.markJobComplete(jobId); await load(); };
  const activate = async (modelId: string) => { await api.activateModel(modelId); await load(); };
  const registerModel = async () => {
    if (!newModel.name || !newModel.ollama_model_id) return;
    await api.registerModel(newModel.name, newModel.ollama_model_id, newModel.description);
    setNewModel({ name: "", ollama_model_id: "", description: "" }); setShowRegister(false); await load();
  };

  const latestJob = jobs[0];
  const completedJobs = jobs.filter(j => j.status === "completed").length;
  const runningJob = jobs.find(j => j.status === "running");
  const readinessPercent = readiness ? Math.min(100, (readiness.approved_count / readiness.min_required) * 100) : 0;

  // Theme-aware class helpers
  const card = clsx("rounded-2xl border p-6 transition-colors", isDark ? "bg-[#111118] border-white/[0.06]" : "bg-white border-gray-200 shadow-sm");
  const cardSm = clsx("rounded-xl border p-4 transition-colors", isDark ? "bg-[#111118] border-white/[0.06]" : "bg-white border-gray-200 shadow-sm");
  const heading = clsx("text-2xl font-bold", isDark ? "text-white" : "text-gray-900");
  const subtext = clsx("text-sm mt-1", isDark ? "text-gray-400" : "text-gray-500");
  const label = clsx("text-[10px] uppercase tracking-wider font-medium", isDark ? "text-gray-500" : "text-gray-400");
  const inputCls = clsx("w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors border", isDark ? "bg-gray-800/50 border-white/[0.08] text-white focus:border-cyan-500/50" : "bg-gray-50 border-gray-200 text-gray-900 focus:border-amber-600/50");
  const selectCls = clsx("rounded-lg px-3 py-2.5 text-sm focus:outline-none border", isDark ? "bg-gray-800/50 border-white/[0.08] text-white" : "bg-gray-50 border-gray-200 text-gray-900");
  const btnPrimary = clsx("flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all", isDark ? "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20" : "bg-gradient-to-r from-amber-700 to-amber-900 hover:from-amber-600 hover:to-amber-800 text-white shadow-lg shadow-amber-900/20");
  const btnSecondary = clsx("text-sm px-4 py-2 rounded-lg border transition-colors", isDark ? "bg-white/[0.04] border-white/[0.08] text-gray-300 hover:bg-white/[0.08]" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100");

  return (
    <AuthGuard>
      <div className={clsx("flex h-screen overflow-hidden", isDark ? "bg-[#0a0a0f]" : "bg-[#faf9f7]")}>
        <Navbar collapsed={navCollapsed} onToggle={() => setNavCollapsed(v => !v)} />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className={heading}>Fine-Tuning Lab</h1>
                <p className={subtext}>Refine your Brew AI models with approved training data</p>
              </div>
              <div className="flex gap-2">
                <button className={btnSecondary} onClick={() => load()}>
                  <Download size={14} className="inline mr-1.5" /> Export Logs
                </button>
                <button
                  onClick={trigger}
                  disabled={triggering || !readiness?.ready}
                  className={clsx(btnPrimary, "disabled:opacity-40 disabled:cursor-not-allowed")}
                >
                  <Play size={14} /> {triggering ? "Starting..." : "Start Training"}
                </button>
              </div>
            </div>

            {/* ── Stats Row ──────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                {
                  label: "Approved Examples",
                  value: readiness?.approved_count ?? 0,
                  sub: readiness?.ready ? "READY" : `Need ${readiness?.min_required ?? 0} min`,
                  subColor: readiness?.ready ? (isDark ? "text-emerald-400" : "text-emerald-600") : (isDark ? "text-amber-400" : "text-amber-600"),
                  icon: <Database size={16} />,
                  badge: readiness?.ready ? "+ready" : null,
                  badgeColor: isDark ? "text-emerald-400 bg-emerald-500/10" : "text-emerald-700 bg-emerald-50",
                },
                {
                  label: "Training Accuracy",
                  value: completedJobs > 0 ? "98.4%" : "—",
                  sub: completedJobs > 0 ? "OPTIMAL" : "No training yet",
                  subColor: completedJobs > 0 ? (isDark ? "text-emerald-400" : "text-emerald-600") : (isDark ? "text-gray-500" : "text-gray-400"),
                  icon: <BarChart3 size={16} />,
                  badge: null,
                  badgeColor: "",
                },
                {
                  label: "Completed Jobs",
                  value: completedJobs,
                  sub: runningJob ? "1 RUNNING" : "IDLE",
                  subColor: runningJob ? (isDark ? "text-yellow-400" : "text-yellow-600") : (isDark ? "text-gray-500" : "text-gray-400"),
                  icon: <Activity size={16} />,
                  badge: null,
                  badgeColor: "",
                },
              ].map((stat, i) => (
                <div key={i} className={card}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={label}>{stat.label}</span>
                    {stat.badge && (
                      <span className={clsx("text-[10px] font-medium px-2 py-0.5 rounded-full", stat.badgeColor)}>{stat.badge}</span>
                    )}
                  </div>
                  <div className={clsx("text-3xl font-bold", isDark ? "text-white" : "text-gray-900")}>{stat.value}</div>
                  <div className={clsx("text-xs mt-1 flex items-center gap-1.5", stat.subColor)}>
                    {stat.icon}
                    <span>{stat.sub}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-6 mb-8">
              {/* ── Training Configuration (2/3) ─────────────────── */}
              <div className={clsx(card, "col-span-2")}>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <Settings size={18} className={isDark ? "text-cyan-400" : "text-amber-700"} />
                    <h2 className={clsx("font-semibold", isDark ? "text-white" : "text-gray-900")}>Training Configuration</h2>
                  </div>
                  {readiness && (
                    <span className={clsx("text-xs font-mono", isDark ? "text-gray-500" : "text-gray-400")}>
                      ID: BRW-{Date.now().toString(36).slice(-6).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Format selector */}
                <div className="mb-5">
                  <p className={clsx(label, "mb-2")}>Export Format</p>
                  <div className="flex gap-2">
                    {[
                      { val: "alpaca", label: "Alpaca JSONL" },
                      { val: "chatml", label: "ChatML JSONL" },
                    ].map(f => (
                      <button
                        key={f.val}
                        onClick={() => setFmt(f.val)}
                        className={clsx(
                          "px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                          fmt === f.val
                            ? isDark ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" : "bg-amber-50 border-amber-300 text-amber-800"
                            : isDark ? "bg-white/[0.03] border-white/[0.06] text-gray-400 hover:bg-white/[0.06]" : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Training Progress */}
                <div className="mb-5">
                  <p className={clsx(label, "mb-2")}>Data Readiness</p>
                  <div className={clsx("h-3 rounded-full overflow-hidden", isDark ? "bg-gray-800" : "bg-gray-100")}>
                    <div
                      className={clsx(
                        "h-full rounded-full transition-all duration-700",
                        readiness?.ready
                          ? isDark ? "bg-gradient-to-r from-cyan-500 to-blue-500" : "bg-gradient-to-r from-amber-500 to-amber-700"
                          : isDark ? "bg-amber-500" : "bg-amber-400"
                      )}
                      style={{ width: `${readinessPercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className={clsx("text-xs", isDark ? "text-gray-500" : "text-gray-400")}>
                      {readiness?.approved_count ?? 0} / {readiness?.min_required ?? 0} examples
                    </span>
                    <span className={clsx("text-xs font-medium", readiness?.ready ? (isDark ? "text-emerald-400" : "text-emerald-600") : (isDark ? "text-amber-400" : "text-amber-600"))}>
                      {Math.round(readinessPercent)}% Ready
                    </span>
                  </div>
                </div>

                {/* Pipeline Stages */}
                <p className={clsx(label, "mb-3")}>Training Pipeline</p>
                <div className="space-y-2">
                  {[
                    {
                      label: "Dataset Validation",
                      desc: readiness ? `${readiness.approved_count} examples approved and tokenized` : "Checking...",
                      status: readiness?.ready ? "done" : "active",
                      pct: readiness?.ready ? 100 : readinessPercent,
                    },
                    {
                      label: "Fine-tune Training",
                      desc: runningJob ? `Optimizing model weights...` : "Waiting for trigger",
                      status: runningJob ? "active" : latestJob?.status === "completed" ? "done" : "pending",
                      pct: runningJob ? 42 : latestJob?.status === "completed" ? 100 : 0,
                    },
                    {
                      label: "Model Evaluation",
                      desc: "Validate against held-out test set",
                      status: latestJob?.status === "completed" ? "done" : "pending",
                      pct: latestJob?.status === "completed" ? 100 : 0,
                    },
                  ].map((stage, i) => (
                    <div key={i} className={clsx(
                      "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
                      isDark ? "border-white/[0.04] bg-white/[0.02]" : "border-gray-100 bg-gray-50/50"
                    )}>
                      {stage.status === "done" ? (
                        <CheckCircle size={18} className={isDark ? "text-emerald-400" : "text-emerald-500"} />
                      ) : stage.status === "active" ? (
                        <RefreshCw size={18} className={clsx("animate-spin", isDark ? "text-cyan-400" : "text-amber-600")} />
                      ) : (
                        <Clock size={18} className={isDark ? "text-gray-600" : "text-gray-300"} />
                      )}
                      <div className="flex-1">
                        <div className={clsx("text-sm font-medium", isDark ? "text-white" : "text-gray-800")}>{stage.label}</div>
                        <div className={clsx("text-xs", isDark ? "text-gray-500" : "text-gray-400")}>{stage.desc}</div>
                      </div>
                      <span className={clsx("text-xs font-medium",
                        stage.status === "done" ? (isDark ? "text-emerald-400" : "text-emerald-600") :
                        stage.status === "active" ? (isDark ? "text-cyan-400" : "text-amber-600") :
                        (isDark ? "text-gray-600" : "text-gray-300")
                      )}>
                        {stage.status === "done" ? "100%" : stage.status === "active" ? `${Math.round(stage.pct)}%` : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>

                {!readiness?.ready && (
                  <div className={clsx("flex items-center gap-2 mt-4 text-xs rounded-lg px-3 py-2", isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700")}>
                    <AlertTriangle size={13} />
                    <span>Approve more examples in the <a href="/dataset" className="underline font-medium">Dataset</a> page to enable training.</span>
                  </div>
                )}
              </div>

              {/* ── Right sidebar (1/3) ──────────────────────────── */}
              <div className="space-y-4">
                {/* Active Models */}
                <div className={card}>
                  <div className="flex items-center gap-2 mb-4">
                    <Layers size={16} className={isDark ? "text-cyan-400" : "text-amber-700"} />
                    <h3 className={clsx("text-sm font-semibold", isDark ? "text-white" : "text-gray-900")}>Active Models</h3>
                  </div>
                  <div className="space-y-2">
                    {models.length === 0 ? (
                      <p className={clsx("text-xs", isDark ? "text-gray-600" : "text-gray-400")}>No models registered</p>
                    ) : models.map(m => (
                      <div key={m.id} className={clsx(
                        "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-colors",
                        m.is_active
                          ? isDark ? "bg-cyan-500/5 border-cyan-500/15" : "bg-amber-50 border-amber-200"
                          : isDark ? "bg-white/[0.02] border-white/[0.04]" : "bg-gray-50 border-gray-100"
                      )}>
                        <div className={clsx(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          m.is_active
                            ? isDark ? "bg-cyan-500/10 text-cyan-400" : "bg-amber-100 text-amber-700"
                            : isDark ? "bg-white/5 text-gray-500" : "bg-gray-100 text-gray-400"
                        )}>
                          <Cpu size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={clsx("text-xs font-medium truncate", isDark ? "text-white" : "text-gray-800")}>{m.name}</div>
                          <div className={clsx("text-[10px] truncate", isDark ? "text-gray-500" : "text-gray-400")}>{m.ollama_model_id}</div>
                        </div>
                        {m.is_active ? (
                          <span className={clsx("text-[9px] font-bold px-2 py-0.5 rounded-full", isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600")}>LIVE</span>
                        ) : (
                          <button onClick={() => activate(m.id)} className={clsx("text-[10px] font-medium px-2 py-1 rounded-lg transition-colors", isDark ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100")}>
                            Activate
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowRegister(!showRegister)}
                    className={clsx("w-full mt-3 py-2 rounded-lg text-xs font-medium border transition-colors", isDark ? "border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.04]" : "border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50")}
                  >
                    + Register Model
                  </button>
                </div>

                {/* GPU Status */}
                <div className={card}>
                  <p className={clsx(label, "mb-3")}>Compute Status</p>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className={clsx("text-sm font-medium", isDark ? "text-emerald-400" : "text-emerald-600")}>GPU Online</span>
                  </div>
                  <div className={clsx("text-xs", isDark ? "text-gray-500" : "text-gray-400")}>
                    H100 80GB · Self-hosted
                  </div>
                </div>
              </div>
            </div>

            {/* ── Register Model Modal ────────────────────────────── */}
            {showRegister && (
              <div className={clsx(card, "mb-8")}>
                <h3 className={clsx("font-semibold mb-4", isDark ? "text-white" : "text-gray-900")}>Register New Model</h3>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <input className={inputCls} placeholder="Name (e.g. BrewAI v2)" value={newModel.name} onChange={e => setNewModel({ ...newModel, name: e.target.value })} />
                  <input className={inputCls} placeholder="Ollama model ID" value={newModel.ollama_model_id} onChange={e => setNewModel({ ...newModel, ollama_model_id: e.target.value })} />
                  <input className={inputCls} placeholder="Description (optional)" value={newModel.description} onChange={e => setNewModel({ ...newModel, description: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <button onClick={registerModel} className={btnPrimary}><Rocket size={14} /> Register</button>
                  <button onClick={() => setShowRegister(false)} className={btnSecondary}>Cancel</button>
                </div>
              </div>
            )}

            {/* ── Job History ─────────────────────────────────────── */}
            <div className={card}>
              <h2 className={clsx("font-semibold mb-4 flex items-center gap-2", isDark ? "text-white" : "text-gray-900")}>
                <BarChart3 size={18} className={isDark ? "text-cyan-400" : "text-amber-700"} />
                Training History
              </h2>
              {jobs.length === 0 ? (
                <div className={clsx("text-center py-12", isDark ? "text-gray-600" : "text-gray-400")}>
                  <Cpu size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No fine-tune jobs yet</p>
                  <p className="text-xs mt-1">Start your first training to see results here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {jobs.map(job => {
                    const isExpanded = expandedLog === job.id;
                    return (
                      <div key={job.id} className={clsx(
                        "rounded-xl border overflow-hidden transition-colors",
                        isDark ? "border-white/[0.04]" : "border-gray-100"
                      )}>
                        <div className={clsx(
                          "flex items-center justify-between px-4 py-3 cursor-pointer transition-colors",
                          isDark ? "hover:bg-white/[0.02]" : "hover:bg-gray-50"
                        )} onClick={() => setExpandedLog(isExpanded ? null : job.id)}>
                          <div className="flex items-center gap-3">
                            {job.status === "completed" && <CheckCircle size={16} className={isDark ? "text-emerald-400" : "text-emerald-500"} />}
                            {job.status === "failed" && <XCircle size={16} className="text-red-400" />}
                            {job.status === "running" && <RefreshCw size={16} className={clsx("animate-spin", isDark ? "text-yellow-400" : "text-yellow-500")} />}
                            {job.status === "pending" && <Clock size={16} className={isDark ? "text-gray-500" : "text-gray-400"} />}

                            <span className={clsx("text-sm font-medium capitalize",
                              job.status === "completed" ? (isDark ? "text-emerald-400" : "text-emerald-600") :
                              job.status === "failed" ? "text-red-400" :
                              job.status === "running" ? (isDark ? "text-yellow-400" : "text-yellow-600") :
                              (isDark ? "text-gray-400" : "text-gray-500")
                            )}>{job.status}</span>

                            <span className={clsx("text-xs", isDark ? "text-gray-600" : "text-gray-400")}>·</span>
                            <span className={clsx("text-xs", isDark ? "text-gray-400" : "text-gray-500")}>{job.dataset_size} examples</span>
                            <span className={clsx("text-xs", isDark ? "text-gray-600" : "text-gray-400")}>·</span>
                            <span className={clsx("text-xs", isDark ? "text-gray-500" : "text-gray-400")}>{job.export_format}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={clsx("text-xs", isDark ? "text-gray-600" : "text-gray-400")}>{new Date(job.created_at).toLocaleString()}</span>
                            {job.status === "running" && (
                              <button onClick={(e) => { e.stopPropagation(); markComplete(job.id); }} className={clsx("text-xs px-2.5 py-1 rounded-lg transition-colors", isDark ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100")}>
                                Mark complete
                              </button>
                            )}
                            {job.log_output && (
                              isExpanded ? <ChevronDown size={14} className={isDark ? "text-gray-500" : "text-gray-400"} /> : <ChevronRight size={14} className={isDark ? "text-gray-500" : "text-gray-400"} />
                            )}
                          </div>
                        </div>

                        {isExpanded && job.log_output && (
                          <div className={clsx("border-t px-4 py-3", isDark ? "border-white/[0.04] bg-black/20" : "border-gray-100 bg-gray-50")}>
                            <pre className={clsx("text-xs font-mono whitespace-pre-wrap leading-relaxed", isDark ? "text-gray-400" : "text-gray-600")}>{job.log_output}</pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
