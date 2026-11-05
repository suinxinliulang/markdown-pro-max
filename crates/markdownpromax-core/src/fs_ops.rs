//! 工作区里的文件操作：新建、删除、复制、移动。
//!
//! 都只接受「父目录 + 名字」这种结构化入参，名字要过 [`validate_name`]，
//! 从根上避免 `../` 之类的路径穿越。

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};

/// 单个文件/目录名的长度上限（字符数）。
const MAX_NAME_CHARS: usize = 200;

/// 校验名字是否可以作为新建的文件/目录名。
///
/// 拒绝：空、`.`、`..`、含路径分隔符、含控制字符、超长。
pub fn validate_name(name: &str) -> Result<&str> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err(Error::InvalidName("名字不能为空".to_string()));
    }
    if trimmed == "." || trimmed == ".." {
        return Err(Error::InvalidName("名字不能是 . 或 ..".to_string()));
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(Error::InvalidName("名字里不能包含路径分隔符".to_string()));
    }
    if trimmed.chars().any(|character| character.is_control()) {
        return Err(Error::InvalidName("名字里不能包含控制字符".to_string()));
    }
    if trimmed.chars().count() > MAX_NAME_CHARS {
        return Err(Error::InvalidName(format!(
            "名字过长（上限 {MAX_NAME_CHARS} 个字符）"
        )));
    }

    Ok(trimmed)
}

fn target_path(parent: &Path, name: &str) -> Result<PathBuf> {
    let name = validate_name(name)?;
    Ok(parent.join(name))
}

/// 在 `parent` 下新建一个空文件，返回新文件路径。
pub fn create_file(parent: &Path, name: &str) -> Result<PathBuf> {
    let path = target_path(parent, name)?;
    if path.exists() {
        return Err(Error::AlreadyExists(path));
    }
    fs::write(&path, b"").map_err(|error| Error::write(&path, error))?;
    Ok(path)
}

/// 在 `parent` 下新建一个目录，返回新目录路径。
pub fn create_directory(parent: &Path, name: &str) -> Result<PathBuf> {
    let path = target_path(parent, name)?;
    if path.exists() {
        return Err(Error::AlreadyExists(path));
    }
    fs::create_dir(&path).map_err(|error| Error::write(&path, error))?;
    Ok(path)
}

/// 删除文件或目录（目录会连同内容一起删）。
pub fn delete_path(path: &Path) -> Result<()> {
    let metadata = fs::metadata(path).map_err(|error| Error::read(path, error))?;
    let result = if metadata.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
    result.map_err(|error| Error::write(path, error))
}

/// 复制文件或目录（目录递归）。
pub fn copy_path(from: &Path, to: &Path) -> Result<()> {
    if to.exists() {
        return Err(Error::AlreadyExists(to.to_path_buf()));
    }

    let metadata = fs::metadata(from).map_err(|error| Error::read(from, error))?;
    if metadata.is_dir() {
        copy_directory(from, to)
    } else {
        fs::copy(from, to)
            .map(|_| ())
            .map_err(|error| Error::write(to, error))
    }
}

fn copy_directory(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir(to).map_err(|error| Error::write(to, error))?;

    let entries = fs::read_dir(from).map_err(|error| Error::read(from, error))?;
    for entry in entries {
        let entry = entry.map_err(|error| Error::read(from, error))?;
        let source = entry.path();
        let destination = to.join(entry.file_name());
        if entry
            .file_type()
            .map(|file_type| file_type.is_dir())
            .unwrap_or(false)
        {
            copy_directory(&source, &destination)?;
        } else {
            fs::copy(&source, &destination)
                .map(|_| ())
                .map_err(|error| Error::write(&destination, error))?;
        }
    }

    Ok(())
}

/// 移动/重命名（剪切粘贴用）。
pub fn move_path(from: &Path, to: &Path) -> Result<()> {
    if to.exists() {
        return Err(Error::AlreadyExists(to.to_path_buf()));
    }
    fs::rename(from, to).map_err(|error| Error::write(to, error))
}
