// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { sanitizeMermaidSvg } from './mermaid-widget'

const SVG = `<svg xmlns="http://www.w3.org/2000/svg">
  <style>#m .nodeLabel{fill:#333}</style>
  <g id="m">
    <g class="node"><rect width="10" height="10"/><text class="nodeLabel">纯文本标签</text></g>
    <g class="node"><foreignObject><div class="nodeLabel">架构</div></foreignObject></g>
  </g>
</svg>`

describe('sanitizeMermaidSvg', () => {
  it('保留文字、样式和 foreignObject 内容', () => {
    const clean = sanitizeMermaidSvg(SVG)
    expect(clean).toContain('纯文本标签')
    expect(clean).toContain('架构')
    expect(clean).toContain('<style')
    expect(clean).toContain('foreignObject')
  })

  it('移除 script 标签', () => {
    const clean = sanitizeMermaidSvg('<svg><script>alert(1)</script><text>ok</text></svg>')
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('alert(1)')
    expect(clean).toContain('ok')
  })

  it('移除事件属性与 javascript: 链接', () => {
    const clean = sanitizeMermaidSvg(
      '<svg><g onclick="alert(1)"><a href="javascript:alert(2)"><text>x</text></a></g></svg>',
    )
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('javascript:')
    expect(clean).toContain('x')
  })
})
