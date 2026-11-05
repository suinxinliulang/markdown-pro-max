//! MarkdownProMax 的 Tauri 外壳。
//!
//! 这里只做三件事：注册插件、托管文档状态、把命令暴露给 WebView。
//! 真正的文件逻辑（编码 / 行尾 / 原子写 / 冲突检测）在 `markdownpromax-core` 里，
//! 那一层不依赖 Tauri，可以脱离 WebView 单独测试。

mod commands;
mod recent;
mod watcher;

use tauri::Manager;
use tauri_plugin_window_state::{Builder as WindowStateBuilder, StateFlags};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // 第二次启动时聚焦已有窗口，而不是再开一个进程。
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        // 记住窗口大小与位置：插件会监听 resize/move，并在退出时落盘、下次启动恢复
        .plugin(
            WindowStateBuilder::default()
                .with_state_flags(StateFlags::all())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(commands::Docs::default())
        .manage(watcher::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            commands::open_document,
            commands::pick_document,
            commands::save_document,
            commands::save_document_as,
            commands::recent_documents,
            commands::remove_recent,
            commands::fetch_remote_image,
            commands::load_image,
            commands::list_directory,
            commands::pick_folder,
            watcher::watch_workspace,
            commands::create_entry,
            commands::delete_entry,
            commands::copy_entry,
            commands::move_entry,
            commands::reveal_entry,
            commands::open_new_window,
        ])
        .run(tauri::generate_context!())
        .expect("MarkdownProMax 启动失败");
}
