import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database,
  RotateCcw,
  ChevronDown,
  ArrowRight,
  CheckCircle2,
  Trash2,
  FolderKanban,
  Fingerprint,
  Clock,
} from "lucide-react";
import type { BatchHistoryItem } from "../types/sift";
import {
  formatBytes,
  formatExactTimestamp,
  formatRelativeDate,
} from "../lib/format";

interface HistoryViewProps {
  batches: BatchHistoryItem[];
  revertingBatchId: string | null;
  onRevertBatch: (batchId: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  batches,
  revertingBatchId,
  onRevertBatch,
}) => {
  const [expandedBatches, setExpandedBatches] = useState<
    Record<string, boolean>
  >(() => {
    const first = batches[0]?.batchId;
    return first ? { [first]: true } : {};
  });

  const toggleExpand = (batchId: string) => {
    setExpandedBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white">
              ACID Rollback & Undo Ledger
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-mono font-medium text-emerald-300">
              <Database className="w-3 h-3" aria-hidden="true" />
              sift_journal.db (WAL)
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Every batch execution records{" "}
            <code className="text-zinc-300">
              (batch_id, operation_type, source_path, destination_path,
              file_hash, timestamp)
            </code>{" "}
            in embedded SQLite for 1-click atomic rollback.
          </p>
        </div>

        <div className="flex items-center gap-4 text-right tabular-nums">
          <div className="rounded-xl bg-zinc-950/80 border border-white/10 px-3.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">
              Recorded Batches
            </div>
            <div className="text-base font-bold font-mono text-white">
              {batches.length}
            </div>
          </div>
          <div className="rounded-xl bg-zinc-950/80 border border-white/10 px-3.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">
              Total Tracked Entries
            </div>
            <div className="text-base font-bold font-mono text-indigo-300">
              {batches.reduce((s, b) => s + b.fileCount, 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline of Batches */}
      {batches.length === 0 ? (
        <div className="rounded-2xl bg-zinc-900/40 border border-white/10 p-12 text-center space-y-2">
          <Database
            className="w-10 h-10 text-zinc-500 mx-auto"
            aria-hidden="true"
          />
          <h2 className="text-base font-semibold text-white">
            No Journal Batches Recorded Yet
          </h2>
          <p className="text-xs text-zinc-400">
            Execute an organization plan or triage cleanup to populate{" "}
            <code>sift_journal.db</code>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => {
            const isOrganize = batch.operationType === "ORGANIZE_MOVE";
            const isOpen = !!expandedBatches[batch.batchId];
            const isReverting = revertingBatchId === batch.batchId;

            return (
              <motion.section
                key={batch.batchId}
                layout
                className={`rounded-2xl backdrop-blur-xl border overflow-hidden transition-colors ${
                  batch.reverted
                    ? "bg-zinc-900/30 border-white/5 opacity-75"
                    : "bg-zinc-900/60 border-white/10"
                }`}
              >
                <div className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
                        isOrganize
                          ? "bg-indigo-500/15 border-indigo-400/30 text-indigo-300"
                          : "bg-rose-500/15 border-rose-400/30 text-rose-300"
                      }`}
                    >
                      {isOrganize ? (
                        <FolderKanban className="w-5 h-5" aria-hidden="true" />
                      ) : (
                        <Trash2 className="w-5 h-5" aria-hidden="true" />
                      )}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-bold font-mono text-white">
                          {batch.batchId}
                        </h2>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-mono font-semibold border ${
                            isOrganize
                              ? "bg-indigo-500/15 border-indigo-400/30 text-indigo-300"
                              : "bg-rose-500/15 border-rose-400/30 text-rose-300"
                          }`}
                        >
                          {batch.operationType}
                        </span>
                        {batch.reverted && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                            <CheckCircle2
                              className="w-3 h-3"
                              aria-hidden="true"
                            />
                            Reverted to Original Paths
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5 tabular-nums">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        <span>{formatExactTimestamp(batch.timestamp)}</span>
                        <span>•</span>
                        <span>{formatRelativeDate(batch.timestamp)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Metrics + Revert CTA */}
                  <div className="flex items-center gap-3">
                    <div className="text-right tabular-nums mr-1">
                      <div className="text-xs font-bold font-mono text-white">
                        {batch.fileCount}{" "}
                        {batch.fileCount === 1 ? "file" : "files"}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-400">
                        {formatBytes(batch.totalBytes)}
                      </div>
                    </div>

                    {batch.canRevert && (
                      <button
                        type="button"
                        onClick={() => onRevertBatch(batch.batchId)}
                        disabled={isReverting}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 px-3.5 py-2 text-xs font-semibold text-amber-200 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw
                          className={`w-3.5 h-3.5 ${
                            isReverting ? "animate-spin" : ""
                          }`}
                          aria-hidden="true"
                        />
                        <span>
                          {isReverting ? "Reverting..." : "Revert Batch"}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleExpand(batch.batchId)}
                      aria-expanded={isOpen}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
                    >
                      <span>{isOpen ? "Hide Ledger" : "Entries"}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>

                {/* Expandable Ledger Entries */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-white/10 bg-zinc-950/75 p-4"
                    >
                      <ul role="list" className="space-y-2">
                        {batch.entries.map((entry) => (
                          <li
                            key={entry.id}
                            className="rounded-xl bg-zinc-900/70 border border-white/[0.07] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono"
                          >
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span className="text-zinc-300 truncate max-w-xs">
                                {entry.sourcePath}
                              </span>
                              <ArrowRight
                                className="w-3.5 h-3.5 text-zinc-500 shrink-0"
                                aria-hidden="true"
                              />
                              <span
                                className={`truncate max-w-xs ${
                                  isOrganize
                                    ? "text-indigo-300"
                                    : "text-rose-300"
                                }`}
                              >
                                {entry.destinationPath}
                              </span>
                            </div>

                            <div className="flex items-center gap-4 text-[11px] text-zinc-400 tabular-nums">
                              {entry.fileHash && (
                                <span className="inline-flex items-center gap-1 text-zinc-500">
                                  <Fingerprint
                                    className="w-3 h-3"
                                    aria-hidden="true"
                                  />
                                  {entry.fileHash.slice(0, 12)}…
                                </span>
                              )}
                              <span className="text-zinc-300">
                                {formatBytes(entry.sizeBytes)}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.section>
            );
          })}
        </div>
      )}
    </div>
  );
};
