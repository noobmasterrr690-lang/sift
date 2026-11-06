use crate::journal::{JournalEntryInput, JournalManager};
use crate::scanner::{compute_blake3_hash, is_excluded_path, scan_directories, ScannedFile};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TriageCategory {
    #[serde(rename = "Old Installers")]
    OldInstallers,
    #[serde(rename = "Exact Duplicates")]
    ExactDuplicates,
    #[serde(rename = "Untouched Screenshots")]
    UntouchedScreenshots,
    #[serde(rename = "Temp & Incomplete")]
    TempAndIncomplete,
    #[serde(rename = "Large Stale Files")]
    LargeStaleFiles,
}

impl TriageCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            TriageCategory::OldInstallers => "Old Installers",
            TriageCategory::ExactDuplicates => "Exact Duplicates",
            TriageCategory::UntouchedScreenshots => "Untouched Screenshots",
            TriageCategory::TempAndIncomplete => "Temp & Incomplete",
            TriageCategory::LargeStaleFiles => "Large Stale Files",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriageItem {
    pub id: String,
    pub file_name: String,
    pub path: String,
    pub extension: String,
    pub size_bytes: u64,
    pub last_accessed: i64,
    pub modified_at: i64,
    pub days_untouched: i64,
    pub wcs_score: u8,
    pub category: String,
    pub reason: String,
    pub blake3_hash: Option<String>,
    pub duplicate_of: Option<String>,
    pub parent_folder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriageScanReport {
    pub generated_at: i64,
    pub total_flagged_files: usize,
    pub total_reclaimable_bytes: u64,
    pub items: Vec<TriageItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashDispatchResult {
    pub batch_id: String,
    pub trashed_count: usize,
    pub reclaimed_bytes: u64,
    pub timestamp: i64,
}

/// Checks if a filename matches common macOS, Windows Snipping Tool, or ShareX screenshot patterns.
fn is_screenshot_filename(file_name: &str, ext: &str) -> bool {
    let is_image_ext = matches!(ext, "png" | "jpg" | "jpeg" | "webp" | "heic" | "bmp");
    if !is_image_ext {
        return false;
    }
    let lower = file_name.to_ascii_lowercase();
    lower.starts_with("screenshot")
        || lower.starts_with("screen shot")
        || lower.starts_with("snip_")
        || lower.starts_with("capture_")
        || lower.starts_with(" clean_shot")
        || lower.starts_with("cleanshot")
        || lower.contains("screenshot")
}

/// Scans target folders and computes the Waste Confidence Score (WCS 0..=100) for every file,
/// returning all items with `WCS >= 70`.
pub fn run_triage_scan(target_folders: &[String]) -> TriageScanReport {
    let now = Utc::now().timestamp();
    let files: Vec<ScannedFile> = scan_directories(target_folders, 3, false, false);

    // Pre-group by size_bytes (> 0) to detect potential exact duplicates efficiently
    let mut size_groups: HashMap<u64, Vec<usize>> = HashMap::new();
    for (idx, file) in files.iter().enumerate() {
        if file.size_bytes > 0 {
            size_groups.entry(file.size_bytes).or_default().push(idx);
        }
    }

    // Map from file index -> (canonical original path, blake3_hash)
    let mut duplicate_map: HashMap<usize, (String, String)> = HashMap::new();
    for (_size, indices) in size_groups {
        if indices.len() < 2 {
            continue;
        }
        let mut seen_hashes: HashMap<String, String> = HashMap::new();
        for idx in indices {
            let file = &files[idx];
            let hash = file
                .blake3_hash
                .clone()
                .or_else(|| compute_blake3_hash(Path::new(&file.path)).ok());
            if let Some(h) = hash {
                if let Some(original_path) = seen_hashes.get(&h) {
                    duplicate_map.insert(idx, (original_path.clone(), h));
                } else {
                    seen_hashes.insert(h, file.path.clone());
                }
            }
        }
    }

    let mut flagged_items = Vec::new();

    for (idx, file) in files.iter().enumerate() {
        let last_touch = file.accessed_at.max(file.modified_at);
        let age_seconds = (now - last_touch).max(0);
        let age_hours = age_seconds / 3600;
        let age_days = age_seconds / 86_400;
        let ext = file.extension.as_str();

        let mut matched_category: Option<(TriageCategory, u8, String, Option<String>)> = None;

        // 1. Abandoned / Temp Files (Base WCS: 95): .crdownload, .part, .tmp, .log older than 48 hours
        if matches!(ext, "crdownload" | "part" | "tmp" | "log") && age_hours >= 48 {
            let bonus = ((age_days - 2).clamp(0, 4)) as u8;
            let score = (95 + bonus).min(99);
            matched_category = Some((
                TriageCategory::TempAndIncomplete,
                score,
                format!(
                    "Abandoned .{} artifact untouched for {} days ({}h)",
                    ext,
                    age_days.max(2),
                    age_hours
                ),
                None,
            ));
        }
        // 2. Exact Duplicates (Base WCS: 90): Identical file size and BLAKE3 hash
        else if let Some((orig_path, hash)) = duplicate_map.get(&idx) {
            let orig_name = Path::new(orig_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(orig_path);
            let bonus = (age_days.clamp(0, 8)) as u8;
            let score = (90 + bonus).min(98);
            matched_category = Some((
                TriageCategory::ExactDuplicates,
                score,
                format!(
                    "Bit-for-bit BLAKE3 duplicate of \"{}\" ({}..)",
                    orig_name,
                    &hash[..10.min(hash.len())]
                ),
                Some(orig_path.clone()),
            ));
        }
        // 3. Stale Installers (Base WCS: 85): .exe, .msi, .dmg, .pkg, .iso older than 14 days
        else if matches!(ext, "exe" | "msi" | "dmg" | "pkg" | "iso") && age_days >= 14 {
            let bonus = ((age_days - 14) / 7).clamp(0, 11) as u8;
            let score = (85 + bonus).min(96);
            matched_category = Some((
                TriageCategory::OldInstallers,
                score,
                format!("Installer package untouched for {} days", age_days),
                None,
            ));
        }
        // 4. Forgotten Screenshots (Base WCS: 75): Screenshot patterns untouched for >30 days
        else if is_screenshot_filename(&file.file_name, ext) && age_days >= 30 {
            let bonus = ((age_days - 30) / 10).clamp(0, 14) as u8;
            let score = (75 + bonus).min(89);
            matched_category = Some((
                TriageCategory::UntouchedScreenshots,
                score,
                format!("Screenshot capture untouched for {} days", age_days),
                None,
            ));
        }
        // 5. Large Untouched Media (Base WCS: 70): Files >250 MB not accessed in >60 days
        else if file.size_bytes >= 250 * 1024 * 1024 && age_days >= 60 {
            let bonus = ((age_days - 60) / 14).clamp(0, 15) as u8;
            let score = (70 + bonus).min(85);
            matched_category = Some((
                TriageCategory::LargeStaleFiles,
                score,
                format!(
                    "Large media file (>250 MB) unaccessed for {} days",
                    age_days
                ),
                None,
            ));
        }

        if let Some((category, wcs_score, reason, duplicate_of)) = matched_category {
            if wcs_score >= 70 {
                let hash = duplicate_map
                    .get(&idx)
                    .map(|(_, h)| h.clone())
                    .or_else(|| file.blake3_hash.clone());

                flagged_items.push(TriageItem {
                    id: Uuid::new_v4().to_string(),
                    file_name: file.file_name.clone(),
                    path: file.path.clone(),
                    extension: file.extension.clone(),
                    size_bytes: file.size_bytes,
                    last_accessed: last_touch,
                    modified_at: file.modified_at,
                    days_untouched: age_days,
                    wcs_score,
                    category: category.as_str().to_string(),
                    reason,
                    blake3_hash: hash,
                    duplicate_of,
                    parent_folder: file.parent_folder.clone(),
                });
            }
        }
    }

    // Sort highest WCS score first, then largest size first
    flagged_items.sort_by(|a, b| {
        b.wcs_score
            .cmp(&a.wcs_score)
            .then_with(|| b.size_bytes.cmp(&a.size_bytes))
    });

    let total_reclaimable_bytes = flagged_items.iter().map(|i| i.size_bytes).sum();

    TriageScanReport {
        generated_at: now,
        total_flagged_files: flagged_items.len(),
        total_reclaimable_bytes,
        items: flagged_items,
    }
}

/// Safely dispatches selected clutter items to the native OS Recycle Bin / Trash via the `trash` crate.
/// NEVER invokes `fs::remove_file`. Records every action in `sift_journal.db`.
pub fn dispatch_to_recycle_bin(
    items: &[TriageItem],
    journal: &JournalManager,
) -> Result<TrashDispatchResult, String> {
    let batch_id = format!("triage_{}", &Uuid::new_v4().to_string()[..8]);
    let timestamp = Utc::now().timestamp();
    let mut trashed_count = 0usize;
    let mut reclaimed_bytes = 0u64;
    let mut journal_entries = Vec::new();

    for item in items {
        let path = Path::new(&item.path);
        if is_excluded_path(path) || !path.exists() {
            continue;
        }

        let hash = item
            .blake3_hash
            .clone()
            .or_else(|| compute_blake3_hash(path).ok())
            .unwrap_or_default();

        // Dispatch strictly to OS Recycle Bin / Trash
        trash::delete(path)
            .map_err(|e| format!("Failed to move {:?} to OS Recycle Bin: {}", path, e))?;

        trashed_count += 1;
        reclaimed_bytes += item.size_bytes;

        journal_entries.push(JournalEntryInput {
            batch_id: batch_id.clone(),
            operation_type: "TRIAGE_TRASH".to_string(),
            source_path: item.path.clone(),
            destination_path: "OS://RecycleBin".to_string(),
            file_hash: hash,
            size_bytes: item.size_bytes,
            timestamp,
        });
    }

    if !journal_entries.is_empty() {
        journal.record_batch(&journal_entries)?;
    }

    Ok(TrashDispatchResult {
        batch_id,
        trashed_count,
        reclaimed_bytes,
        timestamp,
    })
}
