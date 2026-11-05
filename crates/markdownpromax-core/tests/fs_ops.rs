use std::fs;

use markdownpromax_core::{
    Error, copy_path, create_directory, create_file, delete_path, move_path, validate_name,
};

#[test]
fn rejects_invalid_names() {
    for name in ["", "   ", ".", "..", "a/b", "a\\b", "x\u{0}y"] {
        assert!(validate_name(name).is_err(), "{name:?} 应当被拒绝");
    }
}

#[test]
fn accepts_normal_names() {
    assert_eq!(validate_name(" 笔记.md ").unwrap(), "笔记.md");
    assert_eq!(validate_name("a-b_c 1").unwrap(), "a-b_c 1");
}

#[test]
fn creates_file_and_directory() {
    let dir = tempfile::tempdir().unwrap();
    let file = create_file(dir.path(), "note.md").unwrap();
    assert!(file.exists());
    assert_eq!(fs::read(&file).unwrap(), b"");

    let folder = create_directory(dir.path(), "子目录").unwrap();
    assert!(folder.is_dir());
}

#[test]
fn refuses_to_overwrite() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("a.md"), "x").unwrap();

    let error = create_file(dir.path(), "a.md").unwrap_err();
    assert!(matches!(error, Error::AlreadyExists(_)), "got {error:?}");
    assert_eq!(fs::read(dir.path().join("a.md")).unwrap(), b"x");
}

#[test]
fn deletes_files_and_directories() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("a.md");
    fs::write(&file, "x").unwrap();
    delete_path(&file).unwrap();
    assert!(!file.exists());

    let folder = dir.path().join("nested");
    fs::create_dir_all(folder.join("deep")).unwrap();
    fs::write(folder.join("deep").join("b.md"), "y").unwrap();
    delete_path(&folder).unwrap();
    assert!(!folder.exists());
}

#[test]
fn copies_files_and_directories() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("a.md");
    fs::write(&source, "hello").unwrap();

    let copy = dir.path().join("b.md");
    copy_path(&source, &copy).unwrap();
    assert_eq!(fs::read(&copy).unwrap(), b"hello");

    let folder = dir.path().join("folder");
    fs::create_dir(&folder).unwrap();
    fs::write(folder.join("inner.md"), "z").unwrap();

    let folder_copy = dir.path().join("folder-copy");
    copy_path(&folder, &folder_copy).unwrap();
    assert_eq!(fs::read(folder_copy.join("inner.md")).unwrap(), b"z");
}

#[test]
fn refuses_to_copy_onto_existing_target() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("a.md");
    fs::write(&source, "a").unwrap();
    let target = dir.path().join("b.md");
    fs::write(&target, "b").unwrap();

    let error = copy_path(&source, &target).unwrap_err();
    assert!(matches!(error, Error::AlreadyExists(_)), "got {error:?}");
}

#[test]
fn moves_files() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("a.md");
    fs::write(&source, "x").unwrap();
    let target = dir.path().join("b.md");

    move_path(&source, &target).unwrap();
    assert!(!source.exists());
    assert_eq!(fs::read(&target).unwrap(), b"x");
}

#[test]
fn delete_reports_missing_path() {
    let dir = tempfile::tempdir().unwrap();
    let error = delete_path(&dir.path().join("nope")).unwrap_err();
    assert!(matches!(error, Error::Read { .. }), "got {error:?}");
}
