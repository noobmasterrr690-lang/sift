use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::{DirEntry, WalkDir};

/// Hard-coded system directory safeguard list.
/// Sift NEVER traverses, organizes, or touches any path containing these segments.
pub const EXCLUDED_DIRS: &[&str] = &[
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
    "target",
    "dist",
];

/// Folders created by Sift itself so re-scanning a root folder does not endlessly re-nest organized files.
pub const SIFT_MANAGED_FOLDERS: &[&str] = &[
    "Images",
    "Design",
    "Videos",
    "Audio",
    "Documents",
    "Ebooks",
    "Archives",
    "Installers",
    "Fonts",
    "3D_Models",
    "Code_and_Data",
    "Other",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFile {
    pub path: String,
    pub file_name: String,
    pub extension: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub created_at: i64,
    pub modified_at: i64,
    pub accessed_at: i64,
    pub blake3_hash: Option<String>,
    pub parent_folder: String,
}

/// Expands `~/Downloads`, `~/Desktop`, or `~/...` into canonical OS paths.
pub fn expand_user_path(raw: &str) -> PathBuf {
    let trimmed = raw.trim();
    if trimmed == "~/Downloads" || trimmed == "~\\Downloads" {
        if let Some(dl) = dirs::download_dir() {
            return dl;
        }
    }
    if trimmed == "~/Desktop" || trimmed == "~\\Desktop" {
        if let Some(dt) = dirs::desktop_dir() {
            return dt;
        }
    }
    if let Some(stripped) = trimmed.strip_prefix("~/").or_else(|| trimmed.strip_prefix("~\\")) {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    if trimmed == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }
    PathBuf::from(trimmed)
}

/// Checks whether a path contains any protected system or developer directory segment.
pub fn is_excluded_path(path: &Path) -> bool {
    for component in path.components() {
        if let std::path::Component::Normal(os_str) = component {
            if let Some(segment) = os_str.to_str() {
                if EXCLUDED_DIRS
                    .iter()
                    .any(|excluded| segment.eq_ignore_ascii_case(excluded))
                {
                    return true;
                }
            }
        }
    }
    false
}

/// Checks if a directory entry is valid to traverse.
fn is_safe_entry(entry: &DirEntry, root: &Path, skip_managed_subfolders: bool) -> bool {
    let path = entry.path();
    if is_excluded_path(path) {
        return false;
    }

    if skip_managed_subfolders && path != root && entry.file_type().is_dir() {
        if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
            if SIFT_MANAGED_FOLDERS
                .iter()
                .any(|managed| dir_name.eq_ignore_ascii_case(managed))
            {
                return false;
            }
        }
    }

    true
}

/// Computes the BLAKE3 cryptographic hash of a file using an 64 KB streaming buffer.
pub fn compute_blake3_hash(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open {:?}: {}", path, e))?;
    let mut reader = BufReader::with_capacity(64 * 1024, file);
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0u8; 64 * 1024];

    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read {:?}: {}", path, e))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hasher.finalize().to_hex().to_string())
}

/// Detects MIME type by inspecting magic file signature bytes first (`infer`),
/// falling back to extension heuristics (`mime_guess`).
pub fn detect_mime_type(path: &Path) -> String {
    if let Ok(Some(kind)) = infer::get_from_path(path) {
        return kind.mime_type().to_string();
    }
    mime_guess::from_path(path)
        .first_or_octet_stream()
        .essence_str()
        .to_string()
}

/// Extracts a normalized lowercase extension, preserving compound `.tar.gz`.
pub fn extract_extension(path: &Path) -> String {
    let file_name_lower = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if file_name_lower.ends_with(".tar.gz") {
        return "tar.gz".to_string();
    }

    path.extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default()
}

fn system_time_to_unix(time: Result<SystemTime, std::io::Error>) -> i64 {
    time.ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or_else(|| chrono::Utc::now().timestamp())
}

/// Recursively scans target directories and returns enriched file metadata.
/// `max_depth` controls traversal depth (e.g. 1 for top-level organize, 4 for deep triage).
pub fn scan_directories(
    target_folders: &[String],
    max_depth: usize,
    compute_hashes: bool,
    skip_managed_subfolders: bool,
) -> Vec<ScannedFile> {
    let mut results = Vec::new();

    for raw_folder in target_folders {
        let root_path = expand_user_path(raw_folder);
        if !root_path.exists() || is_excluded_path(&root_path) {
            continue;
        }

        let walker = WalkDir::new(&root_path)
            .max_depth(max_depth)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| is_safe_entry(e, &root_path, skip_managed_subfolders));

        for entry in walker.flatten() {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            if is_excluded_path(path) {
                continue;
            }

            // Skip hidden system dotfiles like .DS_Store or desktop.ini
            let file_name = match path.file_name().and_then(|n| n.to_str()) {
                Some(name) => name.to_string(),
                None => continue,
            };
            if file_name.starts_with('.') || file_name.eq_ignore_ascii_case("desktop.ini") || file_name.eq_ignore_ascii_case("thumbs.db") {
                continue;
            }

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let size_bytes = metadata.len();
            let created_at = system_time_to_unix(metadata.created());
            let modified_at = system_time_to_unix(metadata.modified());
            let accessed_at = system_time_to_unix(metadata.accessed());
            let extension = extract_extension(path);
            let mime_type = detect_mime_type(path);

            // Compute BLAKE3 hash when requested and file size is <= 512 MB for snappy responsiveness
            let blake3_hash = if compute_hashes && size_bytes > 0 && size_bytes <= 512 * 1024 * 1024 {
                compute_blake3_hash(path).ok()
            } else {
                None
            };

            results.push(ScannedFile {
                path: path.to_string_lossy().to_string(),
                file_name,
                extension,
                mime_type,
                size_bytes,
                created_at,
                modified_at,
                accessed_at,
                blake3_hash,
                parent_folder: raw_folder.clone(),
            });
        }
    }

    results
}
