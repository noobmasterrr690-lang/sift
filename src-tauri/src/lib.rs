pub mod journal;
pub mod organizer;
pub mod scanner;
pub mod triage;
pub mod watcher;

use journal::{BatchHistoryItem, JournalManager, RevertBatchResult};
use organizer::{
    execute_organize_plan, generate_dry_run_plan, DryRunPlan, OrganizeExecutionResult,
    ProposedOrganizeItem,
};
use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::State;
use triage::{
    dispatch_to_recycle_bin, run_triage_scan, TrashDispatchResult, TriageItem, TriageScanReport,
};
use watcher::{AutomationStatus, WatcherManager};

pub struct AppState {
    pub journal: JournalManager,
    pub watcher: WatcherManager,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageImpactSummary {
    pub reclaimable_bytes: u64,
    pub reclaimable_files: usize,
    pub freed_this_month_bytes: u64,
    pub excluded_safeguards: Vec<String>,
    pub user_home_dir: String,
    pub db_ledger_path: String,
}

#[tauri::command]
fn simulate_organize(folders: Vec<String>) -> Result<DryRunPlan, String> {
    Ok(generate_dry_run_plan(&folders))
}

#[tauri::command]
fn execute_organize(
    items: Vec<ProposedOrganizeItem>,
    state: State<'_, AppState>,
) -> Result<OrganizeExecutionResult, String> {
    execute_organize_plan(&items, &state.journal)
}

#[tauri::command]
fn scan_triage(folders: Vec<String>) -> Result<TriageScanReport, String> {
    Ok(run_triage_scan(&folders))
}

#[tauri::command]
fn trash_triage_items(
    items: Vec<TriageItem>,
    state: State<'_, AppState>,
) -> Result<TrashDispatchResult, String> {
    dispatch_to_recycle_bin(&items, &state.journal)
}

#[tauri::command]
fn get_batch_history(state: State<'_, AppState>) -> Result<Vec<BatchHistoryItem>, String> {
    state.journal.list_batches()
}

#[tauri::command]
fn revert_batch(
    batch_id: String,
    state: State<'_, AppState>,
) -> Result<RevertBatchResult, String> {
    state.journal.revert_batch(&batch_id)
}

#[tauri::command]
fn get_storage_impact(
    folders: Vec<String>,
    state: State<'_, AppState>,
) -> Result<StorageImpactSummary, String> {
    let triage = run_triage_scan(&folders);
    let freed_this_month_bytes = state.journal.get_monthly_reclaimed_bytes()?;
    let excluded_safeguards = scanner::EXCLUDED_DIRS
        .iter()
        .map(|s| s.to_string())
        .collect();
    let user_home_dir = dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let db_ledger_path = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Sift")
        .join("sift_journal.db")
        .to_string_lossy()
        .to_string();

    Ok(StorageImpactSummary {
        reclaimable_bytes: triage.total_reclaimable_bytes,
        reclaimable_files: triage.total_flagged_files,
        freed_this_month_bytes,
        excluded_safeguards,
        user_home_dir,
        db_ledger_path,
    })
}

#[tauri::command]
fn get_automation_status(state: State<'_, AppState>) -> Result<AutomationStatus, String> {
    state.watcher.get_status()
}

#[tauri::command]
fn update_automation_config(
    silent_sweep_enabled: bool,
    heartbeat_interval_minutes: u32,
    file_drop_trigger_enabled: bool,
    wcs_threshold: u8,
    watched_folders: Vec<String>,
    state: State<'_, AppState>,
) -> Result<AutomationStatus, String> {
    state.watcher.update_config(
        silent_sweep_enabled,
        heartbeat_interval_minutes,
        file_drop_trigger_enabled,
        wcs_threshold,
        watched_folders,
    )
}

#[tauri::command]
fn toggle_automation_rule(
    rule_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<AutomationStatus, String> {
    state.watcher.toggle_rule(&rule_id, enabled)
}

#[tauri::command]
fn trigger_silent_sweep(state: State<'_, AppState>) -> Result<AutomationStatus, String> {
    state.watcher.trigger_heartbeat_sweep(&state.journal)
}

#[tauri::command]
fn pick_folder_dialog() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let ps_script = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select a folder for Sift to scan and organize'; $f.ShowNewFolderButton = $true; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }";
        let output = Command::new("powershell")
            .args(["-NoProfile", "-STA", "-Command", ps_script])
            .output()
            .map_err(|e| e.to_string())?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            Ok(None)
        } else {
            Ok(Some(path))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    let expanded = scanner::expand_user_path(&path);
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(format!("/select,{}", expanded.to_string_lossy()))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let journal = JournalManager::new().expect("Failed to initialize Sift SQLite ledger");
    let default_folders = vec!["~/Downloads".to_string(), "~/Desktop".to_string()];
    let watcher = WatcherManager::new(default_folders);

    tauri::Builder::default()
        .manage(AppState { journal, watcher })
        .invoke_handler(tauri::generate_handler![
            simulate_organize,
            execute_organize,
            scan_triage,
            trash_triage_items,
            get_batch_history,
            revert_batch,
            get_storage_impact,
            get_automation_status,
            update_automation_config,
            toggle_automation_rule,
            trigger_silent_sweep,
            pick_folder_dialog,
            reveal_in_explorer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sift Tauri application");
}
