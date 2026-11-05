//! 行尾策略。
//!
//! 编辑器内部统一使用 `\n`；打开时记录原始行尾，保存时再还原，
//! 避免"我只是打开一个 Windows 文件，保存后整个仓库的 diff 都变了"。

/// 文件使用的行尾风格。
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Eol {
    /// `\n`（Unix / macOS）。
    #[default]
    Lf,
    /// `\r\n`（Windows）。
    CrLf,
    /// `\r`（经典 macOS）。
    Cr,
}

impl Eol {
    /// 用于持久化与 IPC 的稳定字符串。
    pub fn as_str(self) -> &'static str {
        match self {
            Eol::Lf => "lf",
            Eol::CrLf => "crlf",
            Eol::Cr => "cr",
        }
    }

    /// 从 IPC/配置文件里的字符串还原。
    pub fn parse(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "lf" => Some(Eol::Lf),
            "crlf" => Some(Eol::CrLf),
            "cr" => Some(Eol::Cr),
            _ => None,
        }
    }

    /// 探测文本里占主导的行尾；没有换行时默认 LF。
    pub fn detect(text: &str) -> Self {
        let crlf = text.matches("\r\n").count();
        let cr = text.matches('\r').count() - crlf;
        let lf = text.matches('\n').count() - crlf;

        if crlf == 0 && cr == 0 {
            return Eol::Lf;
        }
        if crlf >= cr && crlf >= lf {
            Eol::CrLf
        } else if cr > lf {
            Eol::Cr
        } else {
            Eol::Lf
        }
    }

    /// 把任意行尾归一成 `\n`，返回新字符串。
    pub fn normalize(self, text: &str) -> String {
        if text.contains('\r') {
            text.replace("\r\n", "\n").replace('\r', "\n")
        } else {
            text.to_owned()
        }
    }

    /// 把 `\n` 还原成该文件的行尾风格（入参应先 `normalize`）。
    pub fn apply(self, text: &str) -> String {
        let normalized = self.normalize(text);
        match self {
            Eol::Lf => normalized,
            Eol::CrLf => normalized.replace('\n', "\r\n"),
            Eol::Cr => normalized.replace('\n', "\r"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_dominant_style() {
        assert_eq!(Eol::detect("a\nb\nc"), Eol::Lf);
        assert_eq!(Eol::detect("a\r\nb\r\nc"), Eol::CrLf);
        assert_eq!(Eol::detect("a\rb\rc"), Eol::Cr);
        assert_eq!(Eol::detect("no newline"), Eol::Lf);
    }

    #[test]
    fn normalize_and_apply_roundtrip() {
        let text = "a\r\nb\rc\n";
        assert_eq!(Eol::CrLf.normalize(text), "a\nb\nc\n");
        assert_eq!(Eol::CrLf.apply("a\nb\n"), "a\r\nb\r\n");
        assert_eq!(Eol::Cr.apply("a\nb\n"), "a\rb\r");
        assert_eq!(Eol::Lf.apply("a\nb\n"), "a\nb\n");
    }
}
