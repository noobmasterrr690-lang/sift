import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  Package,
  Copy,
  Camera,
  FileWarning,
  Film,
  Check,
  ShieldAlert,
  Keyboard,
  Fingerprint,
  Clock,
  CheckSquare,
  Square,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import type { TriageCategoryName, TriageItem } from "../types/sift";
import {
  formatBytes,
  formatRelativeDate,
  getWcsBadgeStyle,
} from "../lib/format";

interface TriageViewProps {
  items: TriageItem[];
  isDispatching: boolean;
  onTrashSelected: (selected: TriageItem[]) => void;
  onRevealInExplorer: (path: string) => void;
  onAnnounce: (message: string) => void;
}

const FILTER_TABS: Array<{
  id: TriageCategoryName;
  shortLabel: string;
}> = [
  { id: "All Clutter", shortLabel: "All Clutter" },
  { id: "Old Installers", shortLabel: "Installers" },
  { id: "Exact Duplicates", shortLabel: "Duplicates" },
  { id: "Untouched Screenshots", shortLabel: "Stale Screenshots" },
  { id: "Temp & Incomplete", shortLabel: "Temp & Incomplete" },
  { id: "Large Stale Files", shortLabel: "Large Files" },
];

export const TriageView: React.FC<TriageViewProps> = ({
  items,
  isDispatching,
  onTrashSelected,
  onRevealInExplorer,
  onAnnounce,
}) => {
  const [activeTab, setActiveTab] = useState<TriageCategoryName>("All Clutter");
  const [stagedIds, setStagedIds] = useState<Set<string>>(() => {
    return new Set(items.filter((i) => i.wcsScore >= 90).map((i) => i.id));
  });
  const [keptIds, setKeptIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [keyboardModeActive, setKeyboardModeActive] = useState<boolean>(true);

  const visibleItems = useMemo(() => {
    return items.filter(
      (item) =>
        !keptIds.has(item.id) &&
        (activeTab === "All Clutter" || item.category === activeTab)
    );
  }, [items, keptIds, activeTab]);

  useEffect(() => {
    if (focusedIndex >= visibleItems.length) {
      setFocusedIndex(Math.max(0, visibleItems.length - 1));
    }
  }, [visibleItems.length, focusedIndex]);

  useEffect(() => {
    if (!keyboardModeActive || visibleItems.length === 0) return;

    const isInputFocused = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        el.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused(e.target)) return;

      if (e.key === " ") {
        e.preventDefault();
        return;
      }

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(visibleItems.length - 1, prev + 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        const target = visibleItems[focusedIndex];
        if (!target) return;
        setStagedIds((prev) => {
          const next = new Set(prev);
          next.add(target.id);
          return next;
        });
        onAnnounce(`Staged ${target.fileName} for OS Recycle Bin.`);
        setFocusedIndex((prev) => Math.min(visibleItems.length - 1, prev + 1));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isInputFocused(e.target)) return;
      if (e.key === " ") {
        e.preventDefault();
        const target = visibleItems[focusedIndex];
        if (!target) return;
        setStagedIds((prev) => {
          const next = new Set(prev);
          next.delete(target.id);
          return next;
        });
        setKeptIds((prev) => {
          const next = new Set(prev);
          next.add(target.id);
          return next;
        });
        onAnnounce(`Kept and ignored ${target.fileName}.`);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [keyboardModeActive, visibleItems, focusedIndex, onAnnounce]);

  const toggleStageItem = (id: string) => {
    setStagedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const keepSingleItem = (item: TriageItem) => {
    setStagedIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    setKeptIds((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
    onAnnounce(`Marked ${item.fileName} as Kept.`);
  };

  const selectAllVisible = () => {
    setStagedIds((prev) => {
      const next = new Set(prev);
      for (const item of visibleItems) {
        next.add(item.id);
      }
      return next;
    });
  };

  const selectCriticalOnly = () => {
    setStagedIds(
      new Set(
        visibleItems.filter((i) => i.wcsScore >= 90).map((i) => i.id)
      )
    );
  };

  const clearSelection = () => {
    setStagedIds(new Set());
  };

  const stagedItems = useMemo(
    () => items.filter((i) => stagedIds.has(i.id) && !keptIds.has(i.id)),
    [items, stagedIds, keptIds]
  );

  const stagedBytes = useMemo(
    () => stagedItems.reduce((sum, i) => sum + i.sizeBytes, 0),
    [stagedItems]
  );

  const getCategoryIcon = (category: TriageItem["category"]) => {
    switch (category) {
      case "Old Installers":
        return Package;
      case "Exact Duplicates":
        return Copy;
      case "Untouched Screenshots":
        return Camera;
      case "Temp & Incomplete":
        return FileWarning;
      case "Large Stale Files":
        return Film;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Prominent Recycle Bin Action */}
      <div className="rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-white">
                Smart Triage & Redundancy Scanner
              </h1>
              <span className="rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-[11px] font-medium text-rose-300 tabular-nums">
                WCS ≥ 70 Flagged
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Every flagged file on your PC is scored by Waste Confidence Score
              (0–100) and dispatched strictly to the Windows Recycle Bin (never
              permanent delete).
            </p>
          </div>

          <button
            type="button"
            onClick={() => onTrashSelected(stagedItems)}
            disabled={isDispatching || stagedItems.length === 0}
            className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-rose-500 via-red-500 to-orange-500 hover:from-rose-400 hover:to-orange-400 text-white font-semibold px-5 py-2.5 text-xs shadow-lg shadow-rose-500/25 border border-rose-300/30 transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none tabular-nums"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>
              {isDispatching
                ? "Moving to Windows Recycle Bin..."
                : `Move Selected to Recycle Bin (${formatBytes(stagedBytes)})`}
            </span>
          </button>
        </div>

        {/* Category Filter Tabs + Keyboard Triage Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
          <div
            role="tablist"
            aria-label="Clutter categories"
            className="flex flex-wrap items-center gap-1.5"
          >
            {FILTER_TABS.map((tab) => {
              const count =
                tab.id === "All Clutter"
                  ? items.filter((i) => !keptIds.has(i.id)).length
                  : items.filter(
                      (i) => !keptIds.has(i.id) && i.category === tab.id
                    ).length;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={isSelected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-all cursor-pointer border ${
                    isSelected
                      ? "bg-white/[0.10] border-white/20 text-white shadow-sm"
                      : "bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                  }`}
                >
                  <span>{tab.shortLabel}</span>
                  <span
                    className={`tabular-nums rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                      isSelected
                        ? "bg-indigo-500/30 text-indigo-200"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Selection Controls */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={selectAllVisible}
              className="rounded-lg bg-zinc-800/80 hover:bg-zinc-800 border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 cursor-pointer"
            >
              Select All ({visibleItems.length})
            </button>
            <button
              type="button"
              onClick={selectCriticalOnly}
              className="rounded-lg bg-zinc-800/80 hover:bg-zinc-800 border border-white/10 px-2.5 py-1 text-[11px] text-rose-300 cursor-pointer"
            >
              Select WCS ≥ 90
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-lg bg-zinc-800/80 hover:bg-zinc-800 border border-white/10 px-2.5 py-1 text-[11px] text-zinc-400 cursor-pointer"
            >
              Clear
            </button>
            {keptIds.size > 0 && (
              <button
                type="button"
                onClick={() => setKeptIds(new Set())}
                className="rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/30 px-2.5 py-1 text-[11px] text-indigo-300 cursor-pointer tabular-nums"
              >
                Restore {keptIds.size} Kept
              </button>
            )}
          </div>
        </div>

        {/* Keyboard Triage HUD Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-950/80 border border-white/10 px-3.5 py-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-3 text-zinc-300">
            <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-300">
              <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
              Keyboard Triage HUD:
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded bg-zinc-800 border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200">
                ↑/↓
              </kbd>
              <span className="text-zinc-400">Navigate Card</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded bg-zinc-800 border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                Space
              </kbd>
              <span className="text-zinc-400">Keep / Ignore File</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded bg-zinc-800 border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-rose-300">
                Backspace
              </kbd>
              <span className="text-zinc-400">Stage for Recycle Bin</span>
            </span>
          </div>

          <button
            type="button"
            aria-pressed={keyboardModeActive}
            onClick={() => setKeyboardModeActive((v) => !v)}
            className={`rounded-lg px-2.5 py-0.5 font-mono text-[10px] border cursor-pointer ${
              keyboardModeActive
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                : "bg-zinc-900 border-white/10 text-zinc-500"
            }`}
          >
            {keyboardModeActive ? "Hotkeys Active" : "Hotkeys Paused"}
          </button>
        </div>
      </div>

      {/* File Review Cards Grid */}
      {visibleItems.length === 0 ? (
        <div className="rounded-2xl bg-zinc-900/40 border border-white/10 p-12 text-center space-y-3">
          <Sparkles
            className="w-10 h-10 text-emerald-400 mx-auto"
            aria-hidden="true"
          />
          <h2 className="text-base font-semibold text-white">
            Zero Flagged Clutter in {activeTab}
          </h2>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            No files in your monitored PC folders met the WCS ≥ 70 clutter
            criteria for this category.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          <AnimatePresence initial={false}>
            {visibleItems.map((item, idx) => {
              const Icon = getCategoryIcon(item.category);
              const isStaged = stagedIds.has(item.id);
              const isFocused = keyboardModeActive && focusedIndex === idx;
              const wcsStyle = getWcsBadgeStyle(item.wcsScore);

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  onClick={() => setFocusedIndex(idx)}
                  className={`group rounded-2xl backdrop-blur-xl border p-4 transition-all ${
                    isStaged
                      ? "bg-rose-950/20 border-rose-500/35 shadow-lg shadow-rose-950/20"
                      : "bg-zinc-900/60 border-white/10 hover:border-white/20"
                  } ${
                    isFocused
                      ? "ring-2 ring-indigo-400/70 ring-offset-2 ring-offset-zinc-950"
                      : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    {/* Left: Checkbox + File Icon + Name + Reason */}
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStageItem(item.id);
                        }}
                        aria-pressed={isStaged}
                        aria-label={`Stage ${item.fileName} for Recycle Bin`}
                        className="mt-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {isStaged ? (
                          <CheckSquare
                            className="w-5 h-5 text-rose-400"
                            aria-hidden="true"
                          />
                        ) : (
                          <Square
                            className="w-5 h-5 text-zinc-500"
                            aria-hidden="true"
                          />
                        )}
                      </button>

                      <div
                        className={`h-11 w-11 shrink-0 rounded-xl border flex items-center justify-center ${
                          isStaged
                            ? "bg-rose-500/20 border-rose-400/30 text-rose-300"
                            : "bg-zinc-800/80 border-white/10 text-zinc-300"
                        }`}
                      >
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-sm font-bold text-white truncate">
                            {item.fileName}
                          </h2>
                          <span className="rounded-md bg-white/[0.06] border border-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                            {item.category}
                          </span>
                          {isFocused && (
                            <span className="rounded bg-indigo-500/20 border border-indigo-400/40 px-1.5 py-0.5 text-[10px] font-mono text-indigo-300">
                              Active Cursor
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-amber-200/90 flex items-center gap-1.5">
                          <ShieldAlert
                            className="w-3.5 h-3.5 text-amber-400 shrink-0"
                            aria-hidden="true"
                          />
                          <span>{item.reason}</span>
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-zinc-400 pt-0.5">
                          <span className="truncate max-w-md">{item.path}</span>
                          {item.blake3Hash && (
                            <span className="inline-flex items-center gap-1 text-zinc-500">
                              <Fingerprint
                                className="w-3 h-3"
                                aria-hidden="true"
                              />
                              hash:{item.blake3Hash.slice(0, 10)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: WCS Score Badge, Size, Last Opened, Keep/Stage Actions */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right tabular-nums">
                        <div className="text-sm font-bold font-mono text-white">
                          {formatBytes(item.sizeBytes)}
                        </div>
                        <div className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          <span>
                            Opened {formatRelativeDate(item.lastAccessed)}
                          </span>
                        </div>
                      </div>

                      {/* WCS Badge */}
                      <div
                        className={`rounded-xl border px-3 py-1.5 text-center tabular-nums ${wcsStyle.bg} ${wcsStyle.border}`}
                      >
                        <div
                          className={`text-xs font-bold font-mono ${wcsStyle.text}`}
                        >
                          WCS {item.wcsScore}
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {wcsStyle.severity}
                        </div>
                      </div>

                      {/* Quick Card Buttons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRevealInExplorer(item.path);
                          }}
                          title="Reveal in Windows File Explorer"
                          aria-label={`Reveal ${item.fileName} in Windows File Explorer`}
                          className="inline-flex items-center justify-center rounded-xl bg-zinc-800/90 hover:bg-zinc-700 border border-white/10 p-2 text-zinc-300 transition-colors cursor-pointer"
                        >
                          <ExternalLink
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            keepSingleItem(item);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl bg-zinc-800/90 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/30 border border-white/10 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Keep</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStageItem(item.id);
                          }}
                          className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium border transition-colors cursor-pointer ${
                            isStaged
                              ? "bg-rose-500/25 border-rose-400/40 text-rose-200"
                              : "bg-zinc-800/90 hover:bg-rose-500/20 border-white/10 text-zinc-300"
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isStaged ? "Staged" : "Stage"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
