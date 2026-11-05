//! 编码探测与往返转换。
//!
//! 策略：先看 BOM，再尝试严格 UTF-8，最后交给 `chardetng` 猜测。
//! 这样常见的 UTF-8 文件永远不会被误判，而 Windows 上的 GBK 老文件也能正确打开。

use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use encoding_rs::Encoding;

/// 文件开头的字节序标记。
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Bom {
    /// 无 BOM。
    #[default]
    None,
    /// UTF-8 BOM（EF BB BF）。
    Utf8,
    /// UTF-16 小端 BOM（FF FE）。
    Utf16Le,
    /// UTF-16 大端 BOM（FE FF）。
    Utf16Be,
}

impl Bom {
    /// BOM 的原始字节。
    pub fn bytes(self) -> &'static [u8] {
        match self {
            Bom::None => b"",
            Bom::Utf8 => b"\xEF\xBB\xBF",
            Bom::Utf16Le => b"\xFF\xFE",
            Bom::Utf16Be => b"\xFE\xFF",
        }
    }

    /// 是否为 UTF-16 家族（写回时需要走 UTF-16 编码路径）。
    fn is_utf16(self) -> bool {
        matches!(self, Bom::Utf16Le | Bom::Utf16Be)
    }
}

/// 文件编码。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Charset {
    /// `encoding_rs` 的规范名，例如 `UTF-8`、`GBK`、`UTF-16LE`。
    pub name: &'static str,
    /// 该文件使用的 BOM。
    pub bom: Bom,
}

impl Default for Charset {
    fn default() -> Self {
        Self::UTF8
    }
}

impl Charset {
    /// 无 BOM 的 UTF-8，新文件的默认值。
    pub const UTF8: Charset = Charset {
        name: "UTF-8",
        bom: Bom::None,
    };

    /// 底层 `encoding_rs` 编码对象。
    pub fn encoding(self) -> &'static Encoding {
        Encoding::for_label(self.name.as_bytes()).unwrap_or(encoding_rs::UTF_8)
    }

    /// 用于界面上展示的名字。
    pub fn label(self) -> &'static str {
        self.name
    }
}

/// 解码结果。
#[derive(Debug, Clone)]
pub struct Decoded {
    /// 解码后的文本。
    pub text: String,
    /// 探测到的编码，保存时应原样回写。
    pub charset: Charset,
}

/// 把文件字节解码成字符串。
///
/// 顺序：BOM → 严格 UTF-8 → `chardetng` 猜测（失败则按 UTF-8 有损解码）。
pub fn decode(bytes: &[u8]) -> Decoded {
    if let Some(rest) = bytes.strip_prefix(Bom::Utf8.bytes()) {
        return Decoded {
            text: lossy_utf8(rest),
            charset: Charset {
                name: "UTF-8",
                bom: Bom::Utf8,
            },
        };
    }

    if let Some(rest) = bytes.strip_prefix(Bom::Utf16Le.bytes()) {
        let (text, _) = encoding_rs::UTF_16LE.decode_with_bom_removal(rest);
        return Decoded {
            text: text.into_owned(),
            charset: Charset {
                name: "UTF-16LE",
                bom: Bom::Utf16Le,
            },
        };
    }

    if let Some(rest) = bytes.strip_prefix(Bom::Utf16Be.bytes()) {
        let (text, _) = encoding_rs::UTF_16BE.decode_with_bom_removal(rest);
        return Decoded {
            text: text.into_owned(),
            charset: Charset {
                name: "UTF-16BE",
                bom: Bom::Utf16Be,
            },
        };
    }

    if let Ok(text) = std::str::from_utf8(bytes) {
        return Decoded {
            text: text.to_owned(),
            charset: Charset::UTF8,
        };
    }

    let mut detector = EncodingDetector::new(Iso2022JpDetection::Deny);
    detector.feed(bytes, true);
    let encoding = detector.guess(None, Utf8Detection::Allow);
    let (text, _, _) = encoding.decode(bytes);
    Decoded {
        text: text.into_owned(),
        charset: Charset {
            name: encoding.name(),
            bom: Bom::None,
        },
    }
}

/// 把字符串编码回字节，并保留原有 BOM / 编码。
///
/// 无法用目标编码表示的字符会被替换成 `�`（`encoding_rs` 的标准行为），
/// 而不是让保存失败——数据可见性优先。
pub fn encode(text: &str, charset: Charset) -> Vec<u8> {
    if charset.bom.is_utf16() {
        let mut out = Vec::with_capacity(text.len() * 2 + 2);
        out.extend_from_slice(charset.bom.bytes());
        for unit in text.encode_utf16() {
            match charset.bom {
                Bom::Utf16Be => out.extend_from_slice(&unit.to_be_bytes()),
                _ => out.extend_from_slice(&unit.to_le_bytes()),
            }
        }
        return out;
    }

    if charset.bom == Bom::Utf8 || charset.encoding() == encoding_rs::UTF_8 {
        let mut out = Vec::with_capacity(text.len() + 3);
        if charset.bom == Bom::Utf8 {
            out.extend_from_slice(Bom::Utf8.bytes());
        }
        out.extend_from_slice(text.as_bytes());
        return out;
    }

    let (bytes, _, _) = charset.encoding().encode(text);
    bytes.into_owned()
}

fn lossy_utf8(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_plain_roundtrip() {
        let src = "hello 世界\n";
        let encoded = encode(src, Charset::UTF8);
        let decoded = decode(&encoded);
        assert_eq!(decoded.text, src);
        assert_eq!(decoded.charset, Charset::UTF8);
    }

    #[test]
    fn utf8_bom_is_preserved() {
        let bytes = [Bom::Utf8.bytes(), "带 BOM".as_bytes()].concat();
        let decoded = decode(&bytes);
        assert_eq!(decoded.text, "带 BOM");
        assert_eq!(decoded.charset.bom, Bom::Utf8);
        assert_eq!(encode(&decoded.text, decoded.charset), bytes);
    }

    #[test]
    fn utf16_le_roundtrip() {
        let charset = Charset {
            name: "UTF-16LE",
            bom: Bom::Utf16Le,
        };
        let bytes = encode("中文 utf16", charset);
        let decoded = decode(&bytes);
        assert_eq!(decoded.text, "中文 utf16");
        assert_eq!(decoded.charset, charset);
        assert_eq!(encode(&decoded.text, decoded.charset), bytes);
    }

    #[test]
    fn gbk_is_detected_and_roundtrips() {
        // “中文测试” 的 GBK 字节
        let gbk: &[u8] = &[0xD6, 0xD0, 0xCE, 0xC4, 0xB2, 0xE2, 0xCA, 0xD4];
        let decoded = decode(gbk);
        assert_eq!(decoded.text, "中文测试");
        assert!(
            decoded.charset.name.eq_ignore_ascii_case("GBK")
                || decoded.charset.name.eq_ignore_ascii_case("gb18030"),
            "unexpected charset: {}",
            decoded.charset.name
        );
        assert_eq!(encode(&decoded.text, decoded.charset), gbk);
    }

    #[test]
    fn empty_file_decodes_to_empty_string() {
        let decoded = decode(b"");
        assert_eq!(decoded.text, "");
        assert_eq!(decoded.charset, Charset::UTF8);
    }

    #[test]
    fn invalid_utf8_does_not_panic() {
        let decoded = decode(&[0xFF, 0xFE, 0x00, 0x41]);
        // 命中 UTF-16LE BOM 分支
        assert_eq!(decoded.charset.name, "UTF-16LE");
    }
}
