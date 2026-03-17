"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { useTheme } from "@/components/shared/ThemeProvider";
import Image from "next/image";
import { Sun, Moon } from "lucide-react";
import clsx from "clsx";

export default function LoginPage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (mode === "register") await api.register(email, password);
      const { access_token, refresh_token } = await api.login(email, password);
      setTokens(access_token, refresh_token);
      router.push("/chat");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className={clsx("min-h-screen flex items-center justify-center transition-colors", isDark ? "bg-[#0a0a0f]" : "bg-[#faf9f7]")}>
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className={clsx("absolute top-5 right-5 p-2 rounded-lg transition-colors", isDark ? "text-gray-500 hover:text-gray-300 hover:bg-white/5" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100")}
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="DataCaffe" width={72} height={72} className="mx-auto mb-4 drop-shadow-xl" />
          <div className={clsx("text-3xl font-bold mb-1", isDark ? "text-white" : "text-gray-900")}>BrewAI</div>
          <p className={clsx("text-sm", isDark ? "text-gray-400" : "text-gray-500")}>DataCaffe's AI Gateway</p>
        </div>

        <div className={clsx("rounded-2xl border p-8 transition-colors", isDark ? "bg-[#111118] border-white/[0.06]" : "bg-white border-gray-200 shadow-lg")}>
          <h2 className={clsx("text-xl font-semibold mb-6", isDark ? "text-white" : "text-gray-900")}>{mode === "login" ? "Sign in" : "Create account"}</h2>

          <form onSubmit={handle} className="space-y-4">
            <div>
              <label className={clsx("block text-sm mb-1", isDark ? "text-gray-400" : "text-gray-500")}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className={clsx("w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none transition-colors border", isDark ? "bg-gray-800/50 border-white/[0.08] text-white focus:border-cyan-500/50" : "bg-gray-50 border-gray-200 text-gray-900 focus:border-amber-600/50")}
                placeholder="you@company.com" required
              />
            </div>
            <div>
              <label className={clsx("block text-sm mb-1", isDark ? "text-gray-400" : "text-gray-500")}>Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className={clsx("w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none transition-colors border", isDark ? "bg-gray-800/50 border-white/[0.08] text-white focus:border-cyan-500/50" : "bg-gray-50 border-gray-200 text-gray-900 focus:border-amber-600/50")}
                placeholder="••••••••" required
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit" disabled={loading}
              className={clsx(
                "w-full rounded-xl py-2.5 text-sm font-medium transition-all disabled:opacity-50",
                isDark ? "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20" : "bg-gradient-to-r from-amber-700 to-amber-900 hover:from-amber-600 hover:to-amber-800 text-white shadow-lg shadow-amber-900/20"
              )}
            >
              {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className={clsx("text-center text-sm mt-4", isDark ? "text-gray-500" : "text-gray-400")}>
            {mode === "login" ? "No account yet?" : "Already have an account?"}{" "}
            <button
              className={clsx("hover:underline font-medium", isDark ? "text-cyan-400" : "text-amber-700")}
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            >
              {mode === "login" ? "Register" : "Sign in"}
            </button>
          </p>
        </div>

        <p className={clsx("text-center text-xs mt-4", isDark ? "text-gray-600" : "text-gray-400")}>Self-hosted · No external APIs · Your data stays here</p>
      </div>
    </div>
  );
}
