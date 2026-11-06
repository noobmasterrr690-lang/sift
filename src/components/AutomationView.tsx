import React from "react";
import * as Switch from "@radix-ui/react-switch";
import { motion } from "framer-motion";
import {
  Cpu,
  Radio,
  Zap,
  ShieldCheck,
  Clock,
  Activity,
  FolderLock,
  Play,
} from "lucide-react";
import type { AutomationStatus } from "../types/sift";
import { formatRelativeDate } from "../lib/format";

interface AutomationViewProps {
  status: AutomationStatus;
  excludedSafeguards: string[];
  isSweeping: boolean;
  onUpdateConfig: (params: {
    silentSweepEnabled: boolean;
    heartbeatIntervalMinutes: number;
    fileDropTriggerEnabled: boolean;
    wcsThreshold: number;
    watchedFolders: string[];
  }) => void;
  onToggleRule: (ruleId: string, enabled: boolean) => void;
  onTriggerSweep: () => void;
}

const INTERVAL_OPTIONS = [5, 15, 30, 60];

export const AutomationView: React.FC<AutomationViewProps> = ({
  status,
  excludedSafeguards,
  isSweeping,
  onUpdateConfig,
  onToggleRule,
  onTriggerSweep,
}) => {
  const handleToggleAutoPilot = (checked: boolean) => {
    onUpdateConfig({
      silentSweepEnabled: checked,
      heartbeatIntervalMinutes: status.heartbeatIntervalMinutes,
      fileDropTriggerEnabled: status.fileDropTriggerEnabled,
      wcsThreshold: status.wcsThreshold,
      watchedFolders: status.watchedFolders,
    });
  };

  const handleIntervalChange = (minutes: number) => {
    onUpdateConfig({
      silentSweepEnabled: status.silentSweepEnabled,
      heartbeatIntervalMinutes: minutes,
      fileDropTriggerEnabled: status.fileDropTriggerEnabled,
      wcsThreshold: status.wcsThreshold,
      watchedFolders: status.watchedFolders,
    });
  };

  const handleToggleFileDrop = (checked: boolean) => {
    onUpdateConfig({
      silentSweepEnabled: status.silentSweepEnabled,
      heartbeatIntervalMinutes: status.heartbeatIntervalMinutes,
      fileDropTriggerEnabled: checked,
      wcsThreshold: status.wcsThreshold,
      watchedFolders: status.watchedFolders,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Hero Banner: Silent Sweep Auto-Pilot Mode */}
      <div className="rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 p-6 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-white">
                Silent Sweep Auto-Pilot
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
                  status.silentSweepEnabled
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                    : "bg-zinc-800 border-white/10 text-zinc-400"
                }`}
              >
                <Radio className="w-3 h-3" aria-hidden="true" />
                {status.silentSweepEnabled
                  ? "Watching Filesystem (notify)"
                  : "Manual Dry-Run Only"}
              </span>
            </div>
            <p className="text-xs text-zinc-400 max-w-2xl">
              Monitors target folders in the background via native OS{" "}
              <code className="text-zinc-300">notify</code> events and a
              scheduled heartbeat—automatically sorting safe file types while
              queueing high-WCS clutter for your next human review session.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onTriggerSweep}
              disabled={isSweeping}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/35 px-4 py-2.5 text-xs font-semibold text-indigo-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>
                {isSweeping ? "Running Sweep..." : "Run Heartbeat Sweep Now"}
              </span>
            </button>

            <div className="flex items-center gap-2.5 rounded-xl bg-zinc-950/80 border border-white/10 px-3.5 py-2">
              <label
                htmlFor="silent-sweep-switch"
                className="text-xs font-semibold text-zinc-200 cursor-pointer"
              >
                Auto-Pilot
              </label>
              <Switch.Root
                id="silent-sweep-switch"
                checked={status.silentSweepEnabled}
                onCheckedChange={handleToggleAutoPilot}
                className="w-10 h-5 rounded-full bg-zinc-700 data-[state=checked]:bg-emerald-500 relative transition-colors cursor-pointer"
              >
                <Switch.Thumb className="block w-4 h-4 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
              </Switch.Root>
            </div>
          </div>
        </div>

        {/* Heartbeat & File-Drop Trigger Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/10">
          <div className="rounded-xl bg-zinc-950/70 border border-white/10 p-3.5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Clock
                  className="w-3.5 h-3.5 text-indigo-400"
                  aria-hidden="true"
                />
                <span>Heartbeat Cadence</span>
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Last sweep:{" "}
                {status.lastHeartbeatAt
                  ? formatRelativeDate(status.lastHeartbeatAt)
                  : "Never"}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {INTERVAL_OPTIONS.map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => handleIntervalChange(min)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-mono tabular-nums cursor-pointer border ${
                    status.heartbeatIntervalMinutes === min
                      ? "bg-indigo-500/25 border-indigo-400/40 text-indigo-200 font-semibold"
                      : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {min}m
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-zinc-950/70 border border-white/10 p-3.5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Zap
                  className="w-3.5 h-3.5 text-amber-400"
                  aria-hidden="true"
                />
                <span>Instant File-Drop Trigger</span>
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Native <code className="text-zinc-300">notify</code> kernel
                event listener
              </div>
            </div>
            <Switch.Root
              aria-label="Enable instant file-drop trigger"
              checked={status.fileDropTriggerEnabled}
              onCheckedChange={handleToggleFileDrop}
              className="w-9 h-5 rounded-full bg-zinc-700 data-[state=checked]:bg-indigo-500 relative transition-colors cursor-pointer"
            >
              <Switch.Thumb className="block w-3.5 h-3.5 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-4" />
            </Switch.Root>
          </div>

          <div className="rounded-xl bg-zinc-950/70 border border-white/10 p-3.5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Cpu
                  className="w-3.5 h-3.5 text-rose-400"
                  aria-hidden="true"
                />
                <span>Clutter Queue Threshold</span>
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Never auto-trashes; stages for human review
              </div>
            </div>
            <span className="rounded-lg bg-rose-500/15 border border-rose-500/30 px-2.5 py-1 text-xs font-mono font-bold text-rose-300 tabular-nums">
              WCS ≥ {status.wcsThreshold}
            </span>
          </div>
        </div>
      </div>

      {/* Two-Column Layout: Active Automation Rules + Safeguards & Event Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Automation Rules */}
        <div className="lg:col-span-2 space-y-3.5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 px-1">
            Taxonomy & Triage Automation Pipelines
          </h2>

          {status.rules.map((rule) => (
            <motion.div
              key={rule.id}
              layout
              className="rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 p-4 flex items-start justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-white">{rule.name}</h3>
                  <span className="rounded-md bg-indigo-500/15 border border-indigo-400/30 px-2 py-0.5 text-[10px] font-mono text-indigo-300">
                    {rule.trigger}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {rule.description}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {rule.categoryScope.map((scope) => (
                    <span
                      key={scope}
                      className="rounded bg-white/[0.06] border border-white/10 px-2 py-0.5 text-[10px] font-mono text-zinc-300"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>

              <Switch.Root
                aria-label={`Toggle ${rule.name}`}
                checked={rule.enabled}
                onCheckedChange={(checked) => onToggleRule(rule.id, checked)}
                className="w-10 h-5 shrink-0 rounded-full bg-zinc-700 data-[state=checked]:bg-indigo-500 relative transition-colors cursor-pointer mt-1"
              >
                <Switch.Thumb className="block w-4 h-4 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
              </Switch.Root>
            </motion.div>
          ))}
        </div>

        {/* Right Column: Hard-Coded Safeguards & Recent Event Log */}
        <div className="space-y-5">
          {/* Hard-coded Exclusion Safeguard List */}
          <div className="rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-emerald-500/25 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              <span>Hard-Coded System Directory Safeguards</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Enforced at the Rust traversal kernel (
              <code className="text-zinc-300">scanner.rs</code>). Sift can never
              scan, move, or stage files inside these protected paths:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {excludedSafeguards.map((dir) => (
                <span
                  key={dir}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-mono text-emerald-200"
                >
                  <FolderLock className="w-3 h-3" aria-hidden="true" />
                  {dir}
                </span>
              ))}
            </div>
          </div>

          {/* Live Watcher Event Telemetry */}
          <div className="rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                <Activity
                  className="w-4 h-4 text-indigo-400"
                  aria-hidden="true"
                />
                <span>Background Watcher Ledger</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
                {status.recentEvents.length} events
              </span>
            </div>

            <ul role="list" className="space-y-2.5">
              {status.recentEvents.map((evt) => (
                <li
                  key={evt.id}
                  className="rounded-xl bg-zinc-950/80 border border-white/[0.07] p-3 space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-indigo-300 font-semibold">
                      {evt.eventType}
                    </span>
                    <span className="text-zinc-500 tabular-nums">
                      {formatRelativeDate(evt.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-snug">
                    {evt.summary}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
