use std::fs;

use markdownpromax_core::{Error, ListOptions, list_dir};

fn fixture() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();

    fs::write(root.join("note.md"), "# hi").unwrap();
    fs::write(root.join("README.MD"), "# readme").unwrap();
    fs::write(root.join("image.png"), b"\x89PNG").unwrap();
    fs::write(root.join(".hidden.md"), "secret").unwrap();
    fs::write(root.join("notes.txt"), "txt").unwrap();

    fs::create_dir(root.join("sub")).unwrap();
    fs::write(root.join("sub").join("inner.md"), "inner").unwrap();

    fs::create_dir(root.join("node_modules")).unwrap();
    fs::write(root.join("node_modules").join("dep.md"), "dep").unwrap();

    dir
}

#[test]
fn lists_markdown_files_and_directories() {
    let dir = fixture();
    let entries = list_dir(dir.path(), &ListOptions::default()).unwrap();
    let names: Vec<&str> = entries.iter().map(|entry| entry.name.as_str()).collect();

    assert_eq!(names, vec!["sub", "note.md", "notes.txt", "README.MD"]);
    assert!(entries[0].is_dir);
    assert!(entries[1].size > 0);
}

#[test]
fn skips_hidden_unsupported_and_ignored_directories() {
    let dir = fixture();
    let entries = list_dir(dir.path(), &ListOptions::default()).unwrap();
    let names: Vec<&str> = entries.iter().map(|entry| entry.name.as_str()).collect();

    assert!(!names.contains(&".hidden.md"));
    assert!(!names.contains(&"image.png"));
    assert!(!names.contains(&"node_modules"));
}

#[test]
fn can_include_hidden_and_all_extensions() {
    let dir = fixture();
    let options = ListOptions {
        include_hidden: true,
        extensions: Vec::new(),
        ..ListOptions::default()
    };
    let entries = list_dir(dir.path(), &options).unwrap();
    let names: Vec<&str> = entries.iter().map(|entry| entry.name.as_str()).collect();

    assert!(names.contains(&".hidden.md"));
    assert!(names.contains(&"image.png"));
}

#[test]
fn respects_max_entries() {
    let dir = fixture();
    let options = ListOptions {
        max_entries: 2,
        ..ListOptions::default()
    };
    assert_eq!(list_dir(dir.path(), &options).unwrap().len(), 2);
}

#[test]
fn reports_missing_directory() {
    let dir = tempfile::tempdir().unwrap();
    let error = list_dir(&dir.path().join("nope"), &ListOptions::default()).unwrap_err();
    assert!(matches!(error, Error::Read { .. }), "got {error:?}");
}

#[test]
fn rejects_a_file() {
    let dir = fixture();
    let error = list_dir(&dir.path().join("note.md"), &ListOptions::default()).unwrap_err();
    assert!(matches!(error, Error::NotADirectory(_)), "got {error:?}");
}

#[test]
fn sorts_directories_first_then_case_insensitive() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("zeta.md"), "").unwrap();
    fs::write(dir.path().join("Alpha.md"), "").unwrap();
    fs::create_dir(dir.path().join("beta")).unwrap();

    let entries = list_dir(dir.path(), &ListOptions::default()).unwrap();
    let names: Vec<&str> = entries.iter().map(|entry| entry.name.as_str()).collect();
    assert_eq!(names, vec!["beta", "Alpha.md", "zeta.md"]);
}
