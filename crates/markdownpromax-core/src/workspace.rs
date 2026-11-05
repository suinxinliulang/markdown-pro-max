//! 工作区目录扫描。
//!
//! 只做「列一层目录」这一件事，由前端按需展开。这样即使打开一个巨大的仓库，
//! 也不会一次性递归扫全盘。

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};

/// 目录里的一项。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    /// 文件/目录名。
    pub name: String,
    /// 绝对路径。
    pub path: PathBuf,
    /// 是否为目录。
    pub is_dir: bool,
    /// 文件字节数（目录为 0）。
    pub size: u64,
}

/// 扫描选项。
#[derive(Debug, Clone)]
pub struct ListOptions {
    /// 单层最多返回多少项。
    pub max_entries: usize,
    /// 是否包含隐藏文件（以 `.` 开头）。
    pub include_hidden: bool,
    /// 只列出这些扩展名；为空表示不过滤。
    pub extensions: Vec<String>,
    /// 直接跳过这些目录名。
    pub skip_dirs: Vec<String>,
}

impl Default for ListOptions {
    fn default() -> Self {
        Self {
            max_entries: 2000,
            include_hidden: false,
            extensions: vec![
                "md".to_string(),
                "markdown".to_string(),
                "mdx".to_string(),
                "txt".to_string(),
            ],
            skip_dirs: vec![
                "node_modules".to_string(),
                "target".to_string(),
                "dist".to_string(),
                ".git".to_string(),
            ],
        }
    }
}

/// 列出 `dir` 下的一层内容。
///
/// 排序：目录在前、文件在后，同类按名称忽略大小写升序。
pub fn list_dir(dir: &Path, options: &ListOptions) -> Result<Vec<Entry>> {
    let meta = fs::metadata(dir).map_err(|error| Error::read(dir, error))?;
    if !meta.is_dir() {
        return Err(Error::NotADirectory(dir.to_path_buf()));
    }

    let reader = fs::read_dir(dir).map_err(|error| Error::read(dir, error))?;
    let mut entries: Vec<Entry> = Vec::new();

    for item in reader {
        if entries.len() >= options.max_entries {
            break;
        }

        let item = match item {
            Ok(item) => item,
            Err(_) => continue,
        };

        let name = item.file_name().to_string_lossy().to_string();
        if !options.include_hidden && name.starts_with('.') {
            continue;
        }

        let file_type = match item.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        // 跳过符号链接：避免环，也避免把工作区外的内容列出来
        if file_type.is_symlink() {
            continue;
        }

        let path = item.path();
        let is_dir = file_type.is_dir();

        if is_dir {
            if options.skip_dirs.iter().any(|skip| skip == &name) {
                continue;
            }
        } else if !options.extensions.is_empty() {
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !options
                .extensions
                .iter()
                .any(|allowed| allowed.eq_ignore_ascii_case(&extension))
            {
                continue;
            }
        }

        let size = if is_dir {
            0
        } else {
            item.metadata().map(|meta| meta.len()).unwrap_or(0)
        };

        entries.push(Entry {
            name,
            path,
            is_dir,
            size,
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}
