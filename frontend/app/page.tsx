"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { useTheme } from "@/components/shared/ThemeProvider";
import {
  Bot, MessageSquare, Code2, Camera, ArrowRight,
  Zap, Shield, Cpu, Sparkles, Globe, Sun, Moon,
} from "lucide-react";
import clsx from "clsx";

export default function LandingPage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isLoggedIn()) router.replace("/chat");
  }, [router]);

  if (!mounted) return null;
  if (isLoggedIn()) return null;

  const gradientLogo = isDark ? "from-cyan-500 to-blue-600" : "from-amber-700 to-amber-900";
  const gradientBtn = isDark
    ? "from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-cyan-500/20 hover:shadow-cyan-500/30"
    : "from-amber-700 to-amber-900 hover:from-amber-600 hover:to-amber-800 shadow-amber-900/20 hover:shadow-amber-900/30";
  const accentText = isDark ? "from-cyan-400 to-blue-400" : "from-amber-600 to-amber-800";

  return (
    <div className={clsx("min-h-screen overflow-hidden transition-colors", isDark ? "bg-[#0a0a0f]" : "bg-[#faf9f7]")}>
      {/* ── Ambient background ─────────────────────────────────────────── */}
      {isDark && (
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-cyan-500/[0.03] blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/[0.04] blur-[120px]" />
          <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-purple-500/[0.02] blur-[100px]" />
        </div>
      )}

      {/* ── Nav ────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="DataCaffe" className="w-8 h-8 rounded-md" />
          <span className={clsx("font-semibold text-lg tracking-tight", isDark ? "text-white" : "text-gray-900")}>BrewAI</span>
          <span className={clsx("text-[10px] font-mono ml-1 mt-1", isDark ? "text-gray-600" : "text-gray-400")}>v1.0.0</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className={clsx("p-2 rounded-lg transition-colors", isDark ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100")}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={() => router.push("/login")}
            className={clsx("text-sm transition-colors px-4 py-2 rounded-lg", isDark ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100")}
          >
            Sign in
          </button>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pt-20 pb-24 text-center">
        <div className={clsx("inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-8", isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-gray-200 bg-white")}>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className={clsx("text-xs", isDark ? "text-gray-400" : "text-gray-500")}>Self-hosted AI Gateway · No external APIs</span>
        </div>

        <div className="relative w-28 h-28 mx-auto mb-10">
          <div className={clsx("absolute inset-0 rounded-full opacity-20 blur-2xl animate-pulse", isDark ? "bg-cyan-500" : "bg-amber-500")} />
          <img src="/logo.png" alt="DataCaffe" className="relative w-28 h-28 drop-shadow-2xl" />
        </div>

        <h1 className={clsx("text-5xl md:text-6xl font-bold mb-4 tracking-tight leading-tight", isDark ? "text-white" : "text-gray-900")}>
          BrewAI
          <span className={clsx("bg-gradient-to-r bg-clip-text text-transparent", accentText)}> Gateway</span>
        </h1>

        <p className={clsx("text-lg max-w-xl mx-auto mb-12 leading-relaxed", isDark ? "text-gray-500" : "text-gray-500")}>
          One endpoint, three models. Your queries are automatically routed to the right AI — chat, code, or OCR. Powered by your own GPU.
        </p>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => router.push("/login")}
            className={clsx("bg-gradient-to-r text-white rounded-xl px-8 py-3.5 text-sm font-medium transition-all inline-flex items-center gap-2 shadow-xl hover:scale-[1.02]", gradientBtn)}
          >
            Get Started <ArrowRight size={16} />
          </button>
          <button
            onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
            className={clsx("rounded-xl px-8 py-3.5 text-sm font-medium transition-all border", isDark ? "text-gray-400 hover:text-white border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.03]" : "text-gray-500 hover:text-gray-900 border-gray-200 hover:border-gray-300 hover:bg-gray-50")}
          >
            Learn more
          </button>
        </div>
      </section>

      {/* ── Models ─────────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-4xl mx-auto px-8 pb-24">
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: <MessageSquare size={24} />, label: "Brew Chat v1", desc: "General conversations, Q&A, summaries, and business analysis", color: "cyan", colorL: "text-blue-600", gradient: isDark ? "from-cyan-500/10 to-cyan-500/5" : "from-blue-50 to-blue-50/50", border: isDark ? "border-cyan-500/10 hover:border-cyan-500/25" : "border-blue-200 hover:border-blue-300" },
            { icon: <Code2 size={24} />, label: "Brew Code v1", desc: "Write, debug, and review code across any language or framework", color: "emerald", colorL: "text-emerald-600", gradient: isDark ? "from-emerald-500/10 to-emerald-500/5" : "from-emerald-50 to-emerald-50/50", border: isDark ? "border-emerald-500/10 hover:border-emerald-500/25" : "border-emerald-200 hover:border-emerald-300" },
            { icon: <Camera size={24} />, label: "Brew OCR v1", desc: "Extract text from images, PDFs, and scanned documents instantly", color: "amber", colorL: "text-amber-700", gradient: isDark ? "from-amber-500/10 to-amber-500/5" : "from-amber-50 to-amber-50/50", border: isDark ? "border-amber-500/10 hover:border-amber-500/25" : "border-amber-200 hover:border-amber-300" },
          ].map(item => (
            <div key={item.label} className={clsx("group rounded-2xl p-6 border bg-gradient-to-b transition-all duration-300 hover:scale-[1.02]", item.gradient, item.border)}>
              <div className={clsx("mb-4", isDark ? `text-${item.color}-400` : item.colorL)}>{item.icon}</div>
              <div className={clsx("text-[15px] font-semibold mb-1.5", isDark ? "text-white" : "text-gray-900")}>{item.label}</div>
              <div className={clsx("text-[13px] leading-relaxed", isDark ? "text-gray-500" : "text-gray-500")}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="features" className="relative z-10 max-w-4xl mx-auto px-8 pb-24">
        <div className="text-center mb-14">
          <h2 className={clsx("text-2xl font-bold mb-3", isDark ? "text-white" : "text-gray-900")}>Built different</h2>
          <p className={clsx("text-[15px]", isDark ? "text-gray-500" : "text-gray-500")}>Everything runs on your infrastructure. No data leaves your network.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: <Sparkles size={18} />, title: "Smart Routing", desc: "Messages auto-route to the best model based on content — code keywords trigger the coder, images trigger OCR." },
            { icon: <Zap size={18} />, title: "GPU Accelerated", desc: "All models run on your GPU with 140+ tokens/sec. Models stay in VRAM — zero cold starts after warm-up." },
            { icon: <Shield size={18} />, title: "API Key Auth", desc: "Generate scoped API keys for teammates. Rate limiting, usage tracking, and expiry built in." },
            { icon: <Globe size={18} />, title: "REST API", desc: "5 endpoints — /v1/chat, /v1/code, /v1/ocr, /v1/auto, and /v1/ocr-and-ask. Use from any language." },
            { icon: <Cpu size={18} />, title: "Self-Hosted", desc: "No OpenAI, no Anthropic, no external APIs. Your data stays on your server. Full control." },
            { icon: <Bot size={18} />, title: "Fine-tune Ready", desc: "Collect feedback, approve training data, export JSONL, and trigger fine-tune jobs from the UI." },
          ].map(item => (
            <div key={item.title} className={clsx("rounded-xl p-5 border transition-all group", isDark ? "border-white/[0.05] bg-white/[0.015] hover:bg-white/[0.03] hover:border-white/[0.10]" : "border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 shadow-sm")}>
              <div className="flex items-start gap-3">
                <div className={clsx("p-2 rounded-lg transition-colors flex-shrink-0", isDark ? "bg-white/[0.05] text-cyan-400 group-hover:bg-cyan-500/10" : "bg-amber-50 text-amber-700 group-hover:bg-amber-100")}>
                  {item.icon}
                </div>
                <div>
                  <div className={clsx("text-[14px] font-semibold mb-1", isDark ? "text-white" : "text-gray-900")}>{item.title}</div>
                  <div className={clsx("text-[13px] leading-relaxed", isDark ? "text-gray-500" : "text-gray-500")}>{item.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── API Preview ────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-4xl mx-auto px-8 pb-24">
        <div className={clsx("rounded-2xl border overflow-hidden", isDark ? "border-white/[0.06] bg-[#0d1117]" : "border-gray-200 bg-gray-900")}>
          <div className={clsx("flex items-center gap-2 px-4 py-3 border-b", isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-700 bg-gray-800")}>
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
            <span className="text-[11px] text-gray-500 ml-2 font-mono">curl — BrewAI Gateway API</span>
          </div>
          <pre className="p-6 text-[13px] font-mono leading-relaxed overflow-x-auto">
            <span className="text-gray-500"># Auto-route — let BrewAI pick the model</span>{"\n"}
            <span className="text-cyan-400">curl</span> <span className="text-gray-300">-X POST</span> <span className="text-emerald-400">https://your-server:8000/v1/auto</span> <span className="text-gray-400">\</span>{"\n"}
            {"  "}<span className="text-gray-300">-H</span> <span className="text-amber-300">{'"Authorization: Bearer bai_xxx..."'}</span> <span className="text-gray-400">\</span>{"\n"}
            {"  "}<span className="text-gray-300">-H</span> <span className="text-amber-300">{'"Content-Type: application/json"'}</span> <span className="text-gray-400">\</span>{"\n"}
            {"  "}<span className="text-gray-300">-d</span> <span className="text-amber-300">{"'{\"message\": \"Write a quicksort in Python\"}')"}</span>{"\n\n"}
            <span className="text-gray-500"># Response</span>{"\n"}
            <span className="text-gray-400">{"{"}</span>{"\n"}
            {"  "}<span className="text-blue-400">{'"route"'}</span><span className="text-gray-400">:</span> <span className="text-emerald-400">{'"coder"'}</span><span className="text-gray-400">,</span>{"\n"}
            {"  "}<span className="text-blue-400">{'"model"'}</span><span className="text-gray-400">:</span> <span className="text-emerald-400">{'"Brew Code v1"'}</span><span className="text-gray-400">,</span>{"\n"}
            {"  "}<span className="text-blue-400">{'"response"'}</span><span className="text-gray-400">:</span> <span className="text-emerald-400">{'"def quicksort(arr): ..."'}</span>{"\n"}
            <span className="text-gray-400">{"}"}</span>
          </pre>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-4xl mx-auto px-8 pb-24 text-center">
        <h2 className={clsx("text-2xl font-bold mb-3", isDark ? "text-white" : "text-gray-900")}>Ready to brew?</h2>
        <p className={clsx("text-[15px] mb-8", isDark ? "text-gray-500" : "text-gray-500")}>Start using your private AI gateway in under a minute.</p>
        <button
          onClick={() => router.push("/login")}
          className={clsx("bg-gradient-to-r text-white rounded-xl px-10 py-4 text-sm font-medium transition-all inline-flex items-center gap-2 shadow-xl hover:scale-[1.02]", gradientBtn)}
        >
          Launch BrewAI <ArrowRight size={16} />
        </button>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className={clsx("relative z-10 border-t py-8 text-center", isDark ? "border-white/[0.04]" : "border-gray-200")}>
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className={clsx("w-5 h-5 rounded-md bg-gradient-to-br flex items-center justify-center", gradientLogo)}>
            <span className="text-white font-bold text-[8px]">B</span>
          </div>
          <span className={clsx("text-sm", isDark ? "text-gray-600" : "text-gray-400")}>BrewAI Gateway v1.0.0</span>
        </div>
        <p className={clsx("text-[11px]", isDark ? "text-gray-700" : "text-gray-400")}>Built by DataCaffe · Self-hosted · No external APIs</p>
      </footer>
    </div>
  );
}
