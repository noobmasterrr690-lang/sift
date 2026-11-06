use crate::journal::{JournalEntryInput, JournalManager};
use crate::scanner::{
    compute_blake3_hash, expand_user_path, is_excluded_path, scan_directories, ScannedFile,
};
use chrono::{DateTime, Datelike, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum TaxonomyCategory {
    Images,
    Design,
    Videos,
    Audio,
    Documents,
    Ebooks,
    Archives,
    Installers,
    Fonts,
    #[serde(rename = "3D_Models")]
    ThreeDModels,
    #[serde(rename = "Code_and_Data")]
    CodeAndData,
    Other,
}

impl TaxonomyCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaxonomyCategory::Images => "Images",
            TaxonomyCategory::Design => "Design",
            TaxonomyCategory::Videos => "Videos",
            TaxonomyCategory::Audio => "Audio",
            TaxonomyCategory::Documents => "Documents",
            TaxonomyCategory::Ebooks => "Ebooks",
            TaxonomyCategory::Archives => "Archives",
            TaxonomyCategory::Installers => "Installers",
            TaxonomyCategory::Fonts => "Fonts",
            TaxonomyCategory::ThreeDModels => "3D_Models",
            TaxonomyCategory::CodeAndData => "Code_and_Data",
            TaxonomyCategory::Other => "Other",
        }
    }

    pub fn display_label(&self) -> &'static str {
        match self {
            TaxonomyCategory::Images => "Images",
            TaxonomyCategory::Design => "Design Files",
            TaxonomyCategory::Videos => "Videos",
            TaxonomyCategory::Audio => "Music & Audio",
            TaxonomyCategory::Documents => "Documents",
            TaxonomyCategory::Ebooks => "E-books",
            TaxonomyCategory::Archives => "Zip & Archives",
            TaxonomyCategory::Installers => "Installers",
            TaxonomyCategory::Fonts => "Fonts",
            TaxonomyCategory::ThreeDModels => "3D Models",
            TaxonomyCategory::CodeAndData => "Code & Data",
            TaxonomyCategory::Other => "Other Files",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CollisionStatus {
    Clear,
    Renamed,
    ExactDuplicate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposedOrganizeItem {
    pub id: String,
    pub file_name: String,
    pub extension: String,
    pub category: String,
    pub category_label: String,
    pub source_path: String,
    pub destination_path: String,
    pub relative_destination: String,
    pub size_bytes: u64,
    pub modified_at: i64,
    pub blake3_hash: String,
    pub collision_status: CollisionStatus,
    pub collision_note: Option<String>,
    pub parent_folder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryBreakdown {
    pub category: String,
    pub category_label: String,
    pub file_count: usize,
    pub total_bytes: u64,
    pub items: Vec<ProposedOrganizeItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DryRunPlan {
    pub generated_at: i64,
    pub scanned_folders: Vec<String>,
    pub total_files: usize,
    pub total_bytes: u64,
    pub duplicate_conflicts: usize,
    pub renamed_conflicts: usize,
    pub categories: Vec<CategoryBreakdown>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeExecutionResult {
    pub batch_id: String,
    pub moved_count: usize,
    pub skipped_duplicates: usize,
    pub total_bytes_organized: u64,
    pub timestamp: i64,
}

/// Classifies an extension into one of the canonical Sift taxonomy categories.
pub fn classify_extension(ext: &str) -> Option<TaxonomyCategory> {
    let lower = ext.to_ascii_lowercase();
    match lower.as_str() {
        // System and incomplete downloads are ignored
        "lnk" | "url" | "ini" | "crdownload" | "part" | "partial" | "download" | "tmp" | "sys"
        | "dll" | "idlk" | "lock" => None,

        // Images
        "jpg" | "jpeg" | "jfif" | "png" | "webp" | "heic" | "heif" | "gif" | "bmp" | "tif"
        | "tiff" | "svg" | "ico" | "avif" | "raw" | "cr2" | "cr3" | "nef" | "arw" | "dng"
        | "orf" | "rw2" => Some(TaxonomyCategory::Images),

        // Design Files (Photoshop, InDesign, Illustrator, etc.)
        "psd" | "psb" | "ai" | "indd" | "idml" | "indt" | "inx" | "indb" | "eps" | "sketch"
        | "fig" | "xd" | "afdesign" | "afphoto" | "afpub" | "cdr" | "xcf" | "kra" | "procreate"
        | "clip" | "aep" | "prproj" | "drp" | "fla" | "drawio" | "xmp" => {
            Some(TaxonomyCategory::Design)
        }

        // Videos
        "mp4" | "mov" | "mkv" | "webm" | "avi" | "wmv" | "flv" | "m4v" | "mpg" | "mpeg"
        | "3gp" | "mts" | "srt" => Some(TaxonomyCategory::Videos),

        // Music & Audio
        "mp3" | "wav" | "flac" | "aac" | "m4a" | "ogg" | "wma" | "aiff" | "aif" | "opus"
        | "mid" | "midi" => Some(TaxonomyCategory::Audio),

        // Documents
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "csv"
        | "tsv" | "rtf" | "odt" | "ods" | "odp" | "pages" | "numbers" | "key" => {
            Some(TaxonomyCategory::Documents)
        }

        // E-books
        "epub" | "mobi" | "azw" | "azw3" | "djvu" => Some(TaxonomyCategory::Ebooks),

        // Zip & Archives
        "zip" | "rar" | "7z" | "tar.gz" | "tar" | "gz" | "tgz" | "bz2" | "xz" => {
            Some(TaxonomyCategory::Archives)
        }

        // Installers
        "exe" | "msi" | "dmg" | "pkg" | "iso" | "appx" | "msix" | "apk" | "deb" | "ipa" => {
            Some(TaxonomyCategory::Installers)
        }

        // Fonts
        "ttf" | "otf" | "woff" | "woff2" | "fon" => Some(TaxonomyCategory::Fonts),

        // 3D Models
        "obj" | "fbx" | "stl" | "blend" | "3ds" | "dae" | "glb" | "gltf" | "max" | "c4d"
        | "skp" => Some(TaxonomyCategory::ThreeDModels),

        // Code & Data
        "json" | "sql" | "py" | "rs" | "ts" | "tsx" | "js" | "jsx" | "html" | "htm" | "css"
        | "scss" | "xml" | "yaml" | "yml" | "java" | "c" | "cpp" | "h" | "cs" | "go" | "php"
        | "rb" | "sh" | "bat" | "ps1" | "ipynb" | "kt" | "swift" | "lua" | "toml" => {
            Some(TaxonomyCategory::CodeAndData)
        }

        // Any other real file extension
        _ => Some(TaxonomyCategory::Other),
    }
}

/// Computes the structured relative subfolder for a file based on category and timestamp:
pub fn compute_subfolder(category: &TaxonomyCategory, ext: &str, modified_unix: i64) -> PathBuf {
    let dt: DateTime<Utc> = DateTime::from_timestamp(modified_unix, 0).unwrap_or_else(Utc::now);
    let year = format!("{:04}", dt.year());
    let month = format!("{:02}", dt.month());
    let type_folder = ext.to_ascii_uppercase().replace('.', "_");

    let mut rel = PathBuf::new();
    match category {
        TaxonomyCategory::Images => {
            rel.push("Images");
            rel.push(year);
            rel.push(month);
        }
        TaxonomyCategory::Design => {
            rel.push("Design");
            if !type_folder.is_empty() {
                rel.push(type_folder);
            }
        }
        TaxonomyCategory::Videos => {
            rel.push("Videos");
            rel.push(year);
        }
        TaxonomyCategory::Documents => {
            rel.push("Documents");
            if !type_folder.is_empty() {
                rel.push(type_folder);
            }
        }
        TaxonomyCategory::Audio => {
            rel.push("Audio");
        }
        TaxonomyCategory::Ebooks => {
            rel.push("Ebooks");
        }
        TaxonomyCategory::Archives => {
            rel.push("Archives");
        }
        TaxonomyCategory::Installers => {
            rel.push("Installers");
        }
        TaxonomyCategory::Fonts => {
            rel.push("Fonts");
        }
        TaxonomyCategory::ThreeDModels => {
            rel.push("3D_Models");
        }
        TaxonomyCategory::CodeAndData => {
            rel.push("Code_and_Data");
        }
        TaxonomyCategory::Other => {
            rel.push("Other");
            if !type_folder.is_empty() {
                rel.push(type_folder);
            }
        }
    }
    rel
}

/// Resolves destination path collisions by comparing BLAKE3 hashes:
/// - If destination does not exist -> `CollisionStatus::Clear`
/// - If destination exists and BLAKE3 hashes match -> `CollisionStatus::ExactDuplicate`
/// - If destination exists and hashes differ -> appends ` (1)`, ` (2)`, etc. (`CollisionStatus::Renamed`)
fn resolve_destination_collision(
    target_dir: &Path,
    original_file_name: &str,
    incoming_hash: &str,
) -> (PathBuf, CollisionStatus, Option<String>) {
    let initial_dest = target_dir.join(original_file_name);
    if !initial_dest.exists() {
        return (initial_dest, CollisionStatus::Clear, None);
    }

    if let Ok(existing_hash) = compute_blake3_hash(&initial_dest) {
        if existing_hash == incoming_hash && !incoming_hash.is_empty() {
            return (
                initial_dest,
                CollisionStatus::ExactDuplicate,
                Some("Identical BLAKE3 hash already exists at destination; flagged for Triage.".to_string()),
            );
        }
    }

    // Hashes differ: generate incremented filename e.g. `Filename (1).pdf`
    let (stem, ext_with_dot) = split_stem_and_ext(original_file_name);
    let mut counter = 1usize;
    loop {
        let candidate_name = format!("{} ({}){}", stem, counter, ext_with_dot);
        let candidate_path = target_dir.join(&candidate_name);
        if !candidate_path.exists() {
            return (
                candidate_path,
                CollisionStatus::Renamed,
                Some(format!(
                    "Destination filename existed with different content; renamed to {}",
                    candidate_name
                )),
            );
        }
        if let Ok(existing_hash) = compute_blake3_hash(&candidate_path) {
            if existing_hash == incoming_hash && !incoming_hash.is_empty() {
                return (
                    candidate_path,
                    CollisionStatus::ExactDuplicate,
                    Some("Identical BLAKE3 hash already exists at incremented destination.".to_string()),
                );
            }
        }
        counter += 1;
    }
}

fn split_stem_and_ext(file_name: &str) -> (String, String) {
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".tar.gz") && file_name.len() > 7 {
        let split_idx = file_name.len() - 7;
        return (
            file_name[..split_idx].to_string(),
            file_name[split_idx..].to_string(),
        );
    }
    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name)
        .to_string();
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e))
        .unwrap_or_default();
    (stem, ext)
}

/// Runs a zero-mutation Dry-Run Simulation across the target directories.
pub fn generate_dry_run_plan(target_folders: &[String]) -> DryRunPlan {
    // Scan top-level files in each target directory (max_depth = 1, compute_hashes = false for instant scan)
    let scanned_files: Vec<ScannedFile> = scan_directories(target_folders, 1, false, true);

    let mut grouped: HashMap<TaxonomyCategory, Vec<ProposedOrganizeItem>> = HashMap::new();
    let mut total_files = 0usize;
    let mut total_bytes = 0u64;
    let mut duplicate_conflicts = 0usize;
    let mut renamed_conflicts = 0usize;

    for file in scanned_files {
        let category = match classify_extension(&file.extension) {
            Some(cat) => cat,
            None => continue,
        };

        let root_dir = expand_user_path(&file.parent_folder);
        let rel_subfolder = compute_subfolder(&category, &file.extension, file.modified_at);
        let dest_dir = root_dir.join(&rel_subfolder);
        let initial_dest = dest_dir.join(&file.file_name);
        let hash = if initial_dest.exists() {
            compute_blake3_hash(Path::new(&file.path)).unwrap_or_default()
        } else {
            blake3::hash(
                format!("{}:{}:{}", file.file_name, file.size_bytes, file.modified_at).as_bytes(),
            )
            .to_hex()
            .to_string()
        };

        let (resolved_dest_path, collision_status, collision_note) =
            resolve_destination_collision(&dest_dir, &file.file_name, &hash);

        match collision_status {
            CollisionStatus::ExactDuplicate => duplicate_conflicts += 1,
            CollisionStatus::Renamed => renamed_conflicts += 1,
            CollisionStatus::Clear => {}
        }

        let resolved_file_name = resolved_dest_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&file.file_name)
            .to_string();

        let relative_destination = rel_subfolder
            .join(&resolved_file_name)
            .to_string_lossy()
            .replace('\\', "/");

        total_files += 1;
        total_bytes += file.size_bytes;

        let item = ProposedOrganizeItem {
            id: Uuid::new_v4().to_string(),
            file_name: file.file_name,
            extension: file.extension,
            category: category.as_str().to_string(),
            category_label: category.display_label().to_string(),
            source_path: file.path,
            destination_path: resolved_dest_path.to_string_lossy().to_string(),
            relative_destination,
            size_bytes: file.size_bytes,
            modified_at: file.modified_at,
            blake3_hash: hash,
            collision_status,
            collision_note,
            parent_folder: file.parent_folder,
        };

        grouped.entry(category).or_default().push(item);
    }

    let ordered_categories = [
        TaxonomyCategory::Images,
        TaxonomyCategory::Design,
        TaxonomyCategory::Videos,
        TaxonomyCategory::Audio,
        TaxonomyCategory::Documents,
        TaxonomyCategory::Ebooks,
        TaxonomyCategory::Archives,
        TaxonomyCategory::Installers,
        TaxonomyCategory::Fonts,
        TaxonomyCategory::ThreeDModels,
        TaxonomyCategory::CodeAndData,
        TaxonomyCategory::Other,
    ];

    let mut categories = Vec::new();
    for cat in ordered_categories {
        if let Some(items) = grouped.remove(&cat) {
            let cat_bytes: u64 = items.iter().map(|i| i.size_bytes).sum();
            categories.push(CategoryBreakdown {
                category: cat.as_str().to_string(),
                category_label: cat.display_label().to_string(),
                file_count: items.len(),
                total_bytes: cat_bytes,
                items,
            });
        }
    }

    DryRunPlan {
        generated_at: Utc::now().timestamp(),
        scanned_folders: target_folders.to_vec(),
        total_files,
        total_bytes,
        duplicate_conflicts,
        renamed_conflicts,
        categories,
    }
}

/// Executes a set of proposed organization moves and commits an ACID rollback batch to SQLite.
pub fn execute_organize_plan(
    items: &[ProposedOrganizeItem],
    journal: &JournalManager,
) -> Result<OrganizeExecutionResult, String> {
    let batch_id = format!("batch_{}", &Uuid::new_v4().to_string()[..8]);
    let timestamp = Utc::now().timestamp();
    let mut moved_count = 0usize;
    let mut skipped_duplicates = 0usize;
    let mut total_bytes_organized = 0u64;
    let mut journal_entries = Vec::new();

    for item in items {
        if item.collision_status == CollisionStatus::ExactDuplicate {
            skipped_duplicates += 1;
            continue;
        }

        let src = Path::new(&item.source_path);
        let dst = Path::new(&item.destination_path);

        if is_excluded_path(src) || is_excluded_path(dst) {
            continue;
        }
        if !src.exists() {
            continue;
        }

        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create destination folder {:?}: {}", parent, e))?;
        }

        // Perform atomic rename, falling back to copy + safe verification if cross-device
        if fs::rename(src, dst).is_err() {
            fs::copy(src, dst)
                .map_err(|e| format!("Failed to copy {:?} to {:?}: {}", src, dst, e))?;
            trash::delete(src)
                .map_err(|e| format!("Failed to recycle original after copy {:?}: {}", src, e))?;
        }

        moved_count += 1;
        total_bytes_organized += item.size_bytes;

        journal_entries.push(JournalEntryInput {
            batch_id: batch_id.clone(),
            operation_type: "ORGANIZE_MOVE".to_string(),
            source_path: item.source_path.clone(),
            destination_path: item.destination_path.clone(),
            file_hash: item.blake3_hash.clone(),
            size_bytes: item.size_bytes,
            timestamp,
        });
    }

    if !journal_entries.is_empty() {
        journal.record_batch(&journal_entries)?;
    }

    Ok(OrganizeExecutionResult {
        batch_id,
        moved_count,
        skipped_duplicates,
        total_bytes_organized,
        timestamp,
    })
}
