"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare, Database, Cpu, Key, LogOut,
  PanelLeftClose, PanelLeft, Sun, Moon,
} from "lucide-react";
import { clearTokens } from "@/lib/auth";
import { useTheme } from "@/components/shared/ThemeProvider";
import clsx from "clsx";

const NAV = [
  { href: "/chat", icon: MessageSquare, label: "Chat" },
  { href: "/dataset", icon: Database, label: "Dataset" },
  { href: "/finetune", icon: Cpu, label: "Fine-tune" },
  { href: "/api-keys", icon: Key, label: "API Keys" },
];

interface NavbarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export default function Navbar({ collapsed = false, onToggle }: NavbarProps) {
  const path = usePathname();
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();

  const logout = () => {
    clearTokens();
    router.push("/login");
  };

  return (
    <aside
      className={clsx(
        "flex-shrink-0 border-r flex flex-col py-3 transition-all duration-300 ease-in-out",
        isDark ? "bg-gray-950 border-white/[0.06]" : "bg-white border-gray-200",
        collapsed ? "w-[60px] px-1.5" : "w-[220px] px-2.5"
      )}
    >
      <div className={clsx("flex items-center mb-6", collapsed ? "justify-center px-0" : "justify-between px-2")}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="DataCaffe" width={28} height={28} className="rounded-md" />
            <span className={clsx("font-semibold text-sm tracking-tight", isDark ? "text-white" : "text-gray-900")}>BrewAI</span>
          </div>
        )}
        {collapsed && (
          <Image src="/logo.png" alt="DataCaffe" width={32} height={32} className="rounded-md" />
        )}
        {onToggle && !collapsed && (
          <button
            onClick={onToggle}
            className={clsx(
              "transition-colors p-1 rounded-md",
              isDark ? "text-gray-500 hover:text-gray-300 hover:bg-white/5" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            )}
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {collapsed && onToggle && (
        <button
          onClick={onToggle}
          className={clsx(
            "mx-auto mb-4 transition-colors p-1.5 rounded-md",
            isDark ? "text-gray-500 hover:text-gray-300 hover:bg-white/5" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          )}
        >
          <PanelLeft size={16} />
        </button>
      )}

      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                collapsed ? "justify-center px-0 py-2.5 mx-1" : "px-3 py-2",
                active
                  ? isDark ? "bg-white/10 text-white" : "bg-amber-800/10 text-amber-900 font-semibold"
                  : isDark ? "text-gray-500 hover:bg-white/[0.04] hover:text-gray-300" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              )}
              title={collapsed ? label : undefined}
            >
              <Icon size={17} strokeWidth={active ? 2 : 1.5} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={clsx(
            "flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 w-full",
            collapsed ? "justify-center px-0 py-2.5 mx-1" : "px-3 py-2",
            isDark ? "text-gray-500 hover:bg-white/[0.04] hover:text-gray-300" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          )}
          title={collapsed ? (isDark ? "Light mode" : "Dark mode") : undefined}
        >
          {isDark ? <Sun size={17} strokeWidth={1.5} /> : <Moon size={17} strokeWidth={1.5} />}
          {!collapsed && <span>{isDark ? "Light mode" : "Dark mode"}</span>}
        </button>

        {!collapsed && (
          <div className={clsx("px-3 py-1.5 text-[10px] font-mono", isDark ? "text-gray-700" : "text-gray-400")}>
            BrewAI Gateway v1.0.0
          </div>
        )}
        <button
          onClick={logout}
          className={clsx(
            "flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 w-full",
            collapsed ? "justify-center px-0 py-2.5 mx-1" : "px-3 py-2",
            isDark ? "text-gray-500 hover:bg-white/[0.04] hover:text-gray-300" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          )}
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut size={17} strokeWidth={1.5} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
