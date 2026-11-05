//! 最近打开文件的持久化（`<app_config_dir>/recent.json`）。

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// 最近列表最多保存的条目数。
pub const MAX_RECENT: usize = 12;

/// 一条最近记录。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    /// 绝对路径（同时作为文档 id）。
    pub path: String,
    /// 文件名。
    pub name: String,
    /// 打开时的编码。
    pub charset: String,
    /// 打开时的行尾。
    pub eol: String,
    /// 打开时的 mtime。
    pub mtime_ms: u64,
    /// 打开时的大小。
    pub size: u64,
    /// 最近一次打开的毫秒时间戳。
    pub opened_at: u64,
}

fn store_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("recent.json"))
}

/// 读取最近列表；文件不存在或损坏时返回空列表。
pub fn load(app: &AppHandle) -> Vec<RecentEntry> {
    let Some(path) = store_path(app) else {
        return Vec::new();
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return Vec::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

/// 插入一条记录（同路径去重、置顶、截断）。
pub fn push(app: &AppHandle, entry: RecentEntry) {
    let mut entries = load(app);
    entries.retain(|existing| existing.path != entry.path);
    entries.insert(0, entry);
    entries.truncate(MAX_RECENT);

    let Some(path) = store_path(app) else {
        return;
    };
    if let Ok(json) = serde_json::to_string_pretty(&entries) {
        let _ = fs::write(path, json);
    }
}

/// 从最近列表移除某个路径（不删除磁盘上的文件）。
pub fn remove(app: &AppHandle, path: &str) -> Vec<RecentEntry> {
    let mut entries = load(app);
    entries.retain(|existing| existing.path != path);

    if let Some(store) = store_path(app)
        && let Ok(json) = serde_json::to_string_pretty(&entries)
    {
        let _ = fs::write(store, json);
    }

    entries
}

/// 当前毫秒时间戳。
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
