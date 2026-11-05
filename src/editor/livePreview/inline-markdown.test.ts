import { describe, expect, it } from 'vitest'
import { escapeHtml, isSafeHref, renderInlineMarkdown } from './inline-markdown'

describe('renderInlineMarkdown', () => {
  it('粗体、斜体、删除线', () => {
    expect(renderInlineMarkdown('**粗**')).toBe('<strong>粗</strong>')
    expect(renderInlineMarkdown('__粗__')).toBe('<strong>粗</strong>')
    expect(renderInlineMarkdown('*斜*')).toBe('<em>斜</em>')
    expect(renderInlineMarkdown('_斜_')).toBe('<em>斜</em>')
    expect(renderInlineMarkdown('~~删~~')).toBe('<del>删</del>')
  })

  it('行内代码内部不再解析', () => {
    expect(renderInlineMarkdown('`**不粗**`')).toBe('<code>**不粗**</code>')
    expect(renderInlineMarkdown('`<b>x</b>`')).toBe('<code>&lt;b&gt;x&lt;/b&gt;</code>')
  })

  it('行内公式渲染成 KaTeX', () => {
    const html = renderInlineMarkdown('$a^2+b^2$')
    expect(html).toContain('cm-lp-math')
    expect(html).toContain('katex')
  })

  it('公式里的 < 不会被转义破坏', () => {
    const html = renderInlineMarkdown('$a < b$')
    expect(html).toContain('katex')
  })

  it('链接保留为可点击元素', () => {
    const html = renderInlineMarkdown('[官网](https://example.com)')
    expect(html).toContain('data-href="https://example.com"')
    expect(html).toContain('>官网</a>')
  })

  it('非安全协议只保留文本', () => {
    expect(renderInlineMarkdown('[点我](javascript:alert(1))')).toBe('点我')
    expect(renderInlineMarkdown('[点我](data:text/html,x)')).toBe('点我')
  })

  it('文档里的 HTML 被转义成文本', () => {
    expect(renderInlineMarkdown('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    )
    expect(renderInlineMarkdown('**<b>粗</b>**')).toBe('<strong>&lt;b&gt;粗&lt;/b&gt;</strong>')
  })

  it('图片降级为 alt 文本', () => {
    expect(renderInlineMarkdown('![图示](a.png)')).toBe('图示')
  })

  it('混合内容', () => {
    const html = renderInlineMarkdown('**粗**、`代码`、[链接](https://a.dev) 和 ~~删~~')
    expect(html).toBe('<strong>粗</strong>、<code>代码</code>、<a class="cm-lp-link" data-href="https://a.dev" title="https://a.dev">链接</a> 和 <del>删</del>')
  })

  it('未闭合标记保持原样', () => {
    expect(renderInlineMarkdown('**没闭合')).toBe('**没闭合')
    expect(renderInlineMarkdown('`没闭合')).toBe('`没闭合')
  })
})

describe('escapeHtml / isSafeHref', () => {
  it('转义特殊字符', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  })

  it('只放行安全协议', () => {
    expect(isSafeHref('https://a.dev')).toBe(true)
    expect(isSafeHref('http://a.dev')).toBe(true)
    expect(isSafeHref('mailto:a@b.c')).toBe(true)
    expect(isSafeHref('#anchor')).toBe(true)
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
    expect(isSafeHref('data:text/html,x')).toBe(false)
  })
})
