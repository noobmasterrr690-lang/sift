use crate::journal::JournalManager;
use crate::organizer::{execute_organize_plan, generate_dry_run_plan};
use crate::scanner::{expand_user_path, is_excluded_path};
use crate::triage::run_triage_scan;
use chrono::Utc;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationRule {
    pub id: String,
    pub name: String,
    pub description: String,
    pub trigger: String,
    pub category_scope: Vec<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationEventLog {
    pub id: String,
    pub timestamp: i64,
    pub event_type: String,
    pub summary: String,
    pub files_affected: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationStatus {
    pub silent_sweep_enabled: bool,
    pub heartbeat_interval_minutes: u32,
    pub file_drop_trigger_enabled: bool,
    pub auto_queue_high_wcs: bool,
    pub wcs_threshold: u8,
    pub watched_folders: Vec<String>,
    pub last_heartbeat_at: Option<i64>,
    pub queued_triage_count: usize,
    pub rules: Vec<AutomationRule>,
    pub recent_events: Vec<AutomationEventLog>,
}

pub struct WatcherManager {
    state: Arc<Mutex<AutomationStatus>>,
    watcher_handle: Mutex<Option<RecommendedWatcher>>,
}

impl WatcherManager {
    pub fn new(default_folders: Vec<String>) -> Self {
        let now = Utc::now().timestamp();
        let initial_rules = vec![
            AutomationRule {
                id: "rule_docs".to_string(),
                name: "Instant Document Filing".to_string(),
                description: "Route incoming PDFs, DOCX, XLSX, CSV, and Markdown files into Documents/{EXT_UPPER}/ on arrival.".to_string(),
                trigger: "On File Drop + Heartbeat".to_string(),
                category_scope: vec!["Documents".to_string()],
                enabled: true,
            },
            AutomationRule {
                id: "rule_media".to_string(),
                name: "Chronological Media Vault".to_string(),
                description: "Sort dropped photos and videos into Images/{YYYY}/{MM}/ and Videos/{YYYY}/ with BLAKE3 collision checks.".to_string(),
                trigger: "Every 15m Heartbeat".to_string(),
                category_scope: vec!["Images".to_string(), "Videos".to_string(), "Audio".to_string()],
                enabled: true,
            },
            AutomationRule {
                id: "rule_archives_code".to_string(),
                name: "Developer & Archive Quarantine".to_string(),
                description: "Consolidate .zip/.tar.gz archives into Archives/ and source/data snippets into Code_and_Data/.".to_string(),
                trigger: "Every 15m Heartbeat".to_string(),
                category_scope: vec!["Archives".to_string(), "Code_and_Data".to_string()],
                enabled: true,
            },
            AutomationRule {
                id: "rule_triage_guard".to_string(),
                name: "High-WCS Clutter Sentinel".to_string(),
                description: "Flag stale installers (.exe/.dmg >14d), abandoned .crdownload/.tmp (>48h), and exact duplicates (WCS >= 70) for human review.".to_string(),
                trigger: "Continuous Background Scan".to_string(),
                category_scope: vec!["Triage".to_string()],
                enabled: true,
            },
        ];

        let initial_events = vec![AutomationEventLog {
            id: "evt_init".to_string(),
            timestamp: now - 180,
            event_type: "HEARTBEAT_READY".to_string(),
            summary: "Filesystem notify watcher initialized with system directory exclusion safeguards.".to_string(),
            files_affected: 0,
        }];

        let status = AutomationStatus {
            silent_sweep_enabled: false,
            heartbeat_interval_minutes: 15,
            file_drop_trigger_enabled: true,
            auto_queue_high_wcs: true,
            wcs_threshold: 70,
            watched_folders: default_folders,
            last_heartbeat_at: Some(now - 180),
            queued_triage_count: 0,
            rules: initial_rules,
            recent_events: initial_events,
        };

        Self {
            state: Arc::new(Mutex::new(status)),
            watcher_handle: Mutex::new(None),
        }
    }

    pub fn get_status(&self) -> Result<AutomationStatus, String> {
        let guard = self.state.lock().map_err(|e| e.to_string())?;
        Ok(guard.clone())
    }

    pub fn update_config(
        &self,
        silent_sweep_enabled: bool,
        heartbeat_interval_minutes: u32,
        file_drop_trigger_enabled: bool,
        wcs_threshold: u8,
        watched_folders: Vec<String>,
    ) -> Result<AutomationStatus, String> {
        {
            let mut guard = self.state.lock().map_err(|e| e.to_string())?;
            guard.silent_sweep_enabled = silent_sweep_enabled;
            guard.heartbeat_interval_minutes = heartbeat_interval_minutes.max(1);
            guard.file_drop_trigger_enabled = file_drop_trigger_enabled;
            guard.wcs_threshold = wcs_threshold.clamp(50, 99);
            guard.watched_folders = watched_folders.clone();

            let event_msg = if silent_sweep_enabled {
                format!(
                    "Silent Sweep Auto-Pilot armed ({}m heartbeat across {} folder(s)).",
                    guard.heartbeat_interval_minutes,
                    watched_folders.len()
                )
            } else {
                "Silent Sweep Auto-Pilot paused; manual dry-run mode active.".to_string()
            };

            guard.recent_events.insert(
                0,
                AutomationEventLog {
                    id: format!("evt_{}", Utc::now().timestamp_millis()),
                    timestamp: Utc::now().timestamp(),
                    event_type: if silent_sweep_enabled {
                        "AUTOPILOT_ARMED".to_string()
                    } else {
                        "AUTOPILOT_PAUSED".to_string()
                    },
                    summary: event_msg,
                    files_affected: 0,
                },
            );
            guard.recent_events.truncate(20);
        }

        if silent_sweep_enabled && file_drop_trigger_enabled {
            let _ = self.start_native_watcher(&watched_folders);
        } else {
            let _ = self.stop_native_watcher();
        }

        self.get_status()
    }

    pub fn toggle_rule(&self, rule_id: &str, enabled: bool) -> Result<AutomationStatus, String> {
        let mut guard = self.state.lock().map_err(|e| e.to_string())?;
        if let Some(rule) = guard.rules.iter_mut().find(|r| r.id == rule_id) {
            rule.enabled = enabled;
        }
        Ok(guard.clone())
    }

    /// Starts the native OS `notify` watcher on target directories.
    fn start_native_watcher(&self, folders: &[String]) -> Result<(), String> {
        let state_clone = Arc::clone(&self.state);
        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    if event.kind.is_create() || event.kind.is_modify() {
                        if let Some(first_path) = event.paths.first() {
                            if is_excluded_path(first_path) {
                                return;
                            }
                            if let Some(file_name) = first_path.file_name().and_then(|n| n.to_str())
                            {
                                if file_name.starts_with('.') {
                                    return;
                                }
                                if let Ok(mut guard) = state_clone.lock() {
                                    guard.recent_events.insert(
                                        0,
                                        AutomationEventLog {
                                            id: format!("fs_{}", Utc::now().timestamp_millis()),
                                            timestamp: Utc::now().timestamp(),
                                            event_type: "FILE_DETECTED".to_string(),
                                            summary: format!(
                                                "Detected filesystem change: {}",
                                                file_name
                                            ),
                                            files_affected: 1,
                                        },
                                    );
                                    guard.recent_events.truncate(20);
                                }
                            }
                        }
                    }
                }
            },
            Config::default(),
        )
        .map_err(|e| format!("Failed to initialize native notify watcher: {}", e))?;

        for raw in folders {
            let expanded = expand_user_path(raw);
            if expanded.exists() && !is_excluded_path(&expanded) {
                let _ = watcher.watch(&expanded, RecursiveMode::NonRecursive);
            }
        }

        let mut handle_guard = self.watcher_handle.lock().map_err(|e| e.to_string())?;
        *handle_guard = Some(watcher);
        Ok(())
    }

    fn stop_native_watcher(&self) -> Result<(), String> {
        let mut handle_guard = self.watcher_handle.lock().map_err(|e| e.to_string())?;
        *handle_guard = None;
        Ok(())
    }

    /// Executes an immediate Silent Sweep heartbeat cycle:
    /// 1. Organizes safe file types matching enabled automation rules.
    /// 2. Scans for high-WCS clutter and queues it for human triage review.
    pub fn trigger_heartbeat_sweep(
        &self,
        journal: &JournalManager,
    ) -> Result<AutomationStatus, String> {
        let (folders, enabled_categories) = {
            let guard = self.state.lock().map_err(|e| e.to_string())?;
            let mut cats = Vec::new();
            for rule in &guard.rules {
                if rule.enabled {
                    for c in &rule.category_scope {
                        cats.push(c.clone());
                    }
                }
            }
            (guard.watched_folders.clone(), cats)
        };

        let plan = generate_dry_run_plan(&folders);
        let eligible_items: Vec<_> = plan
            .categories
            .into_iter()
            .filter(|c| enabled_categories.contains(&c.category))
            .flat_map(|c| c.items)
            .collect();

        let moved_count = if !eligible_items.is_empty() {
            execute_organize_plan(&eligible_items, journal)
                .map(|r| r.moved_count)
                .unwrap_or(0)
        } else {
            0
        };

        let triage_report = run_triage_scan(&folders);
        let now = Utc::now().timestamp();

        let mut guard = self.state.lock().map_err(|e| e.to_string())?;
        guard.last_heartbeat_at = Some(now);
        guard.queued_triage_count = triage_report.total_flagged_files;
        guard.recent_events.insert(
            0,
            AutomationEventLog {
                id: format!("sweep_{}", Utc::now().timestamp_millis()),
                timestamp: now,
                event_type: "SILENT_SWEEP".to_string(),
                summary: format!(
                    "Silent Sweep sorted {} safe file(s) & queued {} high-WCS clutter item(s) for review.",
                    moved_count, triage_report.total_flagged_files
                ),
                files_affected: moved_count + triage_report.total_flagged_files,
            },
        );
        guard.recent_events.truncate(20);

        Ok(guard.clone())
    }
}
