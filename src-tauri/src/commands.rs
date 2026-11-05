//! WebView 可调用的命令。
//!
//! 约定：命令名用 snake_case，参数在前端用 camelCase（Tauri 自动转换），
//! 返回结构体统一 `#[serde(rename_all = "camelCase")]`，与 `src/platform/types.ts` 对齐。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use markdownpromax_asset::{AssetCache, Fetcher, Policy};
use markdownpromax_core::ListOptions;
use markdownpromax_core::{Charset, Eol, SaveRequest};

use crate::recent::{self, RecentEntry};

/// 文档元信息（不含正文）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocMetaPayload {
    pub id: String,
    pub name: String,
    pub path: String,
    pub charset: String,
    pub eol: String,
    pub mtime_ms: u64,
    pub size: u64,
}

/// 打开结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedPayload {
    pub meta: DocMetaPayload,
    pub text: String,
}

/// 保存结果。
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPayload {
    pub mtime_ms: u64,
    pub bytes: usize,
}

/// 已打开文档的 Rust 侧状态。
struct DocHandle {
    path: PathBuf,
    charset: Charset,
    eol: Eol,
    mtime_ms: u64,
}

/// 进程内的文档表，key 即文档 id（当前用绝对路径）。
#[derive(Default)]
pub struct Docs(Mutex<HashMap<String, DocHandle>>);

impl Docs {
    fn insert(&self, id: String, path: PathBuf, charset: Charset, eol: Eol, mtime_ms: u64) {
        let handle = DocHandle {
            path,
            charset,
            eol,
            mtime_ms,
        };
        if let Ok(mut map) = self.0.lock() {
            map.insert(id, handle);
        }
    }

    fn get(&self, id: &str) -> Option<(PathBuf, Charset, Eol, u64)> {
        let map = self.0.lock().ok()?;
        map.get(id)
            .map(|h| (h.path.clone(), h.charset, h.eol, h.mtime_ms))
    }

    fn touch(&self, id: &str, mtime_ms: u64) {
        if let Ok(mut map) = self.0.lock() {
            if let Some(handle) = map.get_mut(id) {
                handle.mtime_ms = mtime_ms;
            }
        }
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "未命名.md".to_string())
}

fn meta_payload(
    id: String,
    path: &Path,
    charset: Charset,
    eol: Eol,
    mtime_ms: u64,
    size: u64,
) -> DocMetaPayload {
    DocMetaPayload {
        name: file_name(path),
        path: id.clone(),
        id,
        charset: charset.label().to_string(),
        eol: eol.as_str().to_string(),
        mtime_ms,
        size,
    }
}

/// 打开指定路径的文件。
#[tauri::command]
pub fn open_document(
    app: AppHandle,
    docs: State<'_, Docs>,
    path: String,
) -> Result<OpenedPayload, String> {
    let opened = markdownpromax_core::open(Path::new(&path)).map_err(|error| error.to_string())?;
    let charset = opened.meta.charset;
    let eol = opened.meta.eol;
    let meta = meta_payload(
        path.clone(),
        &opened.meta.path,
        charset,
        eol,
        opened.meta.mtime_ms,
        opened.meta.size,
    );

    docs.insert(
        path,
        opened.meta.path.clone(),
        charset,
        eol,
        opened.meta.mtime_ms,
    );
    recent::push(
        &app,
        RecentEntry {
            path: meta.path.clone(),
            name: meta.name.clone(),
            charset: meta.charset.clone(),
            eol: meta.eol.clone(),
            mtime_ms: meta.mtime_ms,
            size: meta.size,
            opened_at: recent::now_ms(),
        },
    );

    Ok(OpenedPayload {
        meta,
        text: opened.text,
    })
}

/// 弹出系统文件对话框并打开选中的文件。
#[tauri::command]
pub async fn pick_document(
    app: AppHandle,
    docs: State<'_, Docs>,
) -> Result<Option<OpenedPayload>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "mdx", "txt"])
        .blocking_pick_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    open_document(app, docs, path.to_string_lossy().to_string()).map(Some)
}

/// 保存已打开的文档。
#[tauri::command]
pub fn save_document(
    docs: State<'_, Docs>,
    id: String,
    text: String,
    expect_mtime_ms: Option<u64>,
) -> Result<SavedPayload, String> {
    let (path, charset, eol, _) = docs
        .get(&id)
        .ok_or_else(|| "文档未打开，请先重新打开文件".to_string())?;

    let saved = markdownpromax_core::save(SaveRequest {
        path: &path,
        text: &text,
        charset,
        eol,
        expect_mtime_ms,
        backup: true,
    })
    .map_err(|error| error.to_string())?;

    docs.touch(&id, saved.mtime_ms);
    Ok(SavedPayload {
        mtime_ms: saved.mtime_ms,
        bytes: saved.bytes,
    })
}

/// 另存为：新文件统一用 UTF-8 + LF。
#[tauri::command]
pub async fn save_document_as(
    app: AppHandle,
    docs: State<'_, Docs>,
    text: String,
    suggested_name: String,
) -> Result<Option<OpenedPayload>, String> {
    let picked = app
        .dialog()
        .file()
        .set_file_name(suggested_name)
        .add_filter("Markdown", &["md", "markdown"])
        .blocking_save_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;

    let saved = markdownpromax_core::save(SaveRequest {
        path: &path,
        text: &text,
        charset: Charset::UTF8,
        eol: Eol::Lf,
        expect_mtime_ms: None,
        backup: true,
    })
    .map_err(|error| error.to_string())?;

    let id = path.to_string_lossy().to_string();
    docs.insert(
        id.clone(),
        path.clone(),
        Charset::UTF8,
        Eol::Lf,
        saved.mtime_ms,
    );

    let meta = meta_payload(
        id,
        &path,
        Charset::UTF8,
        Eol::Lf,
        saved.mtime_ms,
        saved.bytes as u64,
    );
    recent::push(
        &app,
        RecentEntry {
            path: meta.path.clone(),
            name: meta.name.clone(),
            charset: meta.charset.clone(),
            eol: meta.eol.clone(),
            mtime_ms: meta.mtime_ms,
            size: meta.size,
            opened_at: recent::now_ms(),
        },
    );

    Ok(Some(OpenedPayload { meta, text }))
}

/// 最近打开的文件列表（新的在前）。
#[tauri::command]
pub fn recent_documents(app: AppHandle) -> Vec<DocMetaPayload> {
    recent::load(&app)
        .into_iter()
        .map(|entry| DocMetaPayload {
            id: entry.path.clone(),
            name: entry.name,
            path: entry.path,
            charset: entry.charset,
            eol: entry.eol,
            mtime_ms: entry.mtime_ms,
            size: entry.size,
        })
        .collect()
}

// ---------------------------------------------------------------------------
// 远程图片代理
// ---------------------------------------------------------------------------

/// 把 reqwest 包装成 `markdownpromax-asset` 需要的抓取器。
struct ReqwestFetcher {
    client: reqwest::blocking::Client,
}

impl ReqwestFetcher {
    fn new() -> Result<Self, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::limited(3))
            .user_agent("markdownpromax/0.1")
            .build()
            .map_err(|error| format!("初始化 HTTP 客户端失败：{error}"))?;
        Ok(Self { client })
    }
}

impl Fetcher for ReqwestFetcher {
    fn fetch(&self, url: &str) -> Result<Vec<u8>, String> {
        let response = self
            .client
            .get(url)
            .send()
            .map_err(|error| format!("请求失败：{error}"))?;

        if !response.status().is_success() {
            return Err(format!("HTTP {}", response.status()));
        }

        const MAX: u64 = 10 * 1024 * 1024;
        if let Some(length) = response.content_length() {
            if length > MAX {
                return Err(format!("图片过大：{length} 字节"));
            }
        }

        let bytes = response
            .bytes()
            .map_err(|error| format!("读取响应失败：{error}"))?;
        Ok(bytes.to_vec())
    }
}

/// 下载一张远程图片并返回 `data:` URL。
///
/// 这样 WebView 的 CSP 只需要放行 `data:`，不必对任意域名开口子；
/// 同一张图第二次打开时直接命中磁盘缓存，不再发请求。
fn fetch_remote_image_blocking(app: &AppHandle, url: &str) -> Result<String, String> {
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("无法定位缓存目录：{error}"))?
        .join("remote-images");

    let cache = AssetCache::new(cache_root);
    let policy = Policy::default();
    let fetcher = ReqwestFetcher::new()?;

    let fetched = markdownpromax_asset::fetch_image(&cache, &policy, &fetcher, url)
        .map_err(|error| error.to_string())?;

    let bytes = std::fs::read(&fetched.path).map_err(|error| format!("读取缓存失败：{error}"))?;
    let ext = fetched
        .path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("bin");

    Ok(markdownpromax_asset::to_data_url(&bytes, ext))
}

/// 前端在用户点击「加载远程图片」时调用。
#[tauri::command]
pub async fn fetch_remote_image(app: AppHandle, url: String) -> Result<String, String> {
    // 下载是阻塞 IO，丢到阻塞线程池，别占住异步 worker。
    match tokio::task::spawn_blocking(move || fetch_remote_image_blocking(&app, &url)).await {
        Ok(result) => result,
        Err(error) => Err(format!("下载任务失败：{error}")),
    }
}

// ---------------------------------------------------------------------------
// 本地图片：与远程图片走同一条 data URL 通路，避免开启 asset 协议
// ---------------------------------------------------------------------------

/// 读取一张图片并返回 `data:` URL。远程 URL 走缓存代理，本地路径限制在文档目录内。
fn load_image_blocking(app: &AppHandle, doc_path: &str, src: &str) -> Result<String, String> {
    if src.starts_with("https://") || src.starts_with("http://") {
        return fetch_remote_image_blocking(app, src);
    }

    let base = Path::new(doc_path)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();

    let candidate = if Path::new(src).is_absolute() {
        PathBuf::from(src)
    } else {
        base.join(src)
    };

    let canonical =
        std::fs::canonicalize(&candidate).map_err(|error| format!("找不到图片 {src}：{error}"))?;
    let base_canonical = std::fs::canonicalize(&base).unwrap_or(base);

    if !canonical.starts_with(&base_canonical) {
        return Err("图片路径超出了文档目录范围".to_string());
    }

    const MAX: u64 = 10 * 1024 * 1024;
    let meta =
        std::fs::metadata(&canonical).map_err(|error| format!("读取图片信息失败：{error}"))?;
    if meta.len() > MAX {
        return Err(format!("图片过大：{} 字节", meta.len()));
    }

    let ext = canonical
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("bin");
    let bytes = std::fs::read(&canonical).map_err(|error| format!("读取图片失败：{error}"))?;
    Ok(markdownpromax_asset::to_data_url(&bytes, ext))
}

/// 前端点击图片占位时调用：本地文件或远程 URL 都走这里。
#[tauri::command]
pub async fn load_image(app: AppHandle, doc_path: String, src: String) -> Result<String, String> {
    match tokio::task::spawn_blocking(move || load_image_blocking(&app, &doc_path, &src)).await {
        Ok(result) => result,
        Err(error) => Err(format!("加载图片失败：{error}")),
    }
}

// ---------------------------------------------------------------------------
// 工作区
// ---------------------------------------------------------------------------

/// 目录项（与前端 `DirEntry` 对齐）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryPayload {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

/// 列出目录的一层内容（只读 Markdown 相关文件）。
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntryPayload>, String> {
    let options = ListOptions::default();
    markdownpromax_core::list_dir(Path::new(&path), &options)
        .map(|entries| {
            entries
                .into_iter()
                .map(|entry| DirEntryPayload {
                    name: entry.name,
                    path: entry.path.to_string_lossy().to_string(),
                    is_dir: entry.is_dir,
                    size: entry.size,
                })
                .collect()
        })
        .map_err(|error| error.to_string())
}

/// 弹出系统对话框选择一个文件夹作为工作区。
#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

// ---------------------------------------------------------------------------
// 工作区文件操作
// ---------------------------------------------------------------------------

/// 新建文件或目录，返回新路径。
#[tauri::command]
pub fn create_entry(parent: String, name: String, directory: bool) -> Result<String, String> {
    let parent = Path::new(&parent);
    let created = if directory {
        markdownpromax_core::create_directory(parent, &name)
    } else {
        markdownpromax_core::create_file(parent, &name)
    }
    .map_err(|error| error.to_string())?;

    Ok(created.to_string_lossy().to_string())
}

/// 删除文件或目录（目录连同内容）。
#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    markdownpromax_core::delete_path(Path::new(&path)).map_err(|error| error.to_string())
}

/// 复制文件或目录到新路径。
#[tauri::command]
pub fn copy_entry(from: String, to: String) -> Result<(), String> {
    markdownpromax_core::copy_path(Path::new(&from), Path::new(&to)).map_err(|error| error.to_string())
}

/// 移动/重命名（剪切粘贴）。
#[tauri::command]
pub fn move_entry(from: String, to: String) -> Result<(), String> {
    markdownpromax_core::move_path(Path::new(&from), Path::new(&to)).map_err(|error| error.to_string())
}

/// 在系统文件管理器里定位该路径。
#[tauri::command]
pub fn reveal_entry(path: String) -> Result<(), String> {
    reveal_in_file_manager(Path::new(&path))
}

#[cfg(target_os = "linux")]
fn reveal_in_file_manager(path: &Path) -> Result<(), String> {
    use std::process::Command;
    // 大多数文件管理器支持打开所在目录；精确选中需要 dbus 的 FileManager1，暂不做
    let target = path.parent().unwrap_or(path);
    Command::new("xdg-open")
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法打开文件管理器：{error}"))
}

#[cfg(target_os = "macos")]
fn reveal_in_file_manager(path: &Path) -> Result<(), String> {
    use std::process::Command;
    Command::new("open")
        .arg("-R")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法打开访达：{error}"))
}

#[cfg(target_os = "windows")]
fn reveal_in_file_manager(path: &Path) -> Result<(), String> {
    use std::process::Command;
    Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法打开资源管理器：{error}"))
}

/// 从最近列表移除一条记录（不会删除磁盘文件），返回新的列表。
#[tauri::command]
pub fn remove_recent(app: AppHandle, path: String) -> Vec<crate::recent::RecentEntry> {
    crate::recent::remove(&app, &path)
}

/// 打开一个新的应用窗口。
#[tauri::command]
pub async fn open_new_window(app: AppHandle) -> Result<(), String> {
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);

    tauri::WebviewWindowBuilder::new(
        &app,
        format!("window-{unique}"),
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("MarkdownProMax")
    .inner_size(1180.0, 800.0)
    .min_inner_size(720.0, 480.0)
    .build()
    .map(|_| ())
    .map_err(|error| format!("无法创建窗口：{error}"))
}
