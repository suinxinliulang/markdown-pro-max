//! 端到端的文件往返测试：打开 → 编辑 → 保存 → 再打开。

use std::fs;

use markdownpromax_core::{Charset, Eol, Error, SaveRequest, open, save};

#[test]
fn save_then_open_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("note.md");

    let saved = save(SaveRequest {
        path: &path,
        text: "# 标题\n\n正文\n",
        charset: Charset::UTF8,
        eol: Eol::Lf,
        expect_mtime_ms: None,
        backup: false,
    })
    .unwrap();
    assert_eq!(saved.bytes, "# 标题\n\n正文\n".len());

    let opened = open(&path).unwrap();
    assert_eq!(opened.text, "# 标题\n\n正文\n");
    assert_eq!(opened.meta.eol, Eol::Lf);
    assert_eq!(opened.meta.charset, Charset::UTF8);
    assert_eq!(opened.meta.mtime_ms, saved.mtime_ms);
}

#[test]
fn crlf_is_preserved_on_save() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("win.md");
    fs::write(&path, b"line1\r\nline2\r\n").unwrap();

    let opened = open(&path).unwrap();
    assert_eq!(opened.meta.eol, Eol::CrLf);
    assert_eq!(opened.text, "line1\nline2\n", "编辑器内部应统一为 LF");

    let saved = save(SaveRequest {
        path: &opened.meta.path,
        text: &opened.text,
        charset: opened.meta.charset,
        eol: opened.meta.eol,
        expect_mtime_ms: Some(opened.meta.mtime_ms),
        backup: false,
    })
    .unwrap();
    assert!(saved.bytes > opened.text.len(), "CRLF 应比 LF 多出字节");

    assert_eq!(fs::read(&path).unwrap(), b"line1\r\nline2\r\n");
}

#[test]
fn conflict_is_reported_when_mtime_mismatches() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("conflict.md");
    fs::write(&path, b"original").unwrap();

    let err = save(SaveRequest {
        path: &path,
        text: "overwritten",
        charset: Charset::UTF8,
        eol: Eol::Lf,
        expect_mtime_ms: Some(u64::MAX),
        backup: false,
    })
    .unwrap_err();

    assert!(matches!(err, Error::Conflict { .. }), "got {err:?}");
    assert_eq!(fs::read(&path).unwrap(), b"original", "冲突时不应写入");
}

#[test]
fn backup_file_is_created() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("draft.md");
    fs::write(&path, b"v1").unwrap();

    save(SaveRequest {
        path: &path,
        text: "v2",
        charset: Charset::UTF8,
        eol: Eol::Lf,
        expect_mtime_ms: None,
        backup: true,
    })
    .unwrap();

    assert_eq!(fs::read(&path).unwrap(), b"v2");
    assert_eq!(fs::read(dir.path().join("draft.md.bak")).unwrap(), b"v1");
}

#[test]
fn opening_a_directory_is_an_error() {
    let dir = tempfile::tempdir().unwrap();
    let err = open(dir.path()).unwrap_err();
    assert!(matches!(err, Error::NotAFile(_)), "got {err:?}");
}

#[test]
fn missing_file_reports_read_error() {
    let dir = tempfile::tempdir().unwrap();
    let err = open(&dir.path().join("nope.md")).unwrap_err();
    assert!(matches!(err, Error::Read { .. }), "got {err:?}");
}
