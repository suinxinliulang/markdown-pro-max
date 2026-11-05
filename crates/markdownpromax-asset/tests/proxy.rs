use std::cell::RefCell;

use markdownpromax_asset::{AssetCache, Error, Fetcher, Policy, check_url, fetch_image, sanitize_ext};

#[derive(Default)]
struct StubFetcher {
    calls: RefCell<Vec<String>>,
    body: Vec<u8>,
}

impl StubFetcher {
    fn with_body(body: &[u8]) -> Self {
        Self {
            calls: RefCell::new(Vec::new()),
            body: body.to_vec(),
        }
    }
    fn calls(&self) -> usize {
        self.calls.borrow().len()
    }
}

impl Fetcher for StubFetcher {
    fn fetch(&self, url: &str) -> Result<Vec<u8>, String> {
        self.calls.borrow_mut().push(url.to_string());
        Ok(self.body.clone())
    }
}

fn temp_cache() -> (tempfile::TempDir, AssetCache) {
    let dir = tempfile::tempdir().unwrap();
    let cache = AssetCache::new(dir.path().join("assets"));
    (dir, cache)
}

#[test]
fn downloads_once_then_serves_from_cache() {
    let (_dir, cache) = temp_cache();
    let fetcher = StubFetcher::with_body(b"\x89PNG\r\n\x1a\nfake");
    let policy = Policy::default();
    let url = "https://example.com/a.png";

    let first = fetch_image(&cache, &policy, &fetcher, url).unwrap();
    assert!(!first.from_cache);
    assert_eq!(first.bytes, 12);
    assert!(
        first
            .path
            .ends_with(format!("{}.png", AssetCache::key(url)))
    );

    let second = fetch_image(&cache, &policy, &fetcher, url).unwrap();
    assert!(second.from_cache);
    assert_eq!(fetcher.calls(), 1, "第二次不应再发请求");
}

#[test]
fn rejects_plain_http_by_default() {
    let (_dir, cache) = temp_cache();
    let fetcher = StubFetcher::with_body(b"x");
    let policy = Policy::default();

    let error = fetch_image(&cache, &policy, &fetcher, "http://example.com/a.png").unwrap_err();
    assert!(matches!(error, Error::UrlNotAllowed(_)), "got {error:?}");
    assert_eq!(fetcher.calls(), 0);
}

#[test]
fn allows_http_when_opted_in() {
    let (_dir, cache) = temp_cache();
    let fetcher = StubFetcher::with_body(b"x");
    let policy = Policy {
        allow_insecure_http: true,
        ..Policy::default()
    };

    assert!(fetch_image(&cache, &policy, &fetcher, "http://localhost:8080/a.png").is_ok());
}

#[test]
fn rejects_non_http_schemes() {
    let policy = Policy::default();
    for url in [
        "file:///etc/passwd",
        "data:image/png;base64,AAAA",
        "ftp://x/y.png",
    ] {
        let error = check_url(url, &policy).unwrap_err();
        assert!(
            matches!(error, Error::UrlNotAllowed(_)),
            "{url} 不应通过，got {error:?}"
        );
    }
}

#[test]
fn oversized_body_is_rejected_and_not_cached() {
    let (_dir, cache) = temp_cache();
    let fetcher = StubFetcher::with_body(&[0u8; 64]);
    let policy = Policy {
        max_bytes: 32,
        ..Policy::default()
    };

    let error = fetch_image(&cache, &policy, &fetcher, "https://example.com/big.png").unwrap_err();
    assert!(
        matches!(
            error,
            Error::TooLarge {
                size: 64,
                limit: 32
            }
        ),
        "got {error:?}"
    );
    assert!(cache.lookup("https://example.com/big.png").is_none());
}

#[test]
fn extension_is_sanitized() {
    assert_eq!(sanitize_ext("PNG"), "png");
    assert_eq!(sanitize_ext(".jpeg"), "jpeg");
    // 目录穿越与超长扩展名都退回 bin
    assert_eq!(sanitize_ext("../../etc/passwd"), "bin");
    assert_eq!(sanitize_ext("a/b"), "ab");
    assert_eq!(sanitize_ext(""), "bin");
    assert_eq!(sanitize_ext("verylongext"), "bin");
}

#[test]
fn cache_key_is_stable_and_hex() {
    let key = AssetCache::key("https://example.com/a.png");
    assert_eq!(key, AssetCache::key("https://example.com/a.png"));
    assert_ne!(key, AssetCache::key("https://example.com/b.png"));
    assert_eq!(key.len(), 64);
    assert!(key.chars().all(|c| c.is_ascii_hexdigit()));
}
