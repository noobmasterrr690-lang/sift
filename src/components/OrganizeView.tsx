import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Folder,
  FolderOpen,
  Plus,
  X,
  FileText,
  Image,
  Video,
  Archive,
  Code2,
  Music,
  ArrowRight,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Copy,
  RefreshCw,
  Sparkles,
  Fingerprint,
  ExternalLink,
} from "lucide-react";
import type { DryRunPlan, ProposedOrganizeItem } from "../types/sift";
import { formatBytes } from "../lib/format";

interface OrganizeViewProps {
  folders: string[];
  onToggleFolder: (folder: string) => void;
  onAddCustomFolder: (folder: string) => void;
  onBrowseNativeFolder: () => void;
  onRemoveCustomFolder: (folder: string) => void;
  onRevealInExplorer: (path: string) => void;
  dryRunPlan: DryRunPlan | null;
  isScanning: boolean;
  isExecuting: boolean;
  onRefreshDryRun: () => void;
  onExecuteOrganize: (items: ProposedOrganizeItem[]) => void;
}

const TAXONOMY_RULES: Record<
  string,
  {
    pattern: string;
    extensions: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
  }
> = {
  Documents: {
    pattern: "Documents/{EXT_UPPER}/",
    extensions: ".pdf, .docx, .xlsx, .pptx, .txt, .md, .csv",
    icon: FileText,
    accent: "text-sky-400 bg-sky-500/15 border-sky-500/30",
  },
  Images: {
    pattern: "Images/{YYYY}/{MM}/",
    extensions: ".jpg, .jpeg, .png, .webp, .heic, .svg, .raw",
    icon: Image,
    accent: "text-fuchsia-400 bg-fuchsia-500/15 border-fuchsia-500/30",
  },
  Videos: {
    pattern: "Videos/{YYYY}/",
    extensions: ".mp4, .mov, .mkv, .webm, .avi",
    icon: Video,
    accent: "text-violet-400 bg-violet-500/15 border-violet-500/30",
  },
  Archives: {
    pattern: "Archives/",
    extensions: ".zip, .rar, .7z, .tar.gz",
    icon: Archive,
    accent: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  },
  Code_and_Data: {
    pattern: "Code_and_Data/",
    extensions: ".json, .sql, .py, .rs, .ts, .js, .html",
    icon: Code2,
    accent: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  },
  Audio: {
    pattern: "Audio/",
    extensions: ".mp3, .wav, .flac, .aac, .m4a",
    icon: Music,
    accent: "text-rose-400 bg-rose-500/15 border-rose-500/30",
  },
};

const DEFAULT_FOLDERS = ["~/Downloads", "~/Desktop"];

export const OrganizeView: React.FC<OrganizeViewProps> = ({
  folders,
  onToggleFolder,
  onAddCustomFolder,
  onBrowseNativeFolder,
  onRemoveCustomFolder,
  onRevealInExplorer,
  dryRunPlan,
  isScanning,
  isExecuting,
  onRefreshDryRun,
  onExecuteOrganize,
}) => {
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({
    Documents: true,
    Images: true,
    Videos: true,
    Archives: true,
    Code_and_Data: true,
    Audio: true,
  });
  const [showAddInput, setShowAddInput] = useState(false);
  const [customPathInput, setCustomPathInput] = useState("");

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleAddFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customPathInput.trim();
    if (!cleaned) return;
    onAddCustomFolder(cleaned);
    setCustomPathInput("");
    setShowAddInput(false);
  };

  const allItems: ProposedOrganizeItem[] =
    dryRunPlan?.categories.flatMap((c) => c.items) ?? [];
  const movableItems = allItems.filter(
    (i) => i.collisionStatus !== "exactDuplicate"
  );

  const customFolders = folders.filter((f) => !DEFAULT_FOLDERS.includes(f));

  return (
    <div className="space-y-6 pb-12">
      {/* Top Action & Folder Selector Bar */}
      <div className="rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-white">
                Taxonomy Organizer
              </h1>
              <span className="rounded-full bg-indigo-500/15 border border-indigo-400/30 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300">
                Dry-Run Simulation Mode
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Scanning your live PC folders. Preview exact{" "}
              <code className="text-zinc-300">
                Source → Proposed Destination
              </code>{" "}
              paths with BLAKE3 collision checks before moving any files on disk.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onRefreshDryRun}
              disabled={isScanning}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-800 border border-white/10 px-3.5 py-2 text-xs font-medium text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>Re-Scan PC</span>
            </button>

            <button
              type="button"
              onClick={() => onExecuteOrganize(allItems)}
              disabled={isExecuting || movableItems.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600 hover:from-indigo-400 hover:to-violet-500 text-white font-semibold px-4 py-2.5 text-xs shadow-lg shadow-indigo-500/25 border border-indigo-300/30 transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none tabular-nums"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>
                {isExecuting
                  ? "Organizing PC Files..."
                  : `Confirm & Organize (${movableItems.length} Files)`}
              </span>
            </button>
          </div>
        </div>

        {/* Folder Selector Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 mr-1">
            PC Target Folders:
          </span>

          {DEFAULT_FOLDERS.map((folder) => {
            const active = folders.includes(folder);
            return (
              <button
                key={folder}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleFolder(folder)}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-mono font-medium transition-all cursor-pointer border ${
                  active
                    ? "bg-indigo-500/20 border-indigo-400/40 text-indigo-200 shadow-sm"
                    : "bg-zinc-900/80 border-white/10 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Folder
                  className={`w-3.5 h-3.5 ${
                    active ? "text-indigo-400" : "text-zinc-500"
                  }`}
                  aria-hidden="true"
                />
                <span>{folder}</span>
                {active && (
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                )}
              </button>
            );
          })}

          {customFolders.map((folder) => (
            <div
              key={folder}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 pl-3 pr-2 py-1 text-xs font-mono text-indigo-200"
            >
              <Folder
                className="w-3.5 h-3.5 text-indigo-400"
                aria-hidden="true"
              />
              <span>{folder}</span>
              <button
                type="button"
                onClick={() => onRemoveCustomFolder(folder)}
                aria-label={`Remove folder ${folder}`}
                className="p-0.5 rounded-full hover:bg-white/15 text-indigo-300 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={onBrowseNativeFolder}
            className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/35 px-3 py-1.5 text-xs font-medium text-indigo-200 transition-colors cursor-pointer"
          >
            <FolderOpen
              className="w-3.5 h-3.5 text-indigo-400"
              aria-hidden="true"
            />
            <span>+ Browse PC Folder…</span>
          </button>

          {showAddInput ? (
            <form
              onSubmit={handleAddFolderSubmit}
              className="inline-flex items-center gap-1.5"
            >
              <label htmlFor="custom-folder-input" className="visually-hidden">
                Custom PC folder path
              </label>
              <input
                id="custom-folder-input"
                type="text"
                value={customPathInput}
                onChange={(e) => setCustomPathInput(e.target.value)}
                placeholder="e.g. C:\Users\Kier\Documents"
                autoFocus
                className="rounded-full bg-zinc-950 border border-indigo-400/50 px-3 py-1 text-xs font-mono text-white placeholder:text-zinc-500"
              />
              <button
                type="submit"
                className="rounded-full bg-indigo-500/30 hover:bg-indigo-500/40 border border-indigo-400/40 px-2.5 py-1 text-xs font-medium text-indigo-200 cursor-pointer"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowAddInput(false)}
                className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddInput(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-dashed border-white/20 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
              <span>Type Path</span>
            </button>
          )}
        </div>
      </div>

      {/* Dry-Run Telemetry Strip */}
      {dryRunPlan && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <div className="rounded-2xl bg-zinc-900/50 border border-white/10 p-4">
            <div className="text-[11px] text-zinc-400 font-medium">
              Staged for Taxonomy Sort
            </div>
            <div className="mt-1 text-2xl font-bold text-white tabular-nums font-mono">
              {movableItems.length}{" "}
              <span className="text-xs font-normal text-zinc-400">files</span>
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-900/50 border border-white/10 p-4">
            <div className="text-[11px] text-zinc-400 font-medium">
              Total Payload Volume
            </div>
            <div className="mt-1 text-2xl font-bold text-indigo-300 tabular-nums font-mono">
              {formatBytes(dryRunPlan.totalBytes)}
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-900/50 border border-white/10 p-4">
            <div className="text-[11px] text-zinc-400 font-medium">
              Auto-Increment Collisions
            </div>
            <div className="mt-1 text-2xl font-bold text-amber-300 tabular-nums font-mono">
              {dryRunPlan.renamedConflicts}{" "}
              <span className="text-xs font-normal text-zinc-400">
                suffixed
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-900/50 border border-white/10 p-4">
            <div className="text-[11px] text-zinc-400 font-medium">
              BLAKE3 Exact Duplicates
            </div>
            <div className="mt-1 text-2xl font-bold text-rose-300 tabular-nums font-mono">
              {dryRunPlan.duplicateConflicts}{" "}
              <span className="text-xs font-normal text-zinc-400">
                routed to Triage
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Category Breakdown Cards */}
      {dryRunPlan && dryRunPlan.categories.length === 0 ? (
        <div className="rounded-2xl bg-zinc-900/40 border border-white/10 p-12 text-center space-y-3">
          <CheckCircle2
            className="w-10 h-10 text-emerald-400 mx-auto"
            aria-hidden="true"
          />
          <h2 className="text-base font-semibold text-white">
            All Monitored PC Folders Are Clean & Organized
          </h2>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            No loose top-level files require sorting in{" "}
            <span className="font-mono text-zinc-300">
              {folders.join(", ") || "selected folders"}
            </span>
            . Click <strong>+ Browse PC Folder…</strong> to scan another
            directory, or revert a batch in <strong>History & Undo</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {dryRunPlan?.categories.map((cat) => {
            const meta = TAXONOMY_RULES[cat.category] ?? {
              pattern: `${cat.category}/`,
              extensions: "*",
              icon: Folder,
              accent: "text-indigo-400 bg-indigo-500/15 border-indigo-500/30",
            };
            const Icon = meta.icon;
            const isOpen = !!expandedCategories[cat.category];
            const captionId = `caption-${cat.category}`;

            return (
              <motion.section
                key={cat.category}
                layout
                className="rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 overflow-hidden shadow-lg"
              >
                {/* Category Card Header */}
                <div className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`h-10 w-10 rounded-xl border flex items-center justify-center ${meta.accent}`}
                    >
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-sm font-bold text-white">
                          {cat.categoryLabel}
                        </h2>
                        <span className="rounded-md bg-white/[0.06] border border-white/10 px-2 py-0.5 text-[11px] font-mono text-zinc-300">
                          → {meta.pattern}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                        Extensions: {meta.extensions}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right tabular-nums">
                      <div className="text-xs font-bold text-white font-mono">
                        {cat.fileCount} {cat.fileCount === 1 ? "file" : "files"}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        {formatBytes(cat.totalBytes)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleCategory(cat.category)}
                      aria-expanded={isOpen}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
                    >
                      <span>{isOpen ? "Hide Diff" : "Inspect Diff"}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>

                {/* Expandable Source -> Destination Diff Table */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-white/10 bg-zinc-950/70"
                    >
                      <div
                        tabIndex={0}
                        role="region"
                        aria-labelledby={captionId}
                        className="sift-table-wrapper"
                      >
                        <table className="sift-diff-table text-left text-xs">
                          <caption id={captionId} className="visually-hidden">
                            {cat.categoryLabel} dry-run source to proposed
                            destination diff table
                          </caption>
                          <thead>
                            <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-zinc-400">
                              <th scope="col" className="py-2.5 px-4 font-semibold">
                                File Name
                              </th>
                              <th scope="col" className="py-2.5 px-4 font-semibold">
                                Source Path on PC
                              </th>
                              <th scope="col" className="py-2.5 px-4 font-semibold">
                                Proposed Destination
                              </th>
                              <th scope="col" className="py-2.5 px-4 font-semibold">
                                Collision / Hash
                              </th>
                              <th
                                scope="col"
                                className="py-2.5 px-4 font-semibold text-right"
                              >
                                Size
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {cat.items.map((item) => (
                              <tr
                                key={item.id}
                                className="hover:bg-white/[0.02] transition-colors"
                              >
                                <th
                                  scope="row"
                                  className="py-3 px-4 font-medium text-zinc-100 whitespace-nowrap"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="truncate max-w-[210px]">
                                      {item.fileName}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onRevealInExplorer(item.sourcePath)
                                      }
                                      aria-label={`Reveal ${item.fileName} in Windows File Explorer`}
                                      title="Reveal in Windows File Explorer"
                                      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-indigo-300 transition-colors cursor-pointer"
                                    >
                                      <ExternalLink
                                        className="w-3 h-3"
                                        aria-hidden="true"
                                      />
                                    </button>
                                  </div>
                                </th>
                                <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">
                                  {item.sourcePath}
                                </td>
                                <td className="py-3 px-4 font-mono text-[11px] text-indigo-300">
                                  <span className="inline-flex items-center gap-1.5">
                                    <ArrowRight
                                      className="w-3 h-3 text-zinc-500 shrink-0"
                                      aria-hidden="true"
                                    />
                                    <span>{item.destinationPath}</span>
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex flex-col gap-1">
                                    {item.collisionStatus === "clear" && (
                                      <span className="inline-flex items-center gap-1 w-fit rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                                        <CheckCircle2
                                          className="w-3 h-3"
                                          aria-hidden="true"
                                        />
                                        Ready to Move
                                      </span>
                                    )}
                                    {item.collisionStatus === "renamed" && (
                                      <span
                                        title={item.collisionNote ?? undefined}
                                        className="inline-flex items-center gap-1 w-fit rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-300"
                                      >
                                        <AlertTriangle
                                          className="w-3 h-3"
                                          aria-hidden="true"
                                        />
                                        Suffix Renamed
                                      </span>
                                    )}
                                    {item.collisionStatus ===
                                      "exactDuplicate" && (
                                      <span
                                        title={item.collisionNote ?? undefined}
                                        className="inline-flex items-center gap-1 w-fit rounded-full bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[10px] font-medium text-rose-300"
                                      >
                                        <Copy
                                          className="w-3 h-3"
                                          aria-hidden="true"
                                        />
                                        Duplicate (Flagged)
                                      </span>
                                    )}
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                                      <Fingerprint
                                        className="w-2.5 h-2.5"
                                        aria-hidden="true"
                                      />
                                      {item.blake3Hash.slice(0, 12)}…
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-300 whitespace-nowrap">
                                  {formatBytes(item.sizeBytes)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
