import React, { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { OrganizeView } from "./components/OrganizeView";
import { TriageView } from "./components/TriageView";
import { AutomationView } from "./components/AutomationView";
import { HistoryView } from "./components/HistoryView";
import { SplashScreen } from "./components/SplashScreen";
import { siftIpc } from "./lib/ipc";
import { formatBytes } from "./lib/format";
import type {
  AutomationStatus,
  BatchHistoryItem,
  DryRunPlan,
  ProposedOrganizeItem,
  StorageImpactSummary,
  TriageItem,
  WorkspaceView,
} from "./types/sift";

interface ToastNotification {
  id: string;
  tone: "success" | "info" | "warning";
  title: string;
  detail: string;
}

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<WorkspaceView>("organize");
  const [folders, setFolders] = useState<string[]>([
    "~/Downloads",
    "~/Desktop",
  ]);

  const [dryRunPlan, setDryRunPlan] = useState<DryRunPlan | null>(null);
  const [triageItems, setTriageItems] = useState<TriageItem[]>([]);
  const [batchHistory, setBatchHistory] = useState<BatchHistoryItem[]>([]);
  const [storageImpact, setStorageImpact] = useState<StorageImpactSummary>({
    reclaimableBytes: 0,
    reclaimableFiles: 0,
    freedThisMonthBytes: 0,
    excludedSafeguards: [
      "Windows",
      "System32",
      "AppData",
      "Library",
      "node_modules",
      ".git",
      ".venv",
    ],
  });
  const [automationStatus, setAutomationStatus] =
    useState<AutomationStatus | null>(null);

  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [splashStatus, setSplashStatus] = useState<string>("Scanning PC folders…");
  const [splashProgress, setSplashProgress] = useState<number | null>(null);
  const hasLoadedOnce = React.useRef<boolean>(false);
  const [isExecutingOrganize, setIsExecutingOrganize] =
    useState<boolean>(false);
  const [isDispatchingTrash, setIsDispatchingTrash] = useState<boolean>(false);
  const [revertingBatchId, setRevertingBatchId] = useState<string | null>(null);
  const [isSweeping, setIsSweeping] = useState<boolean>(false);

  const [toast, setToast] = useState<ToastNotification | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");

  const notifyUser = useCallback(
    (
      tone: ToastNotification["tone"],
      title: string,
      detail: string
    ) => {
      const id = `toast_${Date.now()}`;
      setToast({ id, tone, title, detail });
      setLiveAnnouncement(`${title}: ${detail}`);
    },
    []
  );

  const refreshAllData = useCallback(
    async (targetFolders: string[]) => {
      setIsScanning(true);
      if (!hasLoadedOnce.current) {
        setSplashStatus("Looking through your folders…");
        setSplashProgress(25);
      }
      try {
        if (!hasLoadedOnce.current) {
          setSplashStatus("Scanning Downloads & Desktop…");
          setSplashProgress(55);
        }
        const [plan, triage, history, impact, autoStatus] = await Promise.all([
          siftIpc.simulateOrganize(targetFolders),
          siftIpc.scanTriage(targetFolders),
          siftIpc.getBatchHistory(),
          siftIpc.getStorageImpact(targetFolders),
          siftIpc.getAutomationStatus(),
        ]);
        if (!hasLoadedOnce.current) {
          setSplashStatus("Organizing file intelligence…");
          setSplashProgress(90);
        }
        setDryRunPlan(plan);
        setTriageItems(triage.items);
        setBatchHistory(history);
        setStorageImpact(impact);
        setAutomationStatus(autoStatus);
      } catch (err) {
        notifyUser(
          "warning",
          "Native Filesystem Scan Error",
          err instanceof Error ? err.message : String(err)
        );
      } finally {
        setIsScanning(false);
        if (!hasLoadedOnce.current) {
          hasLoadedOnce.current = true;
          setSplashStatus("Ready");
          setSplashProgress(100);
          setTimeout(() => {
            setIsInitialLoading(false);
          }, 320);
        }
      }
    },
    [notifyUser]
  );

  useEffect(() => {
    void refreshAllData(folders);
  }, [folders, refreshAllData]);

  useEffect(() => {
    const viewTitles: Record<WorkspaceView, string> = {
      organize: "Organize (Dry-Run & Sort) | Sift",
      triage: "Smart Triage (Easy Delete) | Sift",
      automation: "Automation Rules | Sift",
      history: "History & Undo Ledger | Sift",
    };
    document.title = viewTitles[activeView];
  }, [activeView]);

  const handleToggleFolder = (folder: string) => {
    setFolders((prev) => {
      if (prev.includes(folder)) {
        if (prev.length === 1) return prev;
        return prev.filter((f) => f !== folder);
      }
      return [...prev, folder];
    });
  };

  const handleAddCustomFolder = (folder: string) => {
    setFolders((prev) => (prev.includes(folder) ? prev : [...prev, folder]));
    notifyUser(
      "info",
      "PC Folder Added",
      `Included ${folder} in Dry-Run & Triage scans.`
    );
  };

  const handleBrowseNativeFolder = async () => {
    try {
      const picked = await siftIpc.pickFolderDialog();
      if (picked) {
        handleAddCustomFolder(picked);
      }
    } catch (err) {
      notifyUser(
        "warning",
        "Folder Picker Error",
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  const handleRemoveCustomFolder = (folder: string) => {
    setFolders((prev) => prev.filter((f) => f !== folder));
  };

  const handleRevealInExplorer = async (path: string) => {
    try {
      await siftIpc.revealInExplorer(path);
    } catch (err) {
      notifyUser(
        "warning",
        "Explorer Launch Error",
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  const handleExecuteOrganize = async (items: ProposedOrganizeItem[]) => {
    setIsExecutingOrganize(true);
    try {
      const res = await siftIpc.executeOrganize(items);
      await refreshAllData(folders);
      notifyUser(
        "success",
        `Organized ${res.movedCount} Files (${formatBytes(
          res.totalBytesOrganized
        )})`,
        `Recorded atomic rollback ledger batch ${res.batchId} in sift_journal.db.`
      );
    } catch (err) {
      notifyUser(
        "warning",
        "Organize Failed",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setIsExecutingOrganize(false);
    }
  };

  const handleTrashSelected = async (selected: TriageItem[]) => {
    setIsDispatchingTrash(true);
    try {
      const res = await siftIpc.trashTriageItems(selected);
      await refreshAllData(folders);
      notifyUser(
        "success",
        `Moved ${res.trashedCount} Items to Windows Recycle Bin`,
        `Reclaimed ${formatBytes(
          res.reclaimedBytes
        )} safely via native OS Recycle Bin (${res.batchId}).`
      );
    } catch (err) {
      notifyUser(
        "warning",
        "Recycle Bin Dispatch Error",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setIsDispatchingTrash(false);
    }
  };

  const handleRevertBatch = async (batchId: string) => {
    setRevertingBatchId(batchId);
    try {
      const res = await siftIpc.revertBatch(batchId);
      await refreshAllData(folders);
      notifyUser(
        "success",
        `Reverted Batch ${res.batchId}`,
        `Restored ${res.restoredCount} files back to their exact original paths on your PC.`
      );
    } catch (err) {
      notifyUser(
        "warning",
        "Rollback Failed",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setRevertingBatchId(null);
    }
  };

  const handleUpdateAutomationConfig = async (params: {
    silentSweepEnabled: boolean;
    heartbeatIntervalMinutes: number;
    fileDropTriggerEnabled: boolean;
    wcsThreshold: number;
    watchedFolders: string[];
  }) => {
    try {
      const next = await siftIpc.updateAutomationConfig(params);
      setAutomationStatus(next);
      notifyUser(
        "info",
        next.silentSweepEnabled
          ? "Silent Sweep Auto-Pilot Armed"
          : "Silent Sweep Auto-Pilot Paused",
        next.silentSweepEnabled
          ? `Monitoring ${next.watchedFolders.join(", ")} every ${
              next.heartbeatIntervalMinutes
            }m.`
          : "Background filesystem automation paused."
      );
    } catch (err) {
      notifyUser(
        "warning",
        "Automation Config Error",
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    const next = await siftIpc.toggleAutomationRule(ruleId, enabled);
    setAutomationStatus(next);
  };

  const handleTriggerSweep = async () => {
    setIsSweeping(true);
    try {
      const next = await siftIpc.triggerSilentSweep();
      setAutomationStatus(next);
      await refreshAllData(folders);
      notifyUser(
        "success",
        "Silent Sweep Heartbeat Completed",
        "Safe files organized and high-WCS clutter queued for review."
      );
    } finally {
      setIsSweeping(false);
    }
  };

  const movableCount =
    dryRunPlan?.categories
      .flatMap((c) => c.items)
      .filter((i) => i.collisionStatus !== "exactDuplicate").length ?? 0;

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-zinc-950 text-zinc-100 relative">
      <AnimatePresence>
        {isInitialLoading && (
          <SplashScreen statusText={splashStatus} progress={splashProgress} />
        )}
      </AnimatePresence>

      <a
        href="#main-workspace"
        className="visually-hidden focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-white"
      >
        Skip to main workspace
      </a>

      <div
        aria-live="polite"
        aria-atomic="true"
        className="visually-hidden"
      >
        {liveAnnouncement}
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
      >
        <div className="absolute -top-40 left-60 h-96 w-96 rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute top-1/3 right-10 h-96 w-96 rounded-full bg-rose-600/8 blur-[130px]" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-emerald-600/8 blur-[120px]" />
      </div>

      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        organizeCount={movableCount}
        triageCount={triageItems.length}
        historyCount={batchHistory.length}
        silentSweepEnabled={automationStatus?.silentSweepEnabled ?? false}
        storageImpact={storageImpact}
      />

      <main
        id="main-workspace"
        tabIndex={-1}
        className="relative z-10 flex-1 h-screen overflow-y-auto px-8 py-6"
      >
        <div className="max-w-6xl mx-auto">
          <AnimatePresence>
            {toast && (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="mb-5 rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/15 px-4 py-3 shadow-2xl flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  {toast.tone === "warning" ? (
                    <AlertCircle
                      className="w-4 h-4 text-amber-400 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle2
                      className="w-4 h-4 text-emerald-400 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <div className="text-xs">
                    <span className="font-bold text-white">{toast.title}</span>{" "}
                    <span className="text-zinc-300">— {toast.detail}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  aria-label="Dismiss notification"
                  className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {activeView === "organize" && (
            <OrganizeView
              folders={folders}
              onToggleFolder={handleToggleFolder}
              onAddCustomFolder={handleAddCustomFolder}
              onBrowseNativeFolder={() => void handleBrowseNativeFolder()}
              onRemoveCustomFolder={handleRemoveCustomFolder}
              onRevealInExplorer={(p) => void handleRevealInExplorer(p)}
              dryRunPlan={dryRunPlan}
              isScanning={isScanning}
              isExecuting={isExecutingOrganize}
              onRefreshDryRun={() => void refreshAllData(folders)}
              onExecuteOrganize={(items) => void handleExecuteOrganize(items)}
            />
          )}

          {activeView === "triage" && (
            <TriageView
              items={triageItems}
              isDispatching={isDispatchingTrash}
              onTrashSelected={(selected) => void handleTrashSelected(selected)}
              onRevealInExplorer={(p) => void handleRevealInExplorer(p)}
              onAnnounce={setLiveAnnouncement}
            />
          )}

          {activeView === "automation" && automationStatus && (
            <AutomationView
              status={automationStatus}
              excludedSafeguards={storageImpact.excludedSafeguards}
              isSweeping={isSweeping}
              onUpdateConfig={(params) =>
                void handleUpdateAutomationConfig(params)
              }
              onToggleRule={(ruleId, enabled) =>
                void handleToggleRule(ruleId, enabled)
              }
              onTriggerSweep={() => void handleTriggerSweep()}
            />
          )}

          {activeView === "history" && (
            <HistoryView
              batches={batchHistory}
              revertingBatchId={revertingBatchId}
              onRevertBatch={(batchId) => void handleRevertBatch(batchId)}
            />
          )}
        </div>
      </main>
    </div>
  );
};
