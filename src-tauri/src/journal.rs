use crate::scanner::is_excluded_path;
use chrono::{Datelike, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntryInput {
    pub batch_id: String,
    pub operation_type: String,
    pub source_path: String,
    pub destination_path: String,
    pub file_hash: String,
    pub size_bytes: u64,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntryRecord {
    pub id: i64,
    pub batch_id: String,
    pub operation_type: String,
    pub source_path: String,
    pub destination_path: String,
    pub file_hash: String,
    pub size_bytes: u64,
    pub timestamp: i64,
    pub reverted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchHistoryItem {
    pub batch_id: String,
    pub operation_type: String,
    pub timestamp: i64,
    pub file_count: usize,
    pub total_bytes: u64,
    pub reverted: bool,
    pub can_revert: bool,
    pub entries: Vec<JournalEntryRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevertBatchResult {
    pub batch_id: String,
    pub restored_count: usize,
    pub failed_paths: Vec<String>,
    pub timestamp: i64,
}

pub struct JournalManager {
    db_path: PathBuf,
    lock: Mutex<()>,
}

impl JournalManager {
    /// Initializes `sift_journal.db` in the user's local application data folder (or current directory fallback).
    pub fn new() -> Result<Self, String> {
        let base_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Sift");
        fs::create_dir_all(&base_dir)
            .map_err(|e| format!("Failed to create Sift data directory {:?}: {}", base_dir, e))?;

        let db_path = base_dir.join("sift_journal.db");
        let manager = Self {
            db_path,
            lock: Mutex::new(()),
        };
        manager.init_schema()?;
        Ok(manager)
    }

    fn connect(&self) -> Result<Connection, String> {
        Connection::open(&self.db_path)
            .map_err(|e| format!("Failed to open SQLite journal {:?}: {}", self.db_path, e))
    }

    fn init_schema(&self) -> Result<(), String> {
        let _guard = self.lock.lock().map_err(|e| e.to_string())?;
        let conn = self.connect()?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
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
             CREATE INDEX IF NOT EXISTS idx_sift_ledger_timestamp ON sift_ledger(timestamp DESC);",
        )
        .map_err(|e| format!("Failed to initialize SQLite schema: {}", e))?;
        Ok(())
    }

    /// Atomically records a batch of file operations inside an ACID SQLite transaction.
    pub fn record_batch(&self, entries: &[JournalEntryInput]) -> Result<(), String> {
        let _guard = self.lock.lock().map_err(|e| e.to_string())?;
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to begin SQLite transaction: {}", e))?;

        {
            let mut stmt = tx
                .prepare(
                    "INSERT INTO sift_ledger (
                        batch_id, operation_type, source_path, destination_path, file_hash, size_bytes, timestamp, reverted
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)",
                )
                .map_err(|e| format!("Failed to prepare ledger insert: {}", e))?;

            for entry in entries {
                stmt.execute(params![
                    entry.batch_id,
                    entry.operation_type,
                    entry.source_path,
                    entry.destination_path,
                    entry.file_hash,
                    entry.size_bytes as i64,
                    entry.timestamp,
                ])
                .map_err(|e| format!("Failed to insert journal entry: {}", e))?;
            }
        }

        tx.commit()
            .map_err(|e| format!("Failed to commit SQLite ledger transaction: {}", e))?;
        Ok(())
    }

    /// Lists all recorded batches grouped in reverse chronological order.
    pub fn list_batches(&self) -> Result<Vec<BatchHistoryItem>, String> {
        let _guard = self.lock.lock().map_err(|e| e.to_string())?;
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, batch_id, operation_type, source_path, destination_path, file_hash, size_bytes, timestamp, reverted
                 FROM sift_ledger
                 ORDER BY timestamp DESC, id ASC",
            )
            .map_err(|e| format!("Failed to query sift_ledger: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(JournalEntryRecord {
                    id: row.get(0)?,
                    batch_id: row.get(1)?,
                    operation_type: row.get(2)?,
                    source_path: row.get(3)?,
                    destination_path: row.get(4)?,
                    file_hash: row.get(5)?,
                    size_bytes: row.get::<_, i64>(6)?.max(0) as u64,
                    timestamp: row.get(7)?,
                    reverted: row.get::<_, i64>(8)? != 0,
                })
            })
            .map_err(|e| format!("Failed to map ledger rows: {}", e))?;

        let mut grouped: BTreeMap<String, Vec<JournalEntryRecord>> = BTreeMap::new();
        let mut batch_order: Vec<String> = Vec::new();

        for row in rows.flatten() {
            if !grouped.contains_key(&row.batch_id) {
                batch_order.push(row.batch_id.clone());
            }
            grouped.entry(row.batch_id.clone()).or_default().push(row);
        }

        let mut history = Vec::new();
        for batch_id in batch_order {
            if let Some(entries) = grouped.remove(&batch_id) {
                let first = &entries[0];
                let operation_type = first.operation_type.clone();
                let timestamp = first.timestamp;
                let file_count = entries.len();
                let total_bytes: u64 = entries.iter().map(|e| e.size_bytes).sum();
                let reverted = entries.iter().all(|e| e.reverted);
                let can_revert = !reverted && operation_type == "ORGANIZE_MOVE";

                history.push(BatchHistoryItem {
                    batch_id,
                    operation_type,
                    timestamp,
                    file_count,
                    total_bytes,
                    reverted,
                    can_revert,
                    entries,
                });
            }
        }

        Ok(history)
    }

    /// Reverses all file moves in a batch back to their exact original paths and marks the batch reverted.
    pub fn revert_batch(&self, batch_id: &str) -> Result<RevertBatchResult, String> {
        let _guard = self.lock.lock().map_err(|e| e.to_string())?;
        let mut conn = self.connect()?;

        let entries: Vec<JournalEntryRecord> = {
            let mut stmt = conn
                .prepare(
                    "SELECT id, batch_id, operation_type, source_path, destination_path, file_hash, size_bytes, timestamp, reverted
                     FROM sift_ledger
                     WHERE batch_id = ?1 AND reverted = 0
                     ORDER BY id DESC",
                )
                .map_err(|e| format!("Failed to prepare batch lookup: {}", e))?;

            let mapped = stmt
                .query_map(params![batch_id], |row| {
                    Ok(JournalEntryRecord {
                        id: row.get(0)?,
                        batch_id: row.get(1)?,
                        operation_type: row.get(2)?,
                        source_path: row.get(3)?,
                        destination_path: row.get(4)?,
                        file_hash: row.get(5)?,
                        size_bytes: row.get::<_, i64>(6)?.max(0) as u64,
                        timestamp: row.get(7)?,
                        reverted: row.get::<_, i64>(8)? != 0,
                    })
                })
                .map_err(|e| format!("Failed to fetch batch rows: {}", e))?;

            mapped.flatten().collect()
        };

        if entries.is_empty() {
            return Err(format!(
                "Batch '{}' was not found or has already been reverted.",
                batch_id
            ));
        }

        let mut restored_count = 0usize;
        let mut failed_paths = Vec::new();
        let mut restored_ids = Vec::new();

        for entry in &entries {
            if entry.operation_type != "ORGANIZE_MOVE" {
                failed_paths.push(format!(
                    "{} (OS Recycle Bin items must be restored via system Recycle Bin)",
                    entry.source_path
                ));
                continue;
            }

            let current_loc = Path::new(&entry.destination_path);
            let original_loc = Path::new(&entry.source_path);

            if is_excluded_path(current_loc) || is_excluded_path(original_loc) {
                failed_paths.push(entry.source_path.clone());
                continue;
            }

            if !current_loc.exists() {
                failed_paths.push(entry.destination_path.clone());
                continue;
            }

            if let Some(parent) = original_loc.parent() {
                if let Err(e) = fs::create_dir_all(parent) {
                    failed_paths.push(format!("{} ({})", entry.source_path, e));
                    continue;
                }
            }

            if fs::rename(current_loc, original_loc).is_err() {
                if fs::copy(current_loc, original_loc).is_ok() {
                    let _ = trash::delete(current_loc);
                    restored_count += 1;
                    restored_ids.push(entry.id);
                } else {
                    failed_paths.push(entry.source_path.clone());
                }
            } else {
                restored_count += 1;
                restored_ids.push(entry.id);
            }
        }

        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to open rollback transaction: {}", e))?;
        for id in restored_ids {
            tx.execute(
                "UPDATE sift_ledger SET reverted = 1 WHERE id = ?1",
                params![id],
            )
            .map_err(|e| format!("Failed to mark ledger row reverted: {}", e))?;
        }
        tx.commit()
            .map_err(|e| format!("Failed to commit rollback transaction: {}", e))?;

        Ok(RevertBatchResult {
            batch_id: batch_id.to_string(),
            restored_count,
            failed_paths,
            timestamp: Utc::now().timestamp(),
        })
    }

    /// Computes total bytes reclaimed via Triage Recycle Bin dispatches during the current calendar month.
    pub fn get_monthly_reclaimed_bytes(&self) -> Result<u64, String> {
        let _guard = self.lock.lock().map_err(|e| e.to_string())?;
        let conn = self.connect()?;
        let now = Utc::now();
        let start_of_month = chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
            .and_then(|d| d.and_hms_opt(0, 0, 0))
            .map(|dt| dt.and_utc().timestamp())
            .unwrap_or(0);

        let total: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(size_bytes), 0)
                 FROM sift_ledger
                 WHERE operation_type = 'TRIAGE_TRASH'
                   AND reverted = 0
                   AND timestamp >= ?1",
                params![start_of_month],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(total.max(0) as u64)
    }
}
