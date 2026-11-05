//! markdownpromax 的文件层内核。
//!
//! 这一层刻意**不依赖 Tauri、不依赖 GUI**，因此可以在任何环境（包括没有
//! WebView 开发包的 CI 容器）里 `cargo test`。它只负责 WebView 侧不适合做的事：
//!
//! - 编码探测与往返（UTF-8 / UTF-8 BOM / UTF-16 / GBK 等老文件）
//! - 行尾策略（LF / CRLF / CR）
//! - 原子写（临时文件 + fsync + rename），避免断电写坏原文件
//! - 外部修改冲突检测（mtime 比对）

pub mod atomic;
pub mod document;
pub mod encoding;
pub mod eol;
pub mod error;
pub mod fs_ops;
pub mod workspace;

pub use document::{DocumentMeta, MAX_FILE_BYTES, Opened, SaveRequest, Saved, open, save};
pub use encoding::{Bom, Charset, Decoded, decode, encode};
pub use eol::Eol;
pub use error::{Error, Result};
pub use fs_ops::{copy_path, create_directory, create_file, delete_path, move_path, validate_name};
pub use workspace::{Entry, ListOptions, list_dir};
