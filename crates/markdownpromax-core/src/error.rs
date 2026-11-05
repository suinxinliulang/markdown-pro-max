//! 内核错误类型。

use std::path::PathBuf;

/// 文件层可能出现的错误。
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// 读取失败。
    #[error("无法读取 {path}：{source}")]
    Read {
        /// 出错的路径。
        path: PathBuf,
        /// 底层 IO 错误。
        #[source]
        source: std::io::Error,
    },

    /// 写入失败。
    #[error("无法写入 {path}：{source}")]
    Write {
        /// 出错的路径。
        path: PathBuf,
        /// 底层 IO 错误。
        #[source]
        source: std::io::Error,
    },

    /// 文件在编辑器打开之后被其他程序修改过。
    #[error("文件已被外部修改（期望 mtime={expected}，实际 mtime={actual}）")]
    Conflict {
        /// 编辑器记录的修改时间（毫秒时间戳）。
        expected: u64,
        /// 磁盘上实际的修改时间。
        actual: u64,
    },

    /// 目标路径存在但不是普通文件。
    #[error("不是普通文件：{0}")]
    NotAFile(PathBuf),

    /// 目标路径不是目录。
    #[error("不是目录：{0}")]
    NotADirectory(PathBuf),

    /// 新建时的名字不合法。
    #[error("名字不合法：{0}")]
    InvalidName(String),

    /// 目标已经存在。
    #[error("已存在同名文件或目录：{0}")]
    AlreadyExists(PathBuf),

    /// 文件超过可加载上限。
    #[error("文件过大：{0} 字节（上限 {1} 字节）")]
    TooLarge(u64, u64),
}

/// 内核的统一结果类型。
pub type Result<T> = std::result::Result<T, Error>;

impl Error {
    pub(crate) fn read(path: &std::path::Path, source: std::io::Error) -> Self {
        Error::Read {
            path: path.to_path_buf(),
            source,
        }
    }

    pub(crate) fn write(path: &std::path::Path, source: std::io::Error) -> Self {
        Error::Write {
            path: path.to_path_buf(),
            source,
        }
    }
}
