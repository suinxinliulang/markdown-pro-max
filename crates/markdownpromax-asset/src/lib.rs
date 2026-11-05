//! 远程图片代理内核。
//!
//! 设计上刻意把"抓取"抽象成 [`Fetcher`] trait：真正的 HTTP 客户端（reqwest）
//! 由 Tauri 外壳提供并注入，这样缓存命中、大小限制、协议校验这些逻辑
//! 可以在**没有网络**的单元测试里完整验证。
//!
//! 与 DESIGN.md 的对应关系：
//! - 远程图片默认不由 WebView 直连，统一走这里下载 → 落盘缓存 → 通过自定义协议回给 WebView；
//! - 这样 CSP 可以收紧到只允许自身与 `mdimg://`，也不会带着 `Referer` 泄露本地路径。

mod cache;
mod data_url;
mod policy;

pub use cache::{AssetCache, EXTENSIONS, content_type_ext, ext_from_url, sanitize_ext};
pub use data_url::{encode_base64, mime_for_ext, to_data_url};
pub use policy::{Policy, check_url};

use std::path::PathBuf;

/// 资源代理的错误。
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// URL 不满足策略。
    #[error("URL 不被允许：{0}")]
    UrlNotAllowed(String),

    /// 抓取失败。
    #[error("抓取失败：{0}")]
    Fetch(String),

    /// 响应体超过上限。
    #[error("图片过大：{size} 字节（上限 {limit} 字节）")]
    TooLarge {
        /// 实际大小。
        size: u64,
        /// 允许的上限。
        limit: u64,
    },

    /// 缓存写入失败。
    #[error("缓存写入失败：{0}")]
    Cache(#[from] std::io::Error),
}

/// 抓取器抽象：由外壳注入（生产环境是 reqwest）。
pub trait Fetcher {
    /// 下载 `url` 的全部字节。
    fn fetch(&self, url: &str) -> Result<Vec<u8>, String>;
}

/// 一次取图的结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Fetched {
    /// 缓存文件路径。
    pub path: PathBuf,
    /// 是否命中缓存（没有发起网络请求）。
    pub from_cache: bool,
    /// 字节数。
    pub bytes: u64,
}

/// 取一张远程图片：先查缓存，未命中才调用 [`Fetcher`]。
pub fn fetch_image(
    cache: &AssetCache,
    policy: &Policy,
    fetcher: &dyn Fetcher,
    url: &str,
) -> Result<Fetched, Error> {
    let parsed = check_url(url, policy)?;

    if let Some((path, bytes)) = cache.lookup(parsed.as_str()) {
        return Ok(Fetched {
            path,
            from_cache: true,
            bytes,
        });
    }

    let body = fetcher.fetch(parsed.as_str()).map_err(Error::Fetch)?;
    let size = body.len() as u64;
    if size > policy.max_bytes {
        return Err(Error::TooLarge {
            size,
            limit: policy.max_bytes,
        });
    }

    let ext = ext_from_url(&parsed);
    let path = cache.store(parsed.as_str(), &body, ext)?;
    Ok(Fetched {
        path,
        from_cache: false,
        bytes: size,
    })
}
