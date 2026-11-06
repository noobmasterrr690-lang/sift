import React from "react";
import { motion } from "framer-motion";
import {
  FolderKanban,
  Trash2,
  Cpu,
  History,
  ShieldCheck,
  HardDrive,
  Sparkles,
  Layers,
} from "lucide-react";
import type { StorageImpactSummary, WorkspaceView } from "../types/sift";
import { formatBytes } from "../lib/format";

interface SidebarProps {
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  organizeCount: number;
  triageCount: number;
  historyCount: number;
  silentSweepEnabled: boolean;
  storageImpact: StorageImpactSummary;
}

const NAV_ITEMS: Array<{
  id: WorkspaceView;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "organize",
    label: "Organize",
    sublabel: "Dry-Run & Sort",
    icon: FolderKanban,
  },
  {
    id: "triage",
    label: "Smart Triage",
    sublabel: "Easy Delete Review",
    icon: Trash2,
  },
  {
    id: "automation",
    label: "Automation Rules",
    sublabel: "Silent Sweep Watcher",
    icon: Cpu,
  },
  {
    id: "history",
    label: "History & Undo",
    sublabel: "ACID SQLite Ledger",
    icon: History,
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  organizeCount,
  triageCount,
  historyCount,
  silentSweepEnabled,
  storageImpact,
}) => {
  const totalPool =
    storageImpact.reclaimableBytes + storageImpact.freedThisMonthBytes;
  const freedRatio =
    totalPool > 0
      ? Math.min(
          100,
          Math.round((storageImpact.freedThisMonthBytes / totalPool) * 100)
        )
      : 0;

  const getBadge = (id: WorkspaceView) => {
    if (id === "organize" && organizeCount > 0) {
      return (
        <span className="tabular-nums rounded-full bg-indigo-500/20 border border-indigo-400/30 px-2 py-0.5 text-[11px] font-semibold text-indigo-300">
          {organizeCount}
        </span>
      );
    }
    if (id === "triage" && triageCount > 0) {
      return (
        <span className="tabular-nums rounded-full bg-rose-500/20 border border-rose-400/30 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
          {triageCount}
        </span>
      );
    }
    if (id === "automation") {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
            silentSweepEnabled
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              : "bg-zinc-800 border-white/10 text-zinc-400"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              silentSweepEnabled ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
            }`}
          />
          {silentSweepEnabled ? "ON" : "OFF"}
        </span>
      );
    }
    if (id === "history" && historyCount > 0) {
      return (
        <span className="tabular-nums rounded-full bg-zinc-800/90 border border-white/10 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
          {historyCount}
        </span>
      );
    }
    return null;
  };

  return (
    <aside
      aria-label="Workspace views and storage telemetry"
      className="w-72 shrink-0 h-screen flex flex-col justify-between bg-zinc-950/90 backdrop-blur-2xl border-r border-white/10 select-none"
    >
      {/* Top Brand Header */}
      <div className="p-5 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-white/20">
              <Layers className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white">
                  Sift
                </span>
                <span className="rounded-md bg-white/[0.07] border border-white/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-zinc-300">
                  v2.0
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Native PC File Intelligence
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium border bg-emerald-500/10 border-emerald-500/30 text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Native PC Active
          </span>
        </div>

        {/* Navigation Links */}
        <nav aria-label="Workspace sections">
          <ul role="list" className="space-y-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelectView(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-colors duration-150 group cursor-pointer ${
                      isActive
                        ? "text-white"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active-pill"
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 32,
                        }}
                        className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/[0.10] to-white/[0.04] border border-white/15 shadow-sm"
                      />
                    )}
                    <div className="relative z-10 flex items-center gap-3 min-w-0">
                      <div
                        className={`p-1.5 rounded-lg border transition-colors ${
                          isActive
                            ? "bg-indigo-500/20 border-indigo-400/40 text-indigo-300"
                            : "bg-zinc-900/80 border-white/5 text-zinc-400 group-hover:text-zinc-300"
                        }`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-semibold leading-tight">
                          {item.label}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          {item.sublabel}
                        </div>
                      </div>
                    </div>
                    <div className="relative z-10 ml-2">{getBadge(item.id)}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Bottom Live Storage Impact Widget & Safeguard Status */}
      <div className="p-4 space-y-3 border-t border-white/10 bg-zinc-950/60">
        <div className="rounded-2xl bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-white/10 p-4 shadow-inner space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
              <HardDrive
                className="w-3.5 h-3.5 text-indigo-400"
                aria-hidden="true"
              />
              <span>Live PC Storage Impact</span>
            </div>
            <Sparkles
              className="w-3.5 h-3.5 text-amber-400"
              aria-hidden="true"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">
                Ready to Reclaim
              </div>
              <div className="mt-1 text-sm font-bold text-rose-300 tabular-nums font-mono">
                {formatBytes(storageImpact.reclaimableBytes)}
              </div>
              <div className="text-[10px] text-zinc-400 tabular-nums mt-0.5">
                {storageImpact.reclaimableFiles} flagged items
              </div>
            </div>

            <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">
                Freed This Month
              </div>
              <div className="mt-1 text-sm font-bold text-emerald-300 tabular-nums font-mono">
                {formatBytes(storageImpact.freedThisMonthBytes)}
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5">
                Via OS Recycle Bin
              </div>
            </div>
          </div>

          {/* Visual Storage Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-zinc-400 tabular-nums">
              <span>Monthly Cleanup Efficiency</span>
              <span className="font-mono text-zinc-300">{freedRatio}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden flex">
              <div
                style={{ width: `${freedRatio}%` }}
                className="bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
              />
              <div
                style={{ width: `${100 - freedRatio}%` }}
                className="bg-rose-500/40"
              />
            </div>
          </div>
        </div>

        {/* System Directory Safeguard Footer */}
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-[11px] text-emerald-300/90">
          <ShieldCheck
            className="w-4 h-4 shrink-0 text-emerald-400"
            aria-hidden="true"
          />
          <div className="leading-tight">
            <span className="font-semibold">System Guard Active:</span>{" "}
            <span className="text-zinc-400">
              System32, AppData, .git, node_modules locked
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
