export type WorkspaceView = "organize" | "triage" | "automation" | "history";

export type CollisionStatus = "clear" | "renamed" | "exactDuplicate";

export interface ProposedOrganizeItem {
  id: string;
  fileName: string;
  extension: string;
  category: string;
  categoryLabel: string;
  sourcePath: string;
  destinationPath: string;
  relativeDestination: string;
  sizeBytes: number;
  modifiedAt: number;
  blake3Hash: string;
  collisionStatus: CollisionStatus;
  collisionNote?: string | null;
  parentFolder: string;
}

export interface CategoryBreakdown {
  category: string;
  categoryLabel: string;
  fileCount: number;
  totalBytes: number;
  items: ProposedOrganizeItem[];
}

export interface DryRunPlan {
  generatedAt: number;
  scannedFolders: string[];
  totalFiles: number;
  totalBytes: number;
  duplicateConflicts: number;
  renamedConflicts: number;
  categories: CategoryBreakdown[];
}

export interface OrganizeExecutionResult {
  batchId: string;
  movedCount: number;
  skippedDuplicates: number;
  totalBytesOrganized: number;
  timestamp: number;
}

export type TriageCategoryName =
  | "All Clutter"
  | "Old Installers"
  | "Exact Duplicates"
  | "Untouched Screenshots"
  | "Temp & Incomplete"
  | "Large Stale Files";

export interface TriageItem {
  id: string;
  fileName: string;
  path: string;
  extension: string;
  sizeBytes: number;
  lastAccessed: number;
  modifiedAt: number;
  daysUntouched: number;
  wcsScore: number;
  category: Exclude<TriageCategoryName, "All Clutter">;
  reason: string;
  blake3Hash?: string | null;
  duplicateOf?: string | null;
  parentFolder: string;
}

export interface TriageScanReport {
  generatedAt: number;
  totalFlaggedFiles: number;
  totalReclaimableBytes: number;
  items: TriageItem[];
}

export interface TrashDispatchResult {
  batchId: string;
  trashedCount: number;
  reclaimedBytes: number;
  timestamp: number;
}

export interface JournalEntryRecord {
  id: number;
  batchId: string;
  operationType: "ORGANIZE_MOVE" | "TRIAGE_TRASH" | string;
  sourcePath: string;
  destinationPath: string;
  fileHash: string;
  sizeBytes: number;
  timestamp: number;
  reverted: boolean;
}

export interface BatchHistoryItem {
  batchId: string;
  operationType: "ORGANIZE_MOVE" | "TRIAGE_TRASH" | string;
  timestamp: number;
  fileCount: number;
  totalBytes: number;
  reverted: boolean;
  canRevert: boolean;
  entries: JournalEntryRecord[];
}

export interface RevertBatchResult {
  batchId: string;
  restoredCount: number;
  failedPaths: string[];
  timestamp: number;
}

export interface StorageImpactSummary {
  reclaimableBytes: number;
  reclaimableFiles: number;
  freedThisMonthBytes: number;
  excludedSafeguards: string[];
  userHomeDir?: string;
  dbLedgerPath?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  categoryScope: string[];
  enabled: boolean;
}

export interface AutomationEventLog {
  id: string;
  timestamp: number;
  eventType: string;
  summary: string;
  filesAffected: number;
}

export interface AutomationStatus {
  silentSweepEnabled: boolean;
  heartbeatIntervalMinutes: number;
  fileDropTriggerEnabled: boolean;
  autoQueueHighWcs: boolean;
  wcsThreshold: number;
  watchedFolders: string[];
  lastHeartbeatAt?: number | null;
  queuedTriageCount: number;
  rules: AutomationRule[];
  recentEvents: AutomationEventLog[];
}
