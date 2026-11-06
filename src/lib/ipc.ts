import { invoke } from "@tauri-apps/api/core";
import type {
  AutomationStatus,
  BatchHistoryItem,
  DryRunPlan,
  OrganizeExecutionResult,
  ProposedOrganizeItem,
  RevertBatchResult,
  StorageImpactSummary,
  TrashDispatchResult,
  TriageItem,
  TriageScanReport,
} from "../types/sift";

/**
 * Checks if running inside the compiled Tauri v2 WebView2 shell.
 */
export function isTauriNative(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/**
 * Invokes a native PC filesystem command either via Tauri v2 IPC (`window.__TAURI_INTERNALS__`)
 * or via the local Sift Native PC Host (`Sift.exe` loopback IPC).
 * Zero mock data: every call executes against the real Windows PC filesystem and SQLite ledger.
 */
async function callNativeBackend<T>(
  command: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  if (isTauriNative()) {
    return invoke<T>(command, payload);
  }

  const response = await fetch(`/api/ipc/${command}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `Native IPC command '${command}' failed.`);
  }

  return (await response.json()) as T;
}

export const siftIpc = {
  simulateOrganize(folders: string[]): Promise<DryRunPlan> {
    return callNativeBackend<DryRunPlan>("simulate_organize", { folders });
  },

  executeOrganize(
    items: ProposedOrganizeItem[]
  ): Promise<OrganizeExecutionResult> {
    return callNativeBackend<OrganizeExecutionResult>("execute_organize", {
      items,
    });
  },

  scanTriage(folders: string[]): Promise<TriageScanReport> {
    return callNativeBackend<TriageScanReport>("scan_triage", { folders });
  },

  trashTriageItems(items: TriageItem[]): Promise<TrashDispatchResult> {
    return callNativeBackend<TrashDispatchResult>("trash_triage_items", {
      items,
    });
  },

  getBatchHistory(): Promise<BatchHistoryItem[]> {
    return callNativeBackend<BatchHistoryItem[]>("get_batch_history");
  },

  revertBatch(batchId: string): Promise<RevertBatchResult> {
    return callNativeBackend<RevertBatchResult>("revert_batch", { batchId });
  },

  getStorageImpact(folders: string[]): Promise<StorageImpactSummary> {
    return callNativeBackend<StorageImpactSummary>("get_storage_impact", {
      folders,
    });
  },

  getAutomationStatus(): Promise<AutomationStatus> {
    return callNativeBackend<AutomationStatus>("get_automation_status");
  },

  updateAutomationConfig(params: {
    silentSweepEnabled: boolean;
    heartbeatIntervalMinutes: number;
    fileDropTriggerEnabled: boolean;
    wcsThreshold: number;
    watchedFolders: string[];
  }): Promise<AutomationStatus> {
    return callNativeBackend<AutomationStatus>(
      "update_automation_config",
      params
    );
  },

  toggleAutomationRule(
    ruleId: string,
    enabled: boolean
  ): Promise<AutomationStatus> {
    return callNativeBackend<AutomationStatus>("toggle_automation_rule", {
      ruleId,
      enabled,
    });
  },

  triggerSilentSweep(): Promise<AutomationStatus> {
    return callNativeBackend<AutomationStatus>("trigger_silent_sweep");
  },

  pickFolderDialog(): Promise<string | null> {
    return callNativeBackend<string | null>("pick_folder_dialog");
  },

  revealInExplorer(path: string): Promise<void> {
    return callNativeBackend<void>("reveal_in_explorer", { path });
  },
};
