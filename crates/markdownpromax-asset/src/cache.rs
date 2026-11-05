//! 磁盘缓存：以 URL 的 SHA-256 作为文件名。

use std::fs;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

/// 允许落盘的扩展名（同时也是查找时依次尝试的顺序）。
pub const EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "bin",
];

/// 一张图片的磁盘缓存。
#[derive(Debug, Clone)]
pub struct AssetCache {
    root: PathBuf,
}

impl AssetCache {
    /// 以 `root` 为缓存目录（首次写入时自动创建）。
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// 缓存根目录。
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// URL 的缓存键（64 位十六进制 SHA-256）。
    pub fn key(url: &str) -> String {
        let digest = Sha256::digest(url.as_bytes());
        let mut out = String::with_capacity(64);
        for byte in digest {
            out.push_str(&format!("{byte:02x}"));
        }
        out
    }

    /// 指定扩展名时的文件路径。
    pub fn path_for(&self, url: &str, ext: &str) -> PathBuf {
        self.root
            .join(format!("{}.{}", Self::key(url), sanitize_ext(ext)))
    }

    /// 查找已缓存的文件；命中返回（路径, 字节数）。
    pub fn lookup(&self, url: &str) -> Option<(PathBuf, u64)> {
        let key = Self::key(url);
        for ext in EXTENSIONS {
            let candidate = self.root.join(format!("{key}.{ext}"));
            if let Ok(meta) = fs::metadata(&candidate)
                && meta.is_file()
                && meta.len() > 0
            {
                return Some((candidate, meta.len()));
            }
        }
        None
    }

    /// 原子写入缓存，返回落盘路径。
    pub fn store(&self, url: &str, bytes: &[u8], ext: &str) -> std::io::Result<PathBuf> {
        fs::create_dir_all(&self.root)?;
        let path = self.path_for(url, ext);
        markdownpromax_core::atomic::write_atomic(&path, bytes)?;
        Ok(path)
    }
}

/// 只保留 `[a-z0-9]` 且长度 1..=5 的扩展名，其余一律落到 `bin`。
pub fn sanitize_ext(ext: &str) -> String {
    let cleaned: String = ext
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();

    if cleaned.is_empty() || cleaned.len() > 5 {
        "bin".to_string()
    } else {
        cleaned
    }
}

/// 把 HTTP `Content-Type` 映射成扩展名。
pub fn content_type_ext(content_type: &str) -> &'static str {
    let mime = content_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();

    match mime.as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "image/avif" => "avif",
        "image/bmp" => "bmp",
        _ => "bin",
    }
}

/// 从 URL 路径猜扩展名（`/a/b/c.PNG?v=1` → `png`）。
pub fn ext_from_url(url: &url::Url) -> &'static str {
    let path = url.path().to_ascii_lowercase();
    match path.rsplit_once('.') {
        Some((_, ext)) => match ext {
            "png" => "png",
            "jpg" => "jpg",
            "jpeg" => "jpeg",
            "gif" => "gif",
            "webp" => "webp",
            "svg" => "svg",
            "avif" => "avif",
            "bmp" => "bmp",
            _ => "bin",
        },
        None => "bin",
    }
}
