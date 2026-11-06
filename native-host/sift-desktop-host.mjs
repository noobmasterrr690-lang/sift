import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
// The desktop UI lives in app-ui/ (kept separate from dist/, which `vite build` would wipe).
const UI_DIR = path.join(PROJECT_ROOT, "app-ui");

// ---------------------------------------------------------------------------
// 1. Safety: folders Sift never looks inside
// ---------------------------------------------------------------------------
const EXCLUDED_DIRS = [
  "Windows",
  "System32",
  "SysWOW64",
  "AppData",
  "Library",
  "node_modules",
  ".git",
  ".venv",
  "Program Files",
  "Program Files (x86)",
  "$Recycle.Bin",
  "System Volume Information",
];

// File types Sift never moves (shortcuts, in-progress downloads, system files).
const NEVER_MOVE_EXTS = new Set([
  "lnk",
  "url",
  "ini",
  "crdownload",
  "part",
  "partial",
  "download",
  "opdownload",
  "tmp",
  "sys",
  "dll",
  "idlk", // InDesign lock file — exists while a document is open
  "lock",
]);

// ---------------------------------------------------------------------------
// 2. Folder rules — every file type gets a home (unknown types go to Other)
// ---------------------------------------------------------------------------
const CATEGORY_RULES = [
  {
    key: "Images",
    label: "Images",
    icon: "🖼️",
    layout: "year-month",
    exts: ["jpg", "jpeg", "jfif", "png", "webp", "heic", "heif", "gif", "bmp", "tif", "tiff", "svg", "ico", "avif", "raw", "cr2", "cr3", "nef", "arw", "dng", "orf", "rw2"],
  },
  {
    key: "Design",
    label: "Design Files",
    icon: "🎨",
    layout: "by-type",
    exts: ["psd", "psb", "ai", "indd", "idml", "indt", "inx", "indb", "eps", "sketch", "fig", "xd", "afdesign", "afphoto", "afpub", "cdr", "xcf", "kra", "procreate", "clip", "aep", "prproj", "drp", "fla", "drawio", "xmp"],
  },
  {
    key: "Videos",
    label: "Videos",
    icon: "🎬",
    layout: "year",
    exts: ["mp4", "mov", "mkv", "webm", "avi", "wmv", "flv", "m4v", "mpg", "mpeg", "3gp", "mts", "srt"],
  },
  {
    key: "Audio",
    label: "Music & Audio",
    icon: "🎵",
    layout: "flat",
    exts: ["mp3", "wav", "flac", "aac", "m4a", "ogg", "wma", "aiff", "aif", "opus", "mid", "midi"],
  },
  {
    key: "Documents",
    label: "Documents",
    icon: "📄",
    layout: "by-type",
    exts: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv", "tsv", "rtf", "odt", "ods", "odp", "pages", "numbers", "key"],
  },
  {
    key: "Ebooks",
    label: "E-books",
    icon: "📚",
    layout: "flat",
    exts: ["epub", "mobi", "azw", "azw3", "djvu"],
  },
  {
    key: "Archives",
    label: "Zip & Archives",
    icon: "🗜️",
    layout: "flat",
    exts: ["zip", "rar", "7z", "tar.gz", "tar", "gz", "tgz", "bz2", "xz"],
  },
  {
    key: "Installers",
    label: "Installers",
    icon: "💿",
    layout: "flat",
    exts: ["exe", "msi", "dmg", "pkg", "iso", "appx", "msix", "apk", "deb", "ipa"],
  },
  {
    key: "Fonts",
    label: "Fonts",
    icon: "🔤",
    layout: "flat",
    exts: ["ttf", "otf", "woff", "woff2", "fon"],
  },
  {
    key: "3D_Models",
    label: "3D Models",
    icon: "🧊",
    layout: "flat",
    exts: ["obj", "fbx", "stl", "blend", "3ds", "dae", "glb", "gltf", "max", "c4d", "skp"],
  },
  {
    key: "Code_and_Data",
    label: "Code & Data",
    icon: "💻",
    layout: "flat",
    exts: ["json", "sql", "py", "rs", "ts", "tsx", "js", "jsx", "html", "htm", "css", "scss", "xml", "yaml", "yml", "java", "c", "cpp", "h", "cs", "go", "php", "rb", "sh", "bat", "ps1", "ipynb", "kt", "swift", "lua", "toml"],
  },
];

const OTHER_CATEGORY = {
  key: "Other",
  label: "Other Files",
  icon: "📦",
  layout: "by-type",
  exts: [],
};

const EXT_TO_CATEGORY = new Map();
for (const rule of CATEGORY_RULES) {
  for (const ext of rule.exts) EXT_TO_CATEGORY.set(ext, rule);
}

const SIFT_MANAGED_FOLDERS = [
  ...CATEGORY_RULES.map((r) => r.key),
  OTHER_CATEGORY.key,
];

/** Returns the category for a file, or null if Sift should leave it where it is. */
function classifyExtension(ext) {
  const lower = String(ext || "").toLowerCase();
  if (NEVER_MOVE_EXTS.has(lower)) return null;
  return EXT_TO_CATEGORY.get(lower) || OTHER_CATEGORY;
}

function computeSubfolder(rule, ext, modifiedUnix) {
  const dt = new Date(modifiedUnix * 1000);
  const year = String(dt.getFullYear());
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  switch (rule.layout) {
    case "year-month":
      return path.join(rule.key, year, month);
    case "year":
      return path.join(rule.key, year);
    case "by-type":
      return ext ? path.join(rule.key, String(ext).toUpperCase().replace(/\./g, "_")) : rule.key;
    default:
      return rule.key;
  }
}

// ---------------------------------------------------------------------------
// 3. Path helpers & hashing
// ---------------------------------------------------------------------------
export function expandUserPath(raw) {
  const trimmed = String(raw || "").trim();
  const home = os.homedir();
  if (trimmed === "~/Downloads" || trimmed === "~\\Downloads") {
    return path.join(home, "Downloads");
  }
  if (trimmed === "~/Desktop" || trimmed === "~\\Desktop") {
    return path.join(home, "Desktop");
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(home, trimmed.slice(2));
  }
  if (trimmed === "~") return home;
  return path.resolve(trimmed);
}

export function isExcludedPath(targetPath) {
  const segments = path.resolve(targetPath).split(path.sep);
  return segments.some((seg) =>
    EXCLUDED_DIRS.some((ex) => ex.toLowerCase() === seg.toLowerCase())
  );
}

/** Quick fingerprint (size + start/middle/end) — used only to find *candidate* duplicates. */
function computeQuickHash(filePath, size) {
  const fd = fs.openSync(filePath, "r");
  try {
    const hash = crypto.createHash("sha256");
    hash.update(`size:${size}:`);
    const chunk = 64 * 1024;
    const buf = Buffer.allocUnsafe(chunk);
    const offsets =
      size <= chunk * 3 ? [0] : [0, Math.floor(size / 2), Math.max(0, size - chunk)];
    for (const off of offsets) {
      const read = fs.readSync(fd, buf, 0, Math.min(chunk, size), off);
      hash.update(buf.subarray(0, read));
      if (size <= chunk * 3 && read < size) {
        // small file: read the rest
        let pos = read;
        while (pos < size) {
          const r = fs.readSync(fd, buf, 0, chunk, pos);
          if (r <= 0) break;
          hash.update(buf.subarray(0, r));
          pos += r;
        }
      }
    }
    return hash.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}

/** Full-content SHA-256 — used to *confirm* a file is a true exact copy before calling it a duplicate. */
function computeFullHash(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const hash = crypto.createHash("sha256");
    const buf = Buffer.allocUnsafe(1024 * 1024);
    let r;
    while ((r = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, r));
    }
    return hash.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}

function extractExtension(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base.endsWith(".tar.gz")) return "tar.gz";
  const ext = path.extname(base).slice(1);
  // Names like "Bombshell. -hedy lamar" have a dot but no real extension.
  return /^[a-z0-9]{1,10}$/.test(ext) && /[a-z]/.test(ext) ? ext : "";
}

// ---------------------------------------------------------------------------
// 4. Scanner
// ---------------------------------------------------------------------------
export function scanDirectories(targetFolders, maxDepth = 1, skipManagedSubfolders = true) {
  const results = [];

  function walk(currentDir, rootRaw, depth) {
    if (depth > maxDepth || isExcludedPath(currentDir)) return;
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (isExcludedPath(fullPath)) continue;

      if (entry.isDirectory()) {
        if (
          skipManagedSubfolders &&
          depth === 1 &&
          SIFT_MANAGED_FOLDERS.some((m) => m.toLowerCase() === entry.name.toLowerCase())
        ) {
          continue;
        }
        walk(fullPath, rootRaw, depth + 1);
      } else if (entry.isFile()) {
        const lowerName = entry.name.toLowerCase();
        if (lowerName.startsWith(".") || lowerName === "desktop.ini" || lowerName === "thumbs.db") {
          continue;
        }
        let stat;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue;
        }
        results.push({
          path: fullPath,
          fileName: entry.name,
          extension: extractExtension(fullPath),
          sizeBytes: Number(stat.size),
          modifiedAt: Math.floor(stat.mtimeMs / 1000),
          accessedAt: Math.floor((stat.atimeMs || stat.mtimeMs) / 1000),
          parentFolder: rootRaw,
        });
      }
    }
  }

  for (const rawFolder of targetFolders) {
    const resolved = expandUserPath(rawFolder);
    if (!fs.existsSync(resolved) || isExcludedPath(resolved)) continue;
    walk(resolved, rawFolder, 1);
  }
  return results;
}

// ---------------------------------------------------------------------------
// 5. Undo history (SQLite, stored in %LOCALAPPDATA%\Sift\sift_journal.db)
// ---------------------------------------------------------------------------
const appDataBase = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const siftDataDir = path.join(appDataBase, "Sift");
fs.mkdirSync(siftDataDir, { recursive: true });

const LOG_FILE = path.join(siftDataDir, "server.log");
export function logHost(...args) {
  const line = `[${new Date().toISOString()}] ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : a)).join(" ")}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}
process.on("uncaughtException", (err) => {
  logHost("UNCAUGHT EXCEPTION:", err.stack || err);
});
process.on("unhandledRejection", (err) => {
  logHost("UNHANDLED REJECTION:", err?.stack || err);
});
const DB_PATH = path.join(siftDataDir, "sift_journal.db");

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS sift_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    source_path TEXT NOT NULL,
    destination_path TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    timestamp INTEGER NOT NULL,
    reverted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sift_ledger_batch_id ON sift_ledger(batch_id);
  CREATE INDEX IF NOT EXISTS idx_sift_ledger_timestamp ON sift_ledger(timestamp DESC);
`);

function recordLedgerBatch(entries) {
  if (!entries || entries.length === 0) return;
  const insertStmt = db.prepare(`
    INSERT INTO sift_ledger (
      batch_id, operation_type, source_path, destination_path, file_hash, size_bytes, timestamp, reverted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `);
  db.exec("BEGIN TRANSACTION");
  try {
    for (const e of entries) {
      insertStmt.run(
        e.batchId,
        e.operationType,
        e.sourcePath,
        e.destinationPath,
        e.fileHash || "",
        Number(e.sizeBytes || 0),
        Number(e.timestamp)
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function listLedgerBatches() {
  const rows = db
    .prepare(`
      SELECT id, batch_id, operation_type, source_path, destination_path, file_hash, size_bytes, timestamp, reverted
      FROM sift_ledger
      ORDER BY timestamp DESC, id ASC
    `)
    .all();

  const grouped = new Map();
  for (const r of rows) {
    if (!grouped.has(r.batch_id)) grouped.set(r.batch_id, []);
    grouped.get(r.batch_id).push({
      id: Number(r.id),
      batchId: r.batch_id,
      operationType: r.operation_type,
      sourcePath: r.source_path,
      destinationPath: r.destination_path,
      fileHash: r.file_hash,
      sizeBytes: Number(r.size_bytes),
      timestamp: Number(r.timestamp),
      reverted: Number(r.reverted) !== 0,
    });
  }

  const history = [];
  for (const [batchId, entries] of grouped.entries()) {
    const first = entries[0];
    const reverted = entries.every((e) => e.reverted);
    history.push({
      batchId,
      operationType: first.operationType,
      timestamp: first.timestamp,
      fileCount: entries.length,
      totalBytes: entries.reduce((s, e) => s + e.sizeBytes, 0),
      reverted,
      canRevert: !reverted && first.operationType === "ORGANIZE_MOVE",
      entries,
    });
  }
  return history;
}

export function revertLedgerBatch(batchId) {
  const rows = db
    .prepare(`
      SELECT id, operation_type, source_path, destination_path
      FROM sift_ledger
      WHERE batch_id = ? AND reverted = 0
      ORDER BY id DESC
    `)
    .all(batchId);
  if (!rows || rows.length === 0) {
    throw new Error("This batch was already undone.");
  }

  let restoredCount = 0;
  const failedPaths = [];
  const restoredIds = [];

  for (const row of rows) {
    if (row.operation_type !== "ORGANIZE_MOVE") continue;
    const currentPath = row.destination_path;
    const originalPath = row.source_path;
    if (!fs.existsSync(currentPath) || fs.existsSync(originalPath)) {
      failedPaths.push(originalPath);
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(originalPath), { recursive: true });
      fs.renameSync(currentPath, originalPath);
      restoredCount += 1;
      restoredIds.push(Number(row.id));
    } catch {
      failedPaths.push(originalPath);
    }
  }

  if (restoredIds.length > 0) {
    const upd = db.prepare("UPDATE sift_ledger SET reverted = 1 WHERE id = ?");
    db.exec("BEGIN TRANSACTION");
    try {
      for (const id of restoredIds) upd.run(id);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  return { batchId, restoredCount, failedPaths, timestamp: Math.floor(Date.now() / 1000) };
}

// ---------------------------------------------------------------------------
// 6. Tidy Up (organizer)
// ---------------------------------------------------------------------------
function splitStemAndExt(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".tar.gz") && fileName.length > 7) {
    return [fileName.slice(0, -7), fileName.slice(-7)];
  }
  const ext = path.extname(fileName);
  return [ext ? fileName.slice(0, -ext.length) : fileName, ext];
}

/**
 * Picks a destination that does not overwrite anything.
 * - Free name → use it.
 * - Name taken by an identical file (full hash match) → "alreadyThere" (left in place, flagged in Clean Up).
 * - Name taken by a different file → add " (1)", " (2)" … suffix.
 */
function resolveDestination(targetDir, fileName, sourcePath, sourceSize, reserved) {
  const isTaken = (p) => fs.existsSync(p) || reserved.has(p.toLowerCase());
  let sourceHash = null;
  const sameContent = (p) => {
    try {
      if (!fs.existsSync(p) || fs.statSync(p).size !== sourceSize) return false;
      if (sourceHash === null) sourceHash = computeFullHash(sourcePath);
      return computeFullHash(p) === sourceHash;
    } catch {
      return false;
    }
  };

  const first = path.join(targetDir, fileName);
  if (!isTaken(first)) return { destPath: first, status: "clear" };
  if (sameContent(first)) return { destPath: first, status: "alreadyThere" };

  const [stem, ext] = splitStemAndExt(fileName);
  for (let n = 1; n < 10000; n++) {
    const candidate = path.join(targetDir, `${stem} (${n})${ext}`);
    if (!isTaken(candidate)) return { destPath: candidate, status: "renamed" };
    if (sameContent(candidate)) return { destPath: candidate, status: "alreadyThere" };
  }
  return { destPath: first, status: "alreadyThere" };
}

export function generateDryRunPlan(targetFolders) {
  const scanned = scanDirectories(targetFolders, 1, true);
  const grouped = new Map();
  const reserved = new Set();
  let alreadyThere = 0;
  let renamed = 0;

  for (const file of scanned) {
    const rule = classifyExtension(file.extension);
    if (!rule) continue;

    const rootDir = expandUserPath(file.parentFolder);
    const relFolder = computeSubfolder(rule, file.extension, file.modifiedAt);
    const resolved = resolveDestination(
      path.join(rootDir, relFolder),
      file.fileName,
      file.path,
      file.sizeBytes,
      reserved
    );
    if (resolved.status === "alreadyThere") alreadyThere += 1;
    else reserved.add(resolved.destPath.toLowerCase());
    if (resolved.status === "renamed") renamed += 1;

    if (!grouped.has(rule.key)) grouped.set(rule.key, { rule, items: [] });
    grouped.get(rule.key).items.push({
      id: crypto.randomUUID(),
      fileName: file.fileName,
      extension: file.extension,
      category: rule.key,
      categoryLabel: rule.label,
      sourcePath: file.path,
      destinationPath: resolved.destPath,
      destinationFolder: path.join(path.basename(rootDir), relFolder).replace(/\\/g, " › "),
      newFileName: path.basename(resolved.destPath),
      sizeBytes: file.sizeBytes,
      modifiedAt: file.modifiedAt,
      status: resolved.status,
      parentFolder: file.parentFolder,
    });
  }

  const order = [...CATEGORY_RULES.map((r) => r.key), OTHER_CATEGORY.key];
  const categories = [];
  for (const key of order) {
    const entry = grouped.get(key);
    if (!entry) continue;
    const movable = entry.items.filter((i) => i.status !== "alreadyThere");
    categories.push({
      category: key,
      categoryLabel: entry.rule.label,
      icon: entry.rule.icon,
      fileCount: movable.length,
      totalBytes: movable.reduce((s, i) => s + i.sizeBytes, 0),
      items: entry.items,
    });
  }

  const allMovable = categories.flatMap((c) => c.items).filter((i) => i.status !== "alreadyThere");
  return {
    generatedAt: Math.floor(Date.now() / 1000),
    scannedFolders: targetFolders,
    totalFiles: allMovable.length,
    totalBytes: allMovable.reduce((s, i) => s + i.sizeBytes, 0),
    alreadyThere,
    renamed,
    categories,
  };
}

/** Moves files one by one. A file that can't be moved (e.g. open in another app) is skipped, not fatal. */
export function executeOrganizePlan(items) {
  const batchId = `batch_${crypto.randomUUID().slice(0, 8)}`;
  const timestamp = Math.floor(Date.now() / 1000);
  let totalBytesOrganized = 0;
  const failed = [];
  const journalEntries = [];

  for (const item of items || []) {
    if (item.status === "alreadyThere") continue;
    const src = item.sourcePath;
    const dst = item.destinationPath;
    if (isExcludedPath(src) || isExcludedPath(dst) || !fs.existsSync(src)) continue;
    if (fs.existsSync(dst)) {
      failed.push({ fileName: item.fileName, reason: "A file with that name appeared in the folder" });
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.renameSync(src, dst);
    } catch (err) {
      failed.push({
        fileName: item.fileName,
        reason: err && err.code === "EBUSY" ? "File is open in another app" : "Could not be moved",
      });
      continue;
    }
    totalBytesOrganized += Number(item.sizeBytes || 0);
    journalEntries.push({
      batchId,
      operationType: "ORGANIZE_MOVE",
      sourcePath: src,
      destinationPath: dst,
      fileHash: "",
      sizeBytes: Number(item.sizeBytes || 0),
      timestamp,
    });
  }

  // Always record what actually moved, so every move can be undone.
  recordLedgerBatch(journalEntries);

  return {
    batchId,
    movedCount: journalEntries.length,
    failed,
    totalBytesOrganized,
    timestamp,
  };
}

// ---------------------------------------------------------------------------
// 7. Clean Up (leftover / clutter finder)
// ---------------------------------------------------------------------------
const CLEANUP_GROUPS = {
  unfinished: "Unfinished downloads & temp files",
  duplicates: "Duplicate copies",
  installers: "Old installers",
  screenshots: "Old screenshots",
  large: "Big files you haven't opened in a while",
};

function isScreenshotFilename(fileName, ext) {
  if (!["png", "jpg", "jpeg", "webp", "heic", "bmp"].includes(ext)) return false;
  const lower = fileName.toLowerCase();
  return (
    lower.includes("screenshot") ||
    lower.startsWith("screen shot") ||
    lower.startsWith("snip_") ||
    lower.startsWith("capture_")
  );
}

function daysText(days) {
  return days === 1 ? "1 day" : `${days} days`;
}

export function runTriageScan(targetFolders) {
  const now = Math.floor(Date.now() / 1000);
  const files = scanDirectories(targetFolders, 3, false);

  // Duplicates: same size → same quick fingerprint → confirmed by full-content hash.
  const bySize = new Map();
  files.forEach((f, idx) => {
    if (f.sizeBytes > 0) {
      if (!bySize.has(f.sizeBytes)) bySize.set(f.sizeBytes, []);
      bySize.get(f.sizeBytes).push(idx);
    }
  });

  const duplicateOf = new Map(); // idx -> original path
  for (const [size, indices] of bySize.entries()) {
    if (indices.length < 2) continue;
    const byQuick = new Map();
    for (const idx of indices) {
      try {
        const q = computeQuickHash(files[idx].path, size);
        if (!byQuick.has(q)) byQuick.set(q, []);
        byQuick.get(q).push(idx);
      } catch {
        // unreadable file — skip
      }
    }
    for (const group of byQuick.values()) {
      if (group.length < 2) continue;
      const byFull = new Map();
      for (const idx of group) {
        try {
          const h = computeFullHash(files[idx].path);
          if (byFull.has(h)) duplicateOf.set(idx, byFull.get(h));
          else byFull.set(h, files[idx].path);
        } catch {
          // unreadable file — skip
        }
      }
    }
  }

  const flagged = [];
  files.forEach((file, idx) => {
    const lastTouch = Math.max(file.accessedAt, file.modifiedAt);
    const ageSeconds = Math.max(0, now - lastTouch);
    const ageHours = Math.floor(ageSeconds / 3600);
    const ageDays = Math.floor(ageSeconds / 86400);
    const ext = file.extension;

    let group = null;
    let reason = "";
    let duplicateOfPath = null;

    if (["crdownload", "part", "partial", "tmp"].includes(ext) && ageHours >= 48) {
      group = "unfinished";
      reason = `Download never finished — ${daysText(Math.max(2, ageDays))} old`;
    } else if (duplicateOf.has(idx)) {
      group = "duplicates";
      duplicateOfPath = duplicateOf.get(idx);
      reason = `Exact copy of "${path.basename(duplicateOfPath)}"`;
    } else if (["exe", "msi", "dmg", "pkg", "iso"].includes(ext) && ageDays >= 14) {
      group = "installers";
      reason = `Installer — not opened in ${daysText(ageDays)}`;
    } else if (isScreenshotFilename(file.fileName, ext) && ageDays >= 30) {
      group = "screenshots";
      reason = `Screenshot — not opened in ${daysText(ageDays)}`;
    } else if (file.sizeBytes >= 250 * 1024 * 1024 && ageDays >= 60) {
      group = "large";
      reason = `Large file — not opened in ${daysText(ageDays)}`;
    }

    if (group) {
      flagged.push({
        id: crypto.randomUUID(),
        fileName: file.fileName,
        path: file.path,
        extension: ext,
        sizeBytes: file.sizeBytes,
        lastAccessed: lastTouch,
        daysUntouched: ageDays,
        group,
        groupLabel: CLEANUP_GROUPS[group],
        reason,
        duplicateOf: duplicateOfPath,
        parentFolder: file.parentFolder,
      });
    }
  });

  flagged.sort((a, b) => b.sizeBytes - a.sizeBytes);

  return {
    generatedAt: now,
    totalFlaggedFiles: flagged.length,
    totalReclaimableBytes: flagged.reduce((s, i) => s + i.sizeBytes, 0),
    groups: Object.entries(CLEANUP_GROUPS).map(([key, label]) => ({ key, label })),
    items: flagged,
  };
}

/** Sends files to the Windows Recycle Bin (never a permanent delete). */
function sendPathsToWindowsRecycleBin(paths) {
  if (!paths || paths.length === 0) return;
  const psScript = `
    Add-Type -AssemblyName Microsoft.VisualBasic
    $json = [Console]::In.ReadToEnd() | ConvertFrom-Json
    foreach ($p in @($json)) {
      if (Test-Path -LiteralPath $p) {
        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
          $p,
          [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
          [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
        )
      }
    }
  `;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psScript], {
    input: JSON.stringify(paths),
    encoding: "utf8",
    windowsHide: true,
  });
}

export function dispatchToRecycleBin(items) {
  const batchId = `cleanup_${crypto.randomUUID().slice(0, 8)}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const valid = (items || []).filter(
    (i) => i.path && !isExcludedPath(i.path) && fs.existsSync(i.path)
  );

  sendPathsToWindowsRecycleBin(valid.map((i) => i.path));

  // Only record files that are actually gone from their original location.
  const done = valid.filter((i) => !fs.existsSync(i.path));
  recordLedgerBatch(
    done.map((item) => ({
      batchId,
      operationType: "TRIAGE_TRASH",
      sourcePath: item.path,
      destinationPath: "Recycle Bin",
      fileHash: "",
      sizeBytes: Number(item.sizeBytes || 0),
      timestamp,
    }))
  );

  return {
    batchId,
    trashedCount: done.length,
    reclaimedBytes: done.reduce((s, i) => s + Number(i.sizeBytes || 0), 0),
    timestamp,
  };
}

// ---------------------------------------------------------------------------
// 8. Windows helpers
// ---------------------------------------------------------------------------
function pickWindowsFolderDialog() {
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    $f = New-Object System.Windows.Forms.FolderBrowserDialog
    $f.Description = 'Choose a folder for Sift to tidy up'
    $f.ShowNewFolderButton = $false
    if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      Write-Output $f.SelectedPath
    }
  `;
  const stdout = execFileSync("powershell.exe", ["-NoProfile", "-STA", "-Command", psScript], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  return stdout || null;
}

function revealInWindowsExplorer(targetPath) {
  const resolved = expandUserPath(targetPath);
  const args = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
    ? [resolved]
    : [`/select,${resolved}`];
  spawn("explorer.exe", args, { detached: true, stdio: "ignore" }).unref();
}

function openRecycleBin() {
  spawn("explorer.exe", ["shell:RecycleBinFolder"], { detached: true, stdio: "ignore" }).unref();
}

// ---------------------------------------------------------------------------
// 8.5 Lifecycle & Auto-Shutdown
// ---------------------------------------------------------------------------
const HEARTBEAT_TIMEOUT_MS = 12000; // 12 seconds without ping => shut down
const INITIAL_CONNECT_GRACE_MS = 30000; // 30 seconds for initial app window launch
const activeClients = new Map();
let autoExitTimer = null;
let allowAutoExit = !process.argv.includes("--keep-alive");

function resetAutoExitTimer(timeoutMs = HEARTBEAT_TIMEOUT_MS) {
  if (!allowAutoExit) return;
  if (autoExitTimer) clearTimeout(autoExitTimer);
  autoExitTimer = setTimeout(() => {
    const now = Date.now();
    for (const [id, lastSeen] of activeClients.entries()) {
      if (now - lastSeen > HEARTBEAT_TIMEOUT_MS) {
        activeClients.delete(id);
      }
    }
    if (activeClients.size === 0) {
      logHost("No active UI windows connected. Sift engine shutting down.");
      closeDatabaseAndExit();
    } else {
      resetAutoExitTimer();
    }
  }, timeoutMs);
}

function closeDatabaseAndExit(code = 0) {
  try {
    if (db) db.close();
  } catch {}
  process.exit(code);
}

// ---------------------------------------------------------------------------
// 9. Command router & desktop window host
// ---------------------------------------------------------------------------
async function handleIpcCommand(command, payload) {
  const folders = payload.folders || ["~/Downloads", "~/Desktop"];
  switch (command) {
    case "heartbeat": {
      const cid = payload.clientId || "default";
      activeClients.set(cid, Date.now());
      resetAutoExitTimer();
      return { ok: true, activeClients: activeClients.size };
    }
    case "shutdown": {
      const cid = payload.clientId || "default";
      activeClients.delete(cid);
      if (activeClients.size === 0) {
        logHost("App window closed. Terminating Sift engine.");
        setTimeout(() => closeDatabaseAndExit(), 300);
      }
      return { ok: true, activeClients: activeClients.size };
    }
    case "simulate_organize":
      return generateDryRunPlan(folders);
    case "execute_organize":
      return executeOrganizePlan(payload.items || []);
    case "scan_triage":
      return runTriageScan(folders);
    case "trash_triage_items":
      return dispatchToRecycleBin(payload.items || []);
    case "get_batch_history":
      return listLedgerBatches();
    case "revert_batch":
      return revertLedgerBatch(payload.batchId);
    case "pick_folder_dialog":
      return pickWindowsFolderDialog();
    case "reveal_in_explorer":
      revealInWindowsExplorer(payload.path);
      return null;
    case "open_recycle_bin":
      openRecycleBin();
      return null;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

const MIME_MAP = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function openAppWindow(appUrl) {
  const browserCandidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  ].filter(Boolean);

  const browserExe = browserCandidates.find((p) => fs.existsSync(p));

  if (browserExe) {
    try {
      const child = spawn(
        browserExe,
        [
          `--app=${appUrl}`,
          "--window-size=1200,820",
          "--no-first-run",
        ],
        { detached: true, stdio: "ignore" }
      );
      child.unref();
      return;
    } catch (e) {
      logHost("Failed to launch browser directly:", e);
    }
  }

  try {
    spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", `Start-Process '${appUrl}'`], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } catch (e) {
    logHost("Failed to launch fallback browser:", e);
  }
}

export function startNativeDesktopHost(port = 14205, launchWindow = true) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");

      if (req.method === "POST" && url.pathname.startsWith("/api/ipc/")) {
        const command = url.pathname.replace("/api/ipc/", "");
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const bodyStr = Buffer.concat(chunks).toString("utf8");
        const result = await handleIpcCommand(command, bodyStr ? JSON.parse(bodyStr) : {});
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result ?? null));
        return;
      }

      const relPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = path.join(UI_DIR, path.normalize(relPath).replace(/^([/\\])+/, ""));
      if (!filePath.startsWith(UI_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME_MAP[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(err instanceof Error ? err.message : String(err));
    }
  });

  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      console.log(`Sift server is already running on http://127.0.0.1:${port}`);
      if (launchWindow) {
        openAppWindow(`http://127.0.0.1:${port}`);
      }
      setTimeout(() => process.exit(0), 1000);
    } else {
      console.error("Server error:", err);
    }
  });

  server.listen(port, "127.0.0.1", () => {
    const appUrl = `http://127.0.0.1:${port}`;
    logHost(`Sift running at ${appUrl}, launchWindow=${launchWindow}`);
    console.log(`Sift running at ${appUrl}`);
    resetAutoExitTimer(INITIAL_CONNECT_GRACE_MS);
    if (launchWindow) {
      openAppWindow(appUrl);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  if (process.argv.includes("--headless-check")) {
    const t0 = Date.now();
    const plan = generateDryRunPlan(["~/Downloads", "~/Desktop"]);
    const t1 = Date.now();
    const triage = runTriageScan(["~/Downloads", "~/Desktop"]);
    const t2 = Date.now();
    const unsortedLeft = plan.categories.length === 0 ? 0 : null;
    console.log(
      JSON.stringify(
        {
          tidyUpFiles: plan.totalFiles,
          tidyUpMs: t1 - t0,
          categories: plan.categories.map((c) => `${c.categoryLabel}: ${c.fileCount}`),
          otherFileTypes: [
            ...new Set(
              (plan.categories.find((c) => c.category === "Other")?.items || []).map(
                (i) => i.extension || "(none)"
              )
            ),
          ],
          alreadyThere: plan.alreadyThere,
          cleanUpFiles: triage.totalFlaggedFiles,
          cleanUpBytes: triage.totalReclaimableBytes,
          cleanUpMs: t2 - t1,
          cleanUpGroups: Object.fromEntries(
            Object.keys(CLEANUP_GROUPS).map((g) => [g, triage.items.filter((i) => i.group === g).length])
          ),
          unsortedLeft,
        },
        null,
        2
      )
    );
    process.exit(0);
  } else {
    const launch = !process.argv.includes("--no-window");
    startNativeDesktopHost(14205, launch);
  }
}
