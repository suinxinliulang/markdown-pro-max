// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { isSafeUrl, sanitizeHtml } from './sanitize'

describe('isSafeUrl', () => {
  it('放行常见安全协议与相对路径', () => {
    expect(isSafeUrl('https://example.com')).toBe(true)
    expect(isSafeUrl('mailto:a@b.c')).toBe(true)
    expect(isSafeUrl('#anchor')).toBe(true)
    expect(isSafeUrl('./assets/a.png')).toBe(true)
    expect(isSafeUrl('data:image/png;base64,AAAA')).toBe(true)
  })

  it('拦截脚本类协议', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeUrl(' JAVASCRIPT:alert(1)')).toBe(false)
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false)
    expect(isSafeUrl('data:text/html,<script>x</script>')).toBe(false)
  })
})

describe('sanitizeHtml', () => {
  it('保留允许的标签与样式', () => {
    const html = sanitizeHtml('<kbd>Ctrl</kbd> 与 <span style="color: red">红</span>')
    expect(html).toContain('<kbd>')
    expect(html).toContain('style')
    expect(html).toContain('红')
  })

  it('丢弃 script / iframe / style 标签及其内容', () => {
    const html = sanitizeHtml('<script>alert(1)</script><iframe src="x"></iframe><style>body{}</style>安全文字')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<style')
    expect(html).toContain('安全文字')
  })

  it('清掉所有事件处理器', () => {
    const html = sanitizeHtml('<img src="a.png" onerror="alert(1)" onclick="x()">')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onclick')
    expect(html).toContain('src')
  })

  it('把未知标签拆壳、保留文字', () => {
    const html = sanitizeHtml('<custom-tag>保留我</custom-tag>')
    expect(html).not.toContain('custom-tag')
    expect(html).toContain('保留我')
  })

  it('移除 javascript: 链接的 href', () => {
    const html = sanitizeHtml('<a href="javascript:alert(1)">点我</a>')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('点我')
  })

  it('给链接补上 noopener', () => {
    const html = sanitizeHtml('<a href="https://example.com">x</a>')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('丢弃 SVG / MathML 命名空间内容（mXSS 入口）', () => {
    const html = sanitizeHtml('<svg><image href="x" onerror="alert(1)"/></svg><math><mi>x</mi></math>ok')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('<math')
    expect(html).toContain('ok')
  })

  it('去掉样式里的 url()', () => {
    const html = sanitizeHtml('<span style="background: url(https://evil.example/x)">x</span>')
    expect(html).not.toContain('url(')
  })
})
