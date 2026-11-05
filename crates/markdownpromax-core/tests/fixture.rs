//! 用 `docs/fixtures/kitchen-sink.md` 验证文件层：编码、行尾、逐字节往返。

use std::path::PathBuf;

use markdownpromax_core::{Charset, Eol, SaveRequest, open, save};

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/fixtures/kitchen-sink.md")
}

#[test]
fn fixture_exists_and_is_utf8_lf() {
    let path = fixture_path();
    let bytes = std::fs::read(&path).expect("测试文档应当存在");
    assert!(!bytes.is_empty());
    assert!(std::str::from_utf8(&bytes).is_ok(), "必须是合法 UTF-8");
    assert!(!bytes.contains(&b'\r'), "不应包含 CRLF");

    let opened = open(&path).unwrap();
    assert_eq!(opened.meta.charset, Charset::UTF8);
    assert_eq!(opened.meta.eol, Eol::Lf);
    assert!(opened.text.contains("```mermaid"));
    assert!(opened.text.contains("$$"));
}

#[test]
fn fixture_roundtrip_is_byte_identical() {
    let path = fixture_path();
    let original = std::fs::read(&path).unwrap();
    let opened = open(&path).unwrap();

    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("copy.md");

    save(SaveRequest {
        path: &target,
        text: &opened.text,
        charset: opened.meta.charset,
        eol: opened.meta.eol,
        expect_mtime_ms: None,
        backup: false,
    })
    .unwrap();

    assert_eq!(
        std::fs::read(&target).unwrap(),
        original,
        "保存后必须与原文件逐字节一致"
    );
}

#[test]
fn fixture_survives_conflict_check_and_backup() {
    let path = fixture_path();
    let opened = open(&path).unwrap();

    // 用正确的 mtime 保存到临时副本，再打开应与原文一致
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("note.md");
    std::fs::write(&target, b"old").unwrap();
    let opened_copy = open(&target).unwrap();

    let saved = save(SaveRequest {
        path: &target,
        text: &opened.text,
        charset: opened_copy.meta.charset,
        eol: opened_copy.meta.eol,
        expect_mtime_ms: Some(opened_copy.meta.mtime_ms),
        backup: true,
    })
    .unwrap();

    assert_eq!(saved.bytes as u64, opened.meta.size);
    assert_eq!(std::fs::read_to_string(&target).unwrap(), opened.text);
    assert_eq!(
        std::fs::read(dir.path().join("note.md.bak")).unwrap(),
        b"old"
    );
}
