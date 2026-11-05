//! 原子写。
//!
//! 直接 `fs::write` 的问题：写到一半断电/崩溃，原文件就废了。
//! 这里的做法是「同目录临时文件 → fsync → rename」，rename 在同一文件系统上是原子的。

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// 原子地把 `bytes` 写入 `path`。
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = match path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p,
        _ => Path::new("."),
    };
    let file_name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "目标路径缺少文件名"))?;
    let tmp = parent.join(format!(
        ".{}.tmp-{}",
        file_name.to_string_lossy(),
        unique_suffix()
    ));

    let result = write_inner(path, parent, &tmp, bytes);
    if result.is_err() {
        // 失败时清理临时文件，避免在文档目录里留下垃圾。
        let _ = fs::remove_file(&tmp);
    }
    result
}

fn write_inner(path: &Path, parent: &Path, tmp: &PathBuf, bytes: &[u8]) -> io::Result<()> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(tmp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);

    // 保留原文件的权限（可执行位、只读属性等）。
    if let Ok(meta) = fs::metadata(path) {
        fs::set_permissions(tmp, meta.permissions())?;
    }

    fs::rename(tmp, path)?;

    // 在 Unix 上再 fsync 一次目录，确保 rename 本身落盘。
    #[cfg(unix)]
    {
        if let Ok(dir) = File::open(parent) {
            let _ = dir.sync_all();
        }
    }

    Ok(())
}

fn unique_suffix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}-{}", std::process::id(), nanos)
}

/// 为 `path` 生成备份文件名：`note.md` → `note.md.bak`。
pub fn backup_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".bak");
    path.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_replaces_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.md");

        write_atomic(&path, b"first").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"first");

        write_atomic(&path, b"second").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"second");

        // 不应残留临时文件
        let leftovers: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".tmp-"))
            .collect();
        assert!(leftovers.is_empty(), "临时文件未清理: {leftovers:?}");
    }

    #[test]
    fn backup_path_appends_suffix() {
        assert_eq!(
            backup_path(Path::new("/tmp/note.md")),
            PathBuf::from("/tmp/note.md.bak")
        );
    }
}
