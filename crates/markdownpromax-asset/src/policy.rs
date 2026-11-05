//! URL 准入策略。

use url::Url;

use crate::Error;

/// 远程图片的准入规则。
#[derive(Debug, Clone)]
pub struct Policy {
    /// 单张图片的字节上限。
    pub max_bytes: u64,
    /// 是否允许明文 HTTP（默认只允许 HTTPS）。
    pub allow_insecure_http: bool,
    /// URL 长度上限，防止病态输入。
    pub max_url_len: usize,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            max_bytes: 10 * 1024 * 1024,
            allow_insecure_http: false,
            max_url_len: 2048,
        }
    }
}

/// 解析并校验 URL；不通过时返回 [`Error::UrlNotAllowed`]。
pub fn check_url(raw: &str, policy: &Policy) -> Result<Url, Error> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(Error::UrlNotAllowed("空 URL".to_string()));
    }
    if trimmed.len() > policy.max_url_len {
        return Err(Error::UrlNotAllowed(format!(
            "URL 过长（{} 字节）",
            trimmed.len()
        )));
    }

    let url =
        Url::parse(trimmed).map_err(|error| Error::UrlNotAllowed(format!("无法解析：{error}")))?;

    match url.scheme() {
        "https" => {}
        "http" if policy.allow_insecure_http => {}
        "http" => {
            return Err(Error::UrlNotAllowed(
                "只允许 HTTPS（可在设置里放开 HTTP）".to_string(),
            ));
        }
        other => return Err(Error::UrlNotAllowed(format!("不支持的协议：{other}"))),
    }

    if url.host_str().unwrap_or_default().is_empty() {
        return Err(Error::UrlNotAllowed("缺少主机名".to_string()));
    }

    Ok(url)
}
