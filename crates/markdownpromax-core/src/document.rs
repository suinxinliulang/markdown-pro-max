//! 文档的打开与保存。

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::atomic;
use crate::encoding::{self, Charset};
use crate::eol::Eol;
use crate::error::{Error, Result};

/// 单个文件的可加载上限（20 MiB）。超过则拒绝打开，避免把编辑器拖死。
pub const MAX_FILE_BYTES: u64 = 20 * 1024 * 1024;

/// 一次打开文件后需要固定下来的元信息。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentMeta {
    /// 绝对路径。
    pub path: PathBuf,
    /// 文件编码，保存时原样写回。
    pub charset: Charset,
    /// 文件行尾，保存时原样写回。
    pub eol: Eol,
    /// 打开时的修改时间（毫秒），用于外部改动检测。
    pub mtime_ms: u64,
    /// 文件大小（字节）。
    pub size: u64,
}

/// 打开结果：文本已归一为 `\n`，行尾信息保留在 `meta.eol`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Opened {
    /// 归一化后的正文。
    pub text: String,
    /// 元信息。
    pub meta: DocumentMeta,
}

/// 读取并解码一个文件。
pub fn open(path: &Path) -> Result<Opened> {
    let meta = std::fs::metadata(path).map_err(|e| Error::read(path, e))?;
    if !meta.is_file() {
        return Err(Error::NotAFile(path.to_path_buf()));
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(Error::TooLarge(meta.len(), MAX_FILE_BYTES));
    }

    let bytes = std::fs::read(path).map_err(|e| Error::read(path, e))?;
    let decoded = encoding::decode(&bytes);
    let eol = Eol::detect(&decoded.text);

    Ok(Opened {
        text: eol.normalize(&decoded.text),
        meta: DocumentMeta {
            path: path.to_path_buf(),
            charset: decoded.charset,
            eol,
            mtime_ms: mtime_ms(&meta),
            size: meta.len(),
        },
    })
}

/// 保存请求。
#[derive(Debug, Clone)]
pub struct SaveRequest<'a> {
    /// 目标路径。
    pub path: &'a Path,
    /// 编辑器里的正文（`\n` 行尾）。
    pub text: &'a str,
    /// 要写回的编码。
    pub charset: Charset,
    /// 要写回的行尾。
    pub eol: Eol,
    /// 期望的磁盘 mtime；不一致说明文件被外部改过，返回 [`Error::Conflict`]。
    pub expect_mtime_ms: Option<u64>,
    /// 是否在覆盖前把旧内容备份为 `<name>.bak`。
    pub backup: bool,
}

/// 保存结果。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Saved {
    /// 保存后磁盘上的 mtime（毫秒）。
    pub mtime_ms: u64,
    /// 实际写入的字节数。
    pub bytes: usize,
}

/// 把文本按原始编码与行尾写回磁盘（原子写）。
pub fn save(req: SaveRequest<'_>) -> Result<Saved> {
    // 1. 冲突检测：只在目标已存在时才有意义。
    if let Some(expected) = req.expect_mtime_ms
        && let Ok(meta) = std::fs::metadata(req.path)
    {
        let actual = mtime_ms(&meta);
        if actual != expected {
            return Err(Error::Conflict { expected, actual });
        }
    }

    // 2. 还原行尾 + 编码（`Eol::apply` 内部会先归一化，避免 CRLF 被叠加）。
    let bytes = encoding::encode(&req.eol.apply(req.text), req.charset);

    // 3. 备份（失败不阻塞保存，主目标是先把新内容落盘）。
    if req.backup && req.path.exists() {
        let _ = std::fs::copy(req.path, atomic::backup_path(req.path));
    }

    // 4. 原子写。
    atomic::write_atomic(req.path, &bytes).map_err(|e| Error::write(req.path, e))?;

    let meta = std::fs::metadata(req.path).map_err(|e| Error::write(req.path, e))?;
    Ok(Saved {
        mtime_ms: mtime_ms(&meta),
        bytes: bytes.len(),
    })
}

fn mtime_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[allow(dead_code)]
fn _assert_system_time_is_used(_: SystemTime) {}
