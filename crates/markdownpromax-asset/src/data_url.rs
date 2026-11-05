//! 把图片字节包装成 `data:` URL。
//!
//! 用 data URL 而不是自定义协议，是为了让前端 CSP 保持"只允许 self + data:"，
//! 不需要再注册 `mdimg://`，接入成本最低。

const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// 标准 base64 编码（带 `=` 补齐）。
pub fn encode_base64(input: &[u8]) -> String {
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);

    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let bits = (b0 << 16) | (b1 << 8) | b2;

        out.push(TABLE[(bits >> 18) as usize & 63] as char);
        out.push(TABLE[(bits >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            TABLE[(bits >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[bits as usize & 63] as char
        } else {
            '='
        });
    }

    out
}

/// 扩展名 → MIME。
pub fn mime_for_ext(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    }
}

/// 把字节与扩展名包装成 `data:` URL。
pub fn to_data_url(bytes: &[u8], ext: &str) -> String {
    format!("data:{};base64,{}", mime_for_ext(ext), encode_base64(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_rfc4648_vectors() {
        assert_eq!(encode_base64(b""), "");
        assert_eq!(encode_base64(b"f"), "Zg==");
        assert_eq!(encode_base64(b"fo"), "Zm8=");
        assert_eq!(encode_base64(b"foo"), "Zm9v");
        assert_eq!(encode_base64(b"foob"), "Zm9vYg==");
        assert_eq!(encode_base64(b"fooba"), "Zm9vYmE=");
        assert_eq!(encode_base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn handles_binary_bytes() {
        assert_eq!(encode_base64(&[0u8, 0, 0]), "AAAA");
        assert_eq!(encode_base64(&[255u8, 255, 255]), "////");
    }

    #[test]
    fn builds_data_url_with_mime() {
        assert_eq!(to_data_url(b"foo", "png"), "data:image/png;base64,Zm9v");
        assert_eq!(to_data_url(b"foo", "JPEG"), "data:image/jpeg;base64,Zm9v");
        assert_eq!(
            to_data_url(b"x", "unknown"),
            "data:application/octet-stream;base64,eA=="
        );
    }
}
