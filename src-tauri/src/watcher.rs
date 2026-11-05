//! 工作区文件监听。
//!
//! 变更后节流 300ms，再通过 `workspace://changed` 事件通知前端刷新目录树。
//! 同一时间只保留最新一代的监听线程：切换工作区时旧线程会自动退出。

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::RecvTimeoutError;
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, State};

/// 事件名，与前端 `platform.onWorkspaceChanged` 对应。
const EVENT: &str = "workspace://changed";

/// 节流窗口。
const DEBOUNCE: Duration = Duration::from_millis(300);

/// 监听器状态。
#[derive(Clone, Default)]
pub struct WatcherState {
    generation: Arc<AtomicU64>,
}

impl WatcherState {
    fn next_generation(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn is_current(&self, generation: u64) -> bool {
        self.generation.load(Ordering::SeqCst) == generation
    }
}

/// 开始监听一个工作区目录（递归）。
#[tauri::command]
pub fn watch_workspace(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    let root = std::path::PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("工作区不存在：{path}"));
    }

    let generation = state.next_generation();
    let shared = state.inner().clone();

    std::thread::spawn(move || {
        let (sender, receiver) = std::sync::mpsc::channel();
        let mut watcher = match notify::recommended_watcher(move |result| {
            let _ = sender.send(result);
        }) {
            Ok(watcher) => watcher,
            Err(_) => return,
        };

        if watcher.watch(&root, RecursiveMode::Recursive).is_err() {
            return;
        }

        let mut pending = false;
        loop {
            // 切到别的工作区后，旧线程自行退出
            if !shared.is_current(generation) {
                break;
            }

            match receiver.recv_timeout(DEBOUNCE) {
                Ok(Ok(_event)) => pending = true,
                Ok(Err(_)) => {}
                Err(RecvTimeoutError::Timeout) => {
                    if pending {
                        pending = false;
                        let _ = app.emit(EVENT, &path);
                    }
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }

        drop(watcher);
    });

    Ok(())
}
