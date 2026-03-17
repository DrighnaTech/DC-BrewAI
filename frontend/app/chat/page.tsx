"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import AuthGuard from "@/components/shared/AuthGuard";
import Navbar from "@/components/shared/Navbar";
import MarkdownRenderer from "@/components/chat/MarkdownRenderer";
import { api } from "@/lib/api";
import { getUserEmail } from "@/lib/auth";
import { streamChat, streamChatWithFiles, RouteInfo } from "@/lib/streaming";
import {
  ThumbsUp, ThumbsDown, Plus, Trash2, Send,
  Paperclip, X, Image as ImageIcon, Code2, MessageSquare,
  Eye, ChevronDown, Sparkles, Bot,
  FileText, Camera, Search, MoreHorizontal,
  PanelLeftClose, PanelLeft, Zap, Copy, Check,
  Coffee, User, Settings, Hash, Clock, Shield,
  ChevronRight, Lightbulb, PenTool, BarChart3,
  PanelRightClose, PanelRight, Wifi,
} from "lucide-react";
import { useTheme } from "@/components/shared/ThemeProvider";
import clsx from "clsx";

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  run_id?: string;
  streaming?: boolean;
  route?: RouteInfo;
  model_name?: string;
  files?: { name: string; type: string; preview?: string }[];
  timestamp?: number;
}

interface Session {
  id: string;
  title: string;
}

type RouteMode = "auto" | "general" | "coder" | "ocr";

const ROUTE_STYLES: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode; label: string }> = {
  general: { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", icon: <MessageSquare size={12} />, label: "Brew Chat" },
  coder:   { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: <Code2 size={12} />, label: "Brew Code" },
  ocr:     { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", icon: <Eye size={12} />, label: "Brew OCR" },
  ocr_then_general: { color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20", icon: <Sparkles size={12} />, label: "Brew OCR + Chat" },
  ocr_then_coder:   { color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/20", icon: <Zap size={12} />, label: "Brew OCR + Code" },
};

const MODE_OPTIONS: { value: RouteMode; label: string; icon: React.ReactNode; desc: string; color: string }[] = [
  { value: "auto", label: "Auto", icon: <Sparkles size={15} />, desc: "Smart routing", color: "text-cyan-400" },
  { value: "general", label: "Brew Chat", icon: <MessageSquare size={15} />, desc: "Chat & analysis", color: "text-blue-400" },
  { value: "coder", label: "Brew Code", icon: <Code2 size={15} />, desc: "Programming", color: "text-emerald-400" },
  { value: "ocr", label: "Brew OCR", icon: <Camera size={15} />, desc: "Images & PDFs", color: "text-amber-400" },
];

const SUGGESTED_PROMPTS = [
  { icon: <Lightbulb size={14} />, text: "What would happen if the moon suddenly disappeared?", color: "text-cyan-400" },
  { icon: <Code2 size={14} />, text: "Build a Redis-like in-memory cache in Python", color: "text-emerald-400" },
  { icon: <Camera size={14} />, text: "Upload a PDF or image — I'll extract and analyze the text", color: "text-amber-400" },
  { icon: <BarChart3 size={14} />, text: "Compare RAG vs fine-tuning — when should I use each?", color: "text-purple-400" },
];

const BREW_GREETINGS = [
  "Hello! Your brew is ready. What can I help you with today?",
  "Welcome back! Let's brew something great together.",
  "Hey there! I'm warmed up and ready to go. What's on your mind?",
  "Good to see you! Drop a question and I'll route it to the perfect model.",
];

// ── Component ────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const { isDark } = useTheme();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, number>>({});
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");
  const [routeMode, setRouteMode] = useState<RouteMode>("auto");
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState(0);
  const [greeting] = useState(() => BREW_GREETINGS[Math.floor(Math.random() * BREW_GREETINGS.length)]);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);

  // ── Init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    api.getSessions().then(setSessions).catch(console.error);
    setUserEmail(getUserEmail());
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) setShowModeMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  // Track token count (rough estimate)
  useEffect(() => {
    const totalChars = messages.reduce((acc, m) => acc + m.content.length, 0);
    setTokenCount(Math.round(totalChars / 4));
  }, [messages]);

  // ── File handling ──────────────────────────────────────────────────────
  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles).filter(f => f.type.startsWith("image/") || f.type === "application/pdf");
    setAttachedFiles(prev => [...prev, ...fileArray]);
    fileArray.forEach(file => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => setFilePreviews(prev => [...prev, e.target?.result as string]);
        reader.readAsDataURL(file);
      } else {
        setFilePreviews(prev => [...prev, ""]);
      }
    });
  }, []);

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    setFilePreviews(prev => prev.filter((_, i) => i !== index));
  };

  // ── Drag & drop ────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  // ── Sessions ───────────────────────────────────────────────────────────
  const selectSession = async (id: string) => {
    setActiveSession(id);
    try {
      const msgs = await api.getMessages(id);
      setMessages(msgs.map((m: any) => ({
        id: m.id, role: m.role as "user" | "assistant", content: m.content,
        run_id: m.role === "assistant" ? m.id : undefined, model_name: m.model_name,
        timestamp: m.created_at ? new Date(m.created_at).getTime() : undefined,
      })));
    } catch { setMessages([]); }
  };

  const newSession = async () => {
    const s = await api.createSession();
    setSessions(prev => [s, ...prev]);
    setActiveSession(s.id);
    setMessages([]);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.deleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSession === id) { setActiveSession(null); setMessages([]); }
  };

  // ── Copy message ───────────────────────────────────────────────────────
  const copyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Send message ───────────────────────────────────────────────────────
  const send = async (overrideInput?: string) => {
    const text = overrideInput || input;
    if (!text.trim() || !activeSession || loading) return;

    const hasFiles = attachedFiles.length > 0;
    const fileInfo = attachedFiles.map(f => ({
      name: f.name, type: f.type,
      preview: filePreviews[attachedFiles.indexOf(f)] || undefined,
    }));

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text, files: hasFiles ? fileInfo : undefined, timestamp: Date.now() };
    const assistantMsg: Message = { id: "streaming", role: "assistant", content: "", streaming: true, timestamp: Date.now() };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    const prompt = text;
    const filesToSend = [...attachedFiles];
    setInput(""); setAttachedFiles([]); setFilePreviews([]); setLoading(true);

    const onDelta = (delta: string) => {
      setMessages(prev => prev.map(m => m.id === "streaming" ? { ...m, content: m.content + delta } : m));
    };
    const onDone = (runId: string | null) => {
      setMessages(prev => prev.map(m =>
        m.id === "streaming" ? { ...m, id: runId || Date.now().toString(), streaming: false, run_id: runId || undefined } : m
      ));
      api.getSessions().then(setSessions).catch(console.error);
      setLoading(false);
    };
    const onError = (err: string) => {
      setMessages(prev => prev.map(m =>
        m.id === "streaming" ? { ...m, content: `Error: ${err}`, streaming: false } : m
      ));
      setLoading(false);
    };
    const onRoute = (route: RouteInfo) => {
      setMessages(prev => prev.map(m => m.id === "streaming" ? { ...m, route } : m));
    };

    if (hasFiles) {
      await streamChatWithFiles(activeSession, prompt, filesToSend, onDelta, onDone, onError, onRoute, false, routeMode);
    } else {
      await streamChat(activeSession, prompt, onDelta, onDone, onError, onRoute, false, null, routeMode);
    }
  };

  // ── Feedback ───────────────────────────────────────────────────────────
  const giveFeedback = async (runId: string, rating: number) => {
    if (correcting === runId && correction.trim()) {
      await api.submitFeedback(runId, rating, correction);
      setFeedbackMap(prev => ({ ...prev, [runId]: rating }));
      setCorrecting(null); setCorrection("");
    } else {
      await api.submitFeedback(runId, rating);
      setFeedbackMap(prev => ({ ...prev, [runId]: rating }));
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const filteredSessions = searchQuery
    ? sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions;

  const lastRoute = [...messages].reverse().find(m => m.route)?.route;
  const activeModel = lastRoute
    ? (ROUTE_STYLES[lastRoute.name]?.label || "Brew Chat") + " v1"
    : MODE_OPTIONS.find(m => m.value === routeMode)?.label || "Auto";

  const msgCount = messages.filter(m => m.role === "assistant" && !m.streaming).length;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <AuthGuard>
      <div className={clsx("flex h-screen overflow-hidden", isDark ? "bg-[#0a0a0f]" : "bg-[#faf9f7]")} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        <Navbar collapsed={navCollapsed} onToggle={() => setNavCollapsed(v => !v)} />

        {/* ── Session sidebar ──────────────────────────────────────────── */}
        <div className={clsx(
          "flex-shrink-0 border-r flex flex-col transition-all duration-300",
          isDark ? "bg-[#0d0d14] border-white/[0.04]" : "bg-white border-gray-200",
          sidebarOpen ? "w-[260px]" : "w-0 overflow-hidden"
        )}>
          {/* Sidebar header */}
          <div className="p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={newSession}
                className={clsx(
                  "flex-1 flex items-center justify-center gap-2 text-[13px] font-medium rounded-lg px-3 py-2.5 transition-all border",
                  isDark ? "bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-600/30 hover:to-blue-600/30 text-cyan-300 hover:text-white border-cyan-500/20 hover:border-cyan-500/30" : "bg-gradient-to-r from-amber-100 to-amber-50 hover:from-amber-200 hover:to-amber-100 text-amber-800 border-amber-200 hover:border-amber-300"
                )}
              >
                <Plus size={14} /> New Chat
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                className={clsx("p-2 transition-colors rounded-lg", isDark ? "text-gray-600 hover:text-gray-400 hover:bg-white/5" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100")}
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className={clsx("w-full rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none transition-colors border", isDark ? "bg-white/[0.03] border-white/[0.06] text-gray-400 placeholder:text-gray-600 focus:border-white/[0.12]" : "bg-gray-50 border-gray-200 text-gray-600 placeholder:text-gray-400 focus:border-gray-300")}
              />
            </div>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            <div className="space-y-0.5">
              {filteredSessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => selectSession(s.id)}
                  className={clsx(
                    "flex items-center justify-between px-3 py-2 rounded-lg text-[13px] cursor-pointer group transition-all duration-150",
                    activeSession === s.id
                      ? isDark ? "bg-cyan-500/10 text-white border border-cyan-500/15" : "bg-amber-50 text-amber-900 border border-amber-200"
                      : isDark ? "text-gray-500 hover:bg-white/[0.04] hover:text-gray-300 border border-transparent" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 border border-transparent"
                  )}
                >
                  <span className="truncate flex-1">{s.title}</span>
                  <button
                    onClick={e => deleteSession(s.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 ml-2 p-0.5 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {filteredSessions.length === 0 && (
                <p className="text-center text-gray-700 text-xs py-8">
                  {searchQuery ? "No matching chats" : "No conversations yet"}
                </p>
              )}
            </div>
          </div>

          {/* User profile */}
          <div className={clsx("p-3 border-t", isDark ? "border-white/[0.04]" : "border-gray-200")}>
            <div className="flex items-center gap-2.5">
              <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold", isDark ? "bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-400" : "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-800")}>
                {userEmail ? userEmail.charAt(0).toUpperCase() : <User size={14} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={clsx("text-[12px] font-medium truncate", isDark ? "text-white" : "text-gray-800")}>{userEmail ? userEmail.split("@")[0] : "User"}</div>
                <div className={clsx("text-[10px] truncate", isDark ? "text-gray-600" : "text-gray-400")}>Team Member</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Main chat area ───────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Top bar */}
          <div className={clsx("flex items-center justify-between px-4 py-2.5 border-b backdrop-blur-sm", isDark ? "border-white/[0.04] bg-[#0a0a0f]/80" : "border-gray-200 bg-white/80")}>
            <div className="flex items-center gap-2">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className={clsx("p-1.5 transition-colors rounded-lg mr-1", isDark ? "text-gray-600 hover:text-gray-400 hover:bg-white/5" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100")}
                >
                  <PanelLeft size={16} />
                </button>
              )}
              {activeSession ? (
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className={clsx("text-sm font-medium", isDark ? "text-white" : "text-gray-900")}>
                    {sessions.find(s => s.id === activeSession)?.title || "New Chat"}
                  </span>
                  {loading && (
                    <div className="flex items-center gap-1.5 text-[11px] text-cyan-400/70">
                      <Coffee size={12} className="animate-bounce" />
                      <span>Brewing...</span>
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-sm text-gray-500">Select or start a chat</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeSession && (
                <div className={clsx(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium",
                  routeMode === "auto" ? "bg-cyan-500/10 text-cyan-400" :
                  routeMode === "coder" ? "bg-emerald-500/10 text-emerald-400" :
                  routeMode === "ocr" ? "bg-amber-500/10 text-amber-400" :
                  "bg-blue-500/10 text-blue-400"
                )}>
                  {MODE_OPTIONS.find(m => m.value === routeMode)?.icon}
                  {MODE_OPTIONS.find(m => m.value === routeMode)?.label}
                </div>
              )}
              {activeSession && (
                <button
                  onClick={() => setRightPanelOpen(v => !v)}
                  className={clsx("p-1.5 transition-colors rounded-lg", isDark ? "text-gray-600 hover:text-gray-400 hover:bg-white/5" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100")}
                  title={rightPanelOpen ? "Hide settings" : "Show settings"}
                >
                  {rightPanelOpen ? <PanelRightClose size={16} /> : <PanelRight size={16} />}
                </button>
              )}
            </div>
          </div>

          {/* Drag overlay */}
          {isDragging && (
            <div className={clsx("absolute inset-0 z-50 backdrop-blur-md flex items-center justify-center", isDark ? "bg-[#0a0a0f]/90" : "bg-white/90")}>
              <div className={clsx("text-center p-8 rounded-2xl border-2 border-dashed", isDark ? "border-cyan-500/40 bg-cyan-500/5" : "border-amber-400/40 bg-amber-50")}>
                <ImageIcon size={40} className={clsx("mx-auto mb-3", isDark ? "text-cyan-400" : "text-amber-600")} />
                <p className={clsx("text-base font-medium", isDark ? "text-white" : "text-gray-900")}>Drop files here</p>
                <p className={clsx("text-xs mt-1", isDark ? "text-gray-500" : "text-gray-400")}>Images (PNG, JPG, WebP) and PDFs supported</p>
              </div>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            {/* ── Chat content ───────────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {!activeSession ? (
                /* ── Empty state / Welcome ────────────────────────────── */
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-xl mx-auto px-6">
                    {/* Logo */}
                    <div className="relative w-24 h-24 mx-auto mb-8">
                      <div className={clsx("absolute inset-0 rounded-full opacity-15 blur-xl animate-pulse", isDark ? "bg-cyan-500" : "bg-amber-500")} />
                      <img src="/logo.png" alt="DataCaffe" className="relative w-24 h-24 drop-shadow-2xl" />
                    </div>

                    <h1 className={clsx("text-3xl font-bold mb-1 tracking-tight", isDark ? "text-white" : "text-gray-900")}>BrewAI Gateway</h1>
                    <p className={clsx("text-[11px] font-mono mb-2", isDark ? "text-gray-600" : "text-gray-400")}>v1.0.0</p>
                    <p className={clsx("mb-10 text-[15px]", isDark ? "text-gray-500" : "text-gray-500")}>
                      Your message is automatically routed to the best model
                    </p>

                    {/* Route cards */}
                    <div className="grid grid-cols-3 gap-3 mb-10">
                      {[
                        { icon: <MessageSquare size={22} />, label: "Brew Chat", desc: "Chat, Q&A, analysis", colorClass: isDark ? "text-cyan-400" : "text-amber-700" },
                        { icon: <Code2 size={22} />, label: "Brew Code", desc: "Write & debug code", colorClass: isDark ? "text-emerald-400" : "text-emerald-700" },
                        { icon: <Camera size={22} />, label: "Brew OCR", desc: "Extract text from images & PDFs", colorClass: isDark ? "text-amber-400" : "text-amber-700" },
                      ].map(item => (
                        <div
                          key={item.label}
                          className={clsx("group rounded-xl p-5 border transition-all duration-200 cursor-default", isDark ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.10]" : "border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 shadow-sm")}
                        >
                          <div className={clsx("mb-3 group-hover:scale-110 transition-transform", item.colorClass)}>{item.icon}</div>
                          <div className={clsx("text-sm font-semibold mb-0.5", isDark ? "text-white" : "text-gray-900")}>{item.label}</div>
                          <div className={clsx("text-[11px]", isDark ? "text-gray-600" : "text-gray-500")}>{item.desc}</div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={newSession}
                      className={clsx("rounded-xl px-8 py-3 text-sm font-medium transition-all inline-flex items-center gap-2 text-white shadow-lg", isDark ? "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-cyan-500/20 hover:shadow-cyan-500/30" : "bg-gradient-to-r from-amber-700 to-amber-900 hover:from-amber-600 hover:to-amber-800 shadow-amber-900/20 hover:shadow-amber-900/30")}
                    >
                      <Plus size={16} /> Start a new chat
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* ── Messages ──────────────────────────────────────── */}
                  <div className="flex-1 overflow-y-auto">
                    <div className="max-w-3xl mx-auto px-4 py-6 space-y-1">
                      {/* Welcome message when chat is empty */}
                      {messages.length === 0 && (
                        <div className="py-6">
                          {/* Greeting from Brew AI */}
                          <div className="flex gap-3 mb-8">
                            <img src="/logo.png" alt="DataCaffe" className="flex-shrink-0 w-8 h-8 rounded-lg drop-shadow-md" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={clsx("text-[13px] font-semibold", isDark ? "text-white" : "text-gray-900")}>Brew AI</span>
                                <span className={clsx("text-[10px] font-mono", isDark ? "text-gray-600" : "text-gray-400")}>v1.0.0</span>
                              </div>
                              <div className={clsx("rounded-2xl rounded-tl-md px-4 py-3 text-[14px] leading-relaxed max-w-lg border", isDark ? "bg-white/[0.03] border-white/[0.06] text-gray-300" : "bg-gray-50 border-gray-200 text-gray-600")}>
                                {greeting}
                              </div>
                            </div>
                          </div>

                          {/* Suggested prompts */}
                          <div className="ml-11">
                            <p className="text-[11px] text-gray-600 uppercase tracking-wider font-medium mb-3">Try asking</p>
                            <div className="grid grid-cols-2 gap-2">
                              {SUGGESTED_PROMPTS.map((prompt, i) => (
                                <button
                                  key={i}
                                  onClick={() => {
                                    setInput(prompt.text);
                                    setTimeout(() => send(prompt.text), 100);
                                  }}
                                  className={clsx("flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all text-left group", isDark ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12]" : "border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300")}
                                >
                                  <span className={clsx("flex-shrink-0", prompt.color)}>{prompt.icon}</span>
                                  <span className={clsx("text-[12px] transition-colors leading-snug", isDark ? "text-gray-400 group-hover:text-gray-200" : "text-gray-500 group-hover:text-gray-700")}>{prompt.text}</span>
                                  <ChevronRight size={10} className={clsx("ml-auto flex-shrink-0 transition-colors", isDark ? "text-gray-700 group-hover:text-gray-400" : "text-gray-300 group-hover:text-gray-500")} />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {messages.map((msg) => (
                        <div key={msg.id}>
                          {/* ── User message ─────────────────────────── */}
                          {msg.role === "user" && (
                            <div className="py-3">
                              {/* Attached files */}
                              {msg.files && msg.files.length > 0 && (
                                <div className="flex gap-2 mb-2 justify-end">
                                  {msg.files.map((f, i) => (
                                    <div key={i} className="relative">
                                      {f.preview ? (
                                        <img src={f.preview} alt={f.name} className={clsx("rounded-xl object-cover border shadow-lg", isDark ? "border-white/10" : "border-gray-200", msg.files!.length === 1 ? "w-48 h-36" : "w-20 h-20")} />
                                      ) : (
                                        <div className={clsx("w-20 h-20 rounded-xl flex items-center justify-center border", isDark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")}>
                                          <FileText size={18} className={isDark ? "text-gray-600" : "text-gray-400"} />
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex justify-end gap-2.5">
                                <div className={clsx("rounded-2xl rounded-tr-md px-4 py-2.5 text-[14px] max-w-[75%] border", isDark ? "bg-gradient-to-br from-cyan-600/20 to-blue-600/20 border-cyan-500/15 text-gray-200" : "bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200 text-gray-800")}>
                                  {msg.content}
                                </div>
                                <div className={clsx("flex-shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center mt-0.5", isDark ? "bg-white/[0.08] border-white/[0.08]" : "bg-amber-50 border-amber-200")}>
                                  <User size={13} className={isDark ? "text-gray-400" : "text-amber-700"} />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* ── Assistant message ────────────────────── */}
                          {msg.role === "assistant" && (
                            <div className="py-3 group/msg">
                              {/* Route badge */}
                              {msg.route && (
                                <div className="flex items-center gap-2 mb-2 ml-11">
                                  {(() => {
                                    const s = ROUTE_STYLES[msg.route.name] || ROUTE_STYLES.general;
                                    const modelLabels = msg.route.models.map(m => {
                                      const base = m.split(":")[0].split("/").pop() || m;
                                      if (base.includes("qwen3")) return "Brew Chat v1";
                                      if (base.includes("coder")) return "Brew Code v1";
                                      if (base.includes("ocr") || base.includes("deepseek")) return "Brew OCR v1";
                                      return base;
                                    });
                                    return (
                                      <div className={clsx("inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider", s.bg, s.color)}>
                                        {s.icon}
                                        <span>{msg.route.models.length > 1 ? "Switching to" : "Analyzing via"} {s.label}</span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}

                              <div className="flex gap-3">
                                {/* Bot avatar */}
                                <img src="/logo.png" alt="DataCaffe" className="flex-shrink-0 w-8 h-8 rounded-lg mt-0.5 drop-shadow-md" />

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={clsx("text-[13px] font-semibold", isDark ? "text-white" : "text-gray-900")}>Brew AI</span>
                                    {msg.streaming && (
                                      <span className="text-[10px] text-cyan-400/60 flex items-center gap-1">
                                        <Coffee size={10} className="animate-spin" /> Brewing...
                                      </span>
                                    )}
                                  </div>

                                  <div className={clsx(
                                    "rounded-2xl rounded-tl-md px-4 py-3 border",
                                    isDark ? "bg-white/[0.02] border-white/[0.04]" : "bg-gray-50 border-gray-200",
                                    msg.streaming && "streaming-cursor"
                                  )}>
                                    {msg.content ? (
                                      <MarkdownRenderer content={msg.content} />
                                    ) : msg.streaming ? (
                                      <div className="flex items-center gap-2 py-1">
                                        <div className="flex gap-1">
                                          <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                          <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                          <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                        </div>
                                        <span className="text-xs text-gray-600">Brewing your response...</span>
                                      </div>
                                    ) : (
                                      <span className="text-gray-600">...</span>
                                    )}
                                  </div>

                                  {/* Action bar */}
                                  {!msg.streaming && msg.run_id && (
                                    <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => copyMessage(msg.id, msg.content)}
                                        className={clsx("p-1.5 rounded-md transition-all", isDark ? "text-gray-600 hover:text-gray-400 hover:bg-white/5" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100")}
                                        title="Copy"
                                      >
                                        {copiedId === msg.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                                      </button>
                                      <button
                                        onClick={() => giveFeedback(msg.run_id!, 1)}
                                        className={clsx(
                                          "p-1.5 rounded-md transition-all",
                                          feedbackMap[msg.run_id!] === 1
                                            ? "text-emerald-400 bg-emerald-500/10"
                                            : isDark ? "text-gray-600 hover:text-gray-400 hover:bg-white/5" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                                        )}
                                      >
                                        <ThumbsUp size={13} />
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (correcting === msg.run_id) setCorrecting(null);
                                          else setCorrecting(msg.run_id!);
                                        }}
                                        className={clsx(
                                          "p-1.5 rounded-md transition-all",
                                          feedbackMap[msg.run_id!] === -1
                                            ? "text-red-400 bg-red-500/10"
                                            : isDark ? "text-gray-600 hover:text-gray-400 hover:bg-white/5" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                                        )}
                                      >
                                        <ThumbsDown size={13} />
                                      </button>

                                      {correcting === msg.run_id && (
                                        <div className="ml-2 flex items-center gap-2">
                                          <input
                                            className={clsx("rounded-lg px-3 py-1 text-xs w-60 focus:outline-none transition-colors border", isDark ? "bg-white/5 border-white/10 text-gray-300 focus:border-cyan-500/50" : "bg-gray-50 border-gray-200 text-gray-700 focus:border-amber-400")}
                                            placeholder="What should the response be?"
                                            value={correction}
                                            onChange={e => setCorrection(e.target.value)}
                                            onKeyDown={e => { if (e.key === "Enter") { giveFeedback(msg.run_id!, -1); } }}
                                          />
                                          <button
                                            onClick={() => giveFeedback(msg.run_id!, -1)}
                                            className="text-[11px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2.5 py-1 rounded-lg transition-colors"
                                          >
                                            Send
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <div ref={bottomRef} />
                    </div>
                  </div>

                  {/* ── File preview strip ────────────────────────────── */}
                  {attachedFiles.length > 0 && (
                    <div className={clsx("border-t px-4 pt-3 pb-1", isDark ? "border-white/[0.04]" : "border-gray-200")}>
                      <div className="max-w-3xl mx-auto flex gap-2 overflow-x-auto">
                        {attachedFiles.map((file, i) => (
                          <div key={i} className="relative flex-shrink-0 group">
                            {filePreviews[i] ? (
                              <img src={filePreviews[i]} alt={file.name} className={clsx("w-14 h-14 rounded-lg object-cover border", isDark ? "border-white/10" : "border-gray-200")} />
                            ) : (
                              <div className={clsx("w-14 h-14 rounded-lg flex flex-col items-center justify-center border", isDark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")}>
                                <FileText size={12} className={isDark ? "text-gray-600" : "text-gray-400"} />
                                <span className={clsx("text-[7px] mt-0.5 truncate max-w-[48px]", isDark ? "text-gray-700" : "text-gray-500")}>{file.name}</span>
                              </div>
                            )}
                            <button
                              onClick={() => removeFile(i)}
                              className={clsx("absolute -top-1.5 -right-1.5 w-4 h-4 hover:bg-red-600 border rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity", isDark ? "bg-gray-800 border-white/10" : "bg-gray-600 border-gray-400")}
                            >
                              <X size={8} className="text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Input area ────────────────────────────────────── */}
                  <div className="p-4 pb-5">
                    <div className="max-w-3xl mx-auto">
                      <div className={clsx("relative rounded-2xl transition-all shadow-lg border", isDark ? "bg-white/[0.04] border-white/[0.08] hover:border-white/[0.12] focus-within:border-cyan-500/30 focus-within:bg-white/[0.05] shadow-black/20" : "bg-white border-gray-200 hover:border-gray-300 focus-within:border-amber-400 shadow-gray-200/50")}>
                        {/* Textarea */}
                        <textarea
                          ref={textareaRef}
                          value={input}
                          onChange={e => setInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                          }}
                          placeholder={
                            routeMode === "auto" ? "What's brewing? Ask anything..." :
                            routeMode === "coder" ? "Describe what to code..." :
                            routeMode === "ocr" ? "Describe what to extract from the image..." :
                            "What's brewing? Ask anything..."
                          }
                          rows={1}
                          className={clsx("w-full bg-transparent px-4 pt-3.5 pb-12 text-[14px] focus:outline-none resize-none", isDark ? "text-gray-200 placeholder:text-gray-600" : "text-gray-800 placeholder:text-gray-400")}
                          style={{ maxHeight: "160px" }}
                        />

                        {/* Bottom toolbar inside input */}
                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {/* Mode selector */}
                            <div className="relative" ref={modeMenuRef}>
                              <button
                                onClick={() => setShowModeMenu(v => !v)}
                                className={clsx(
                                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all",
                                  isDark ? "hover:bg-white/[0.06]" : "hover:bg-gray-100",
                                  routeMode === "auto" ? "text-cyan-400" :
                                  routeMode === "coder" ? "text-emerald-400" :
                                  routeMode === "ocr" ? "text-amber-400" :
                                  "text-blue-400"
                                )}
                              >
                                {MODE_OPTIONS.find(m => m.value === routeMode)?.icon}
                                <span>{MODE_OPTIONS.find(m => m.value === routeMode)?.label}</span>
                                <ChevronDown size={10} className={clsx("transition-transform ml-0.5", showModeMenu && "rotate-180")} />
                              </button>

                              {showModeMenu && (
                                <div className={clsx("absolute bottom-full left-0 mb-2 w-52 rounded-xl shadow-2xl overflow-hidden z-50 border", isDark ? "bg-[#141420] border-white/[0.08]" : "bg-white border-gray-200")}>
                                  {MODE_OPTIONS.map(opt => (
                                    <button
                                      key={opt.value}
                                      onClick={() => { setRouteMode(opt.value); setShowModeMenu(false); }}
                                      className={clsx(
                                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all",
                                        routeMode === opt.value ? (isDark ? "bg-white/[0.06] text-white" : "bg-gray-50 text-gray-900") : (isDark ? "text-gray-400 hover:bg-white/[0.04] hover:text-white" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900")
                                      )}
                                    >
                                      <span className={opt.color}>{opt.icon}</span>
                                      <div className="flex-1">
                                        <div className="text-[13px] font-medium">{opt.label}</div>
                                        <div className="text-[10px] text-gray-600">{opt.desc}</div>
                                      </div>
                                      {routeMode === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* File attach */}
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              title="Attach image or PDF"
                              className={clsx(
                                "rounded-lg p-1.5 transition-all",
                                attachedFiles.length > 0
                                  ? "text-amber-400 bg-amber-500/10"
                                  : isDark ? "text-gray-600 hover:text-gray-400 hover:bg-white/[0.06]" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                              )}
                            >
                              <Paperclip size={15} />
                            </button>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*,.pdf,application/pdf"
                              multiple
                              className="hidden"
                              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
                            />
                          </div>

                          {/* Send button */}
                          <button
                            onClick={() => send()}
                            disabled={loading || !input.trim()}
                            className={clsx(
                              "rounded-lg p-2 transition-all",
                              input.trim() && !loading
                                ? isDark ? "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20" : "bg-gradient-to-r from-amber-700 to-amber-900 hover:from-amber-600 hover:to-amber-800 text-white shadow-lg shadow-amber-900/20"
                                : isDark ? "bg-white/[0.04] text-gray-700" : "bg-gray-100 text-gray-400"
                            )}
                          >
                            <Send size={15} />
                          </button>
                        </div>
                      </div>

                      <p className={clsx("text-center text-[10px] mt-2", isDark ? "text-gray-700" : "text-gray-400")}>
                        Brew AI can make mistakes. Consider checking important information.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ── Right settings panel ─────────────────────────────────── */}
            {activeSession && rightPanelOpen && (
              <div className={clsx("w-[240px] flex-shrink-0 border-l overflow-y-auto", isDark ? "border-white/[0.04] bg-[#0d0d14]" : "border-gray-200 bg-white")}>
                <div className="p-4">
                  {/* Session Settings Header */}
                  <div className="flex items-center justify-between mb-5">
                    <h3 className={clsx("text-[13px] font-semibold", isDark ? "text-white" : "text-gray-900")}>Session Info</h3>
                    <Settings size={13} className="text-gray-600" />
                  </div>

                  {/* Active Model */}
                  <div className="mb-5">
                    <p className={clsx("text-[10px] uppercase tracking-wider font-medium mb-2", isDark ? "text-gray-600" : "text-gray-400")}>Model</p>
                    <div className="space-y-1.5">
                      {MODE_OPTIONS.filter(m => m.value !== "auto").map(opt => {
                        const isActive = routeMode === opt.value || (routeMode === "auto" && lastRoute && (
                          (opt.value === "general" && lastRoute.name === "general") ||
                          (opt.value === "coder" && lastRoute.name === "coder") ||
                          (opt.value === "ocr" && (lastRoute.name === "ocr" || lastRoute.name === "ocr_then_general" || lastRoute.name === "ocr_then_coder"))
                        ));
                        return (
                          <div
                            key={opt.value}
                            className={clsx(
                              "flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-[12px]",
                              isActive
                                ? isDark ? "bg-white/[0.06] border-white/[0.10] text-white" : "bg-amber-50 border-amber-200 text-gray-900"
                                : isDark ? "border-transparent text-gray-600" : "border-transparent text-gray-400"
                            )}
                          >
                            <span className={opt.color}>{opt.icon}</span>
                            <span>{opt.label} v1</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Route Mode */}
                  <div className="mb-5">
                    <p className={clsx("text-[10px] uppercase tracking-wider font-medium mb-2", isDark ? "text-gray-600" : "text-gray-400")}>Routing</p>
                    <div className={clsx(
                      "px-3 py-2 rounded-lg text-[12px] font-medium border",
                      routeMode === "auto"
                        ? isDark ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/15" : "bg-amber-50 text-amber-700 border-amber-200"
                        : isDark ? "bg-white/[0.04] text-gray-400 border-white/[0.06]" : "bg-gray-50 text-gray-600 border-gray-200"
                    )}>
                      <div className="flex items-center gap-2">
                        {MODE_OPTIONS.find(m => m.value === routeMode)?.icon}
                        <span>{routeMode === "auto" ? "Smart Auto-Route" : MODE_OPTIONS.find(m => m.value === routeMode)?.label}</span>
                      </div>
                      {routeMode === "auto" && (
                        <p className={clsx("text-[10px] mt-1", isDark ? "text-cyan-400/50" : "text-amber-600/60")}>Best model picked per message</p>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="mb-5">
                    <p className={clsx("text-[10px] uppercase tracking-wider font-medium mb-2", isDark ? "text-gray-600" : "text-gray-400")}>Stats</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className={clsx("flex items-center gap-1.5", isDark ? "text-gray-500" : "text-gray-400")}><Hash size={11} /> Messages</span>
                        <span className={clsx("font-mono", isDark ? "text-gray-300" : "text-gray-700")}>{messages.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className={clsx("flex items-center gap-1.5", isDark ? "text-gray-500" : "text-gray-400")}><Zap size={11} /> Est. tokens</span>
                        <span className={clsx("font-mono", isDark ? "text-gray-300" : "text-gray-700")}>{tokenCount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className={clsx("flex items-center gap-1.5", isDark ? "text-gray-500" : "text-gray-400")}><MessageSquare size={11} /> Responses</span>
                        <span className={clsx("font-mono", isDark ? "text-gray-300" : "text-gray-700")}>{msgCount}</span>
                      </div>
                    </div>
                  </div>

                  {/* Token Usage Bar */}
                  <div className="mb-5">
                    <p className={clsx("text-[10px] uppercase tracking-wider font-medium mb-2", isDark ? "text-gray-600" : "text-gray-400")}>Context Usage</p>
                    <div className={clsx("w-full h-2 rounded-full overflow-hidden", isDark ? "bg-white/[0.04]" : "bg-gray-200")}>
                      <div
                        className={clsx("h-full rounded-full transition-all duration-500", isDark ? "bg-gradient-to-r from-cyan-500 to-blue-500" : "bg-gradient-to-r from-amber-500 to-amber-700")}
                        style={{ width: `${Math.min((tokenCount / 4096) * 100, 100)}%` }}
                      />
                    </div>
                    <p className={clsx("text-[10px] mt-1.5 font-mono", isDark ? "text-gray-600" : "text-gray-400")}>
                      {tokenCount.toLocaleString()} / 4,096 tokens
                    </p>
                  </div>

                  {/* Status */}
                  <div>
                    <p className={clsx("text-[10px] uppercase tracking-wider font-medium mb-2", isDark ? "text-gray-600" : "text-gray-400")}>Status</p>
                    <div className="flex items-center gap-2 text-[12px]">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className={isDark ? "text-emerald-400" : "text-emerald-600"}>GPU Online</span>
                    </div>
                    <p className={clsx("text-[10px] mt-1", isDark ? "text-gray-600" : "text-gray-400")}>Self-hosted · No external APIs</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
