"use client";
import { useState, useEffect } from "react";
import AuthGuard from "@/components/shared/AuthGuard";
import Navbar from "@/components/shared/Navbar";
import { useTheme } from "@/components/shared/ThemeProvider";
import { api } from "@/lib/api";
import { CheckCircle, XCircle, Download, Filter, Database, MessageSquare, Zap } from "lucide-react";
import clsx from "clsx";

interface Run {
  id: string;
  prompt: string;
  response: string;
  model_name: string;
  latency_ms: number | null;
  tokens_out: number | null;
  created_at: string;
  feedback: { rating: number; correction: string | null; approved_for_training: boolean } | null;
}

interface Stats { total_runs: number; with_feedback: number; approved: number; }

export default function DatasetPage() {
  const { isDark } = useTheme();
  const [runs, setRuns] = useState<Run[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [page, setPage] = useState(1);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [fmt, setFmt] = useState<"alpaca" | "chatml">("alpaca");
  const [navCollapsed, setNavCollapsed] = useState(true);

  const load = async () => {
    const [r, s] = await Promise.all([api.getDatasetRuns(page, approvedOnly), api.getDatasetStats()]);
    setRuns(r); setStats(s);
  };

  useEffect(() => { load().catch(console.error); }, [page, approvedOnly]);

  const doExport = async () => { setExporting(true); try { await api.exportDataset(fmt); } finally { setExporting(false); } };
  const approve = async (feedbackId: string) => { await api.approveFeedback(feedbackId); await load(); };

  const card = clsx("rounded-2xl border p-6 transition-colors", isDark ? "bg-[#111118] border-white/[0.06]" : "bg-white border-gray-200 shadow-sm");
  const heading = clsx("text-2xl font-bold", isDark ? "text-white" : "text-gray-900");
  const subtext = clsx("text-sm mt-1", isDark ? "text-gray-400" : "text-gray-500");

  return (
    <AuthGuard>
      <div className={clsx("flex h-screen overflow-hidden", isDark ? "bg-[#0a0a0f]" : "bg-[#faf9f7]")}>
        <Navbar collapsed={navCollapsed} onToggle={() => setNavCollapsed(v => !v)} />
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className={heading}>Dataset</h1>
                <p className={subtext}>Review and approve conversations for fine-tuning</p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={fmt} onChange={e => setFmt(e.target.value as "alpaca" | "chatml")}
                  className={clsx("rounded-lg px-3 py-2 text-sm focus:outline-none border", isDark ? "bg-gray-800/50 border-white/[0.08] text-white" : "bg-gray-50 border-gray-200 text-gray-900")}
                >
                  <option value="alpaca">Alpaca JSONL</option>
                  <option value="chatml">ChatML JSONL</option>
                </select>
                <button
                  onClick={doExport}
                  disabled={exporting || (stats?.approved ?? 0) === 0}
                  className={clsx(
                    "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all disabled:opacity-40",
                    isDark ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20" : "bg-gradient-to-r from-amber-700 to-amber-900 text-white shadow-lg shadow-amber-900/20"
                  )}
                >
                  <Download size={14} /> {exporting ? "Exporting..." : `Export ${stats?.approved ?? 0} approved`}
                </button>
              </div>
            </div>

            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { label: "Total runs", value: stats.total_runs, icon: <MessageSquare size={14} /> },
                  { label: "With feedback", value: stats.with_feedback, icon: <Zap size={14} /> },
                  { label: "Approved for training", value: stats.approved, icon: <CheckCircle size={14} /> },
                ].map(({ label, value, icon }) => (
                  <div key={label} className={card}>
                    <div className={clsx("text-3xl font-bold", isDark ? "text-cyan-400" : "text-amber-700")}>{value}</div>
                    <div className={clsx("text-xs mt-1 flex items-center gap-1.5", isDark ? "text-gray-400" : "text-gray-500")}>
                      {icon} {label}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Filter */}
            <div className="flex items-center gap-3 mb-4">
              {[
                { label: "All runs", active: !approvedOnly, onClick: () => { setApprovedOnly(false); setPage(1); } },
                { label: "Approved only", active: approvedOnly, onClick: () => { setApprovedOnly(true); setPage(1); }, icon: <Filter size={13} /> },
              ].map(btn => (
                <button
                  key={btn.label}
                  onClick={btn.onClick}
                  className={clsx(
                    "flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors border",
                    btn.active
                      ? isDark ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" : "bg-amber-50 border-amber-300 text-amber-800"
                      : isDark ? "bg-white/[0.03] border-white/[0.06] text-gray-400 hover:bg-white/[0.06]" : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                  )}
                >
                  {btn.icon} {btn.label}
                </button>
              ))}
            </div>

            {/* Runs */}
            <div className="space-y-3">
              {runs.map(run => (
                <div key={run.id} className={clsx("rounded-xl border overflow-hidden transition-colors", isDark ? "bg-[#111118] border-white/[0.06]" : "bg-white border-gray-200 shadow-sm")}>
                  <div
                    className={clsx("flex items-start justify-between p-4 cursor-pointer transition-colors", isDark ? "hover:bg-white/[0.02]" : "hover:bg-gray-50")}
                    onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <p className={clsx("text-sm truncate", isDark ? "text-gray-200" : "text-gray-700")}>{run.prompt}</p>
                      <div className={clsx("flex items-center gap-3 mt-1.5 text-xs", isDark ? "text-gray-500" : "text-gray-400")}>
                        <span>{run.model_name.split("/").pop()}</span>
                        {run.latency_ms && <span>{(run.latency_ms / 1000).toFixed(1)}s</span>}
                        {run.tokens_out && <span>{run.tokens_out} tokens</span>}
                        <span>{new Date(run.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {run.feedback && (
                        <>
                          <span className={clsx("text-xs px-2 py-0.5 rounded-full", run.feedback.rating === 1 ? (isDark ? "bg-green-900/50 text-green-400" : "bg-green-50 text-green-600") : (isDark ? "bg-red-900/50 text-red-400" : "bg-red-50 text-red-600"))}>
                            {run.feedback.rating === 1 ? "+" : "-"}
                          </span>
                          {run.feedback.approved_for_training ? (
                            <span className={clsx("text-xs px-2 py-0.5 rounded-full", isDark ? "bg-cyan-500/10 text-cyan-400" : "bg-amber-50 text-amber-700")}>Approved</span>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); approve(run.id); }}
                              className={clsx("text-xs px-2.5 py-1 rounded-lg transition-colors", isDark ? "bg-white/[0.04] text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400" : "bg-gray-50 text-gray-500 hover:bg-amber-50 hover:text-amber-700")}
                            >
                              Approve
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {expanded === run.id && (
                    <div className={clsx("border-t p-4 space-y-3", isDark ? "border-white/[0.04] bg-black/10" : "border-gray-100 bg-gray-50")}>
                      <div>
                        <div className={clsx("text-xs mb-1 font-medium uppercase tracking-wider", isDark ? "text-gray-500" : "text-gray-400")}>Prompt</div>
                        <p className={clsx("text-sm whitespace-pre-wrap", isDark ? "text-gray-200" : "text-gray-700")}>{run.prompt}</p>
                      </div>
                      <div>
                        <div className={clsx("text-xs mb-1 font-medium uppercase tracking-wider", isDark ? "text-gray-500" : "text-gray-400")}>Response</div>
                        <p className={clsx("text-sm whitespace-pre-wrap", isDark ? "text-gray-300" : "text-gray-600")}>{run.response}</p>
                      </div>
                      {run.feedback?.correction && (
                        <div>
                          <div className={clsx("text-xs mb-1 font-medium uppercase tracking-wider", isDark ? "text-yellow-500" : "text-yellow-600")}>Human correction</div>
                          <p className={clsx("text-sm whitespace-pre-wrap", isDark ? "text-yellow-200" : "text-yellow-700")}>{run.feedback.correction}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-6">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className={clsx("text-sm disabled:opacity-30 transition-colors", isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900")}>← Previous</button>
              <span className={clsx("text-sm", isDark ? "text-gray-500" : "text-gray-400")}>Page {page}</span>
              <button disabled={runs.length < 20} onClick={() => setPage(p => p + 1)} className={clsx("text-sm disabled:opacity-30 transition-colors", isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900")}>Next →</button>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
