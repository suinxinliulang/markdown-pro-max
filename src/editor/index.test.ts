// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownEditor } from './index'

/**
 * 端到端验证 CodeMirror 视图：挂载真实 EditorView，换文档，断言装饰真的落到了 DOM 上。
 * 这是"Live Preview 在浏览器里能跑"最接近的可执行证据（Node + happy-dom，无需真实浏览器）。
 */

const SAMPLE = ['# 标题', '', '一段 **粗体** 文本。', '', '```js', 'const a = 1', '```', ''].join('\n')

let current: MarkdownEditor | null = null
let host: HTMLElement | null = null

afterEach(() => {
  current?.destroy()
  current = null
  host?.remove()
  host = null
})

function mount(mode: 'preview' | 'source' = 'preview') {
  host = document.createElement('div')
  document.body.append(host)
  current = new MarkdownEditor({
    parent: host,
    theme: 'light',
    mode,
    onDocChanged: () => {},
    onCursor: () => {},
    onSave: () => {},
  })
  return current
}

describe('MarkdownEditor', () => {
  it('挂载后生成编辑区', () => {
    const editor = mount()
    editor.setText(SAMPLE)
    expect(host?.querySelector('.cm-editor')).not.toBeNull()
    expect(host?.querySelectorAll('.cm-line').length).toBeGreaterThan(0)
  })

  it('光标在标题行时保留标记符但变暗', () => {
    const editor = mount('preview')
    editor.setText(SAMPLE) // 光标落在文档开头 = 标题行

    const heading = host?.querySelector('.cm-line.cm-lp-h1')
    expect(heading).not.toBeNull()
    expect(heading?.textContent).toBe('# 标题')
    expect(heading?.querySelector('.cm-lp-mark')).not.toBeNull()
  })

  it('光标离开标题行后隐藏标记符，代码块变成卡片', () => {
    const editor = mount('preview')
    editor.setText(SAMPLE)
    editor.view.dispatch({ selection: { anchor: SAMPLE.length } })

    const heading = host?.querySelector('.cm-line.cm-lp-h1')
    expect(heading?.textContent).toBe('标题')

    expect(host?.querySelector('.cm-lp-code')).not.toBeNull()
    expect(host?.querySelector('.cm-lp-code pre')?.textContent).toBe('const a = 1')
  })

  it('源码模式下不加任何 Live Preview 装饰', () => {
    const editor = mount('source')
    editor.setText(SAMPLE)

    expect(host?.querySelector('.cm-lp-h1')).toBeNull()
    expect(host?.querySelector('.cm-lp-code')).toBeNull()
    // 源码模式能看到 `#`
    const text = host?.querySelector('.cm-content')?.textContent ?? ''
    expect(text).toContain('#')
  })

  it('可以运行时切换模式', () => {
    const editor = mount('source')
    editor.setText(SAMPLE)
    expect(host?.querySelector('.cm-lp-h1')).toBeNull()

    editor.setMode('preview')
    expect(host?.querySelector('.cm-line.cm-lp-h1')).not.toBeNull()
  })

  it('公式、块级公式与图片在所见即所得模式下落成真实 DOM', () => {
    const editor = mount('preview')
    editor.setText(['# 标题', '', '行内 $E=mc^2$ 公式', '', '$$', 'x^2 + y^2', '$$', '', '![示意图](images/a.png)', ''].join('\n'))

    expect(host?.querySelector('.cm-lp-math .katex')).not.toBeNull()
    expect(host?.querySelector('.cm-lp-math-block .katex-display')).not.toBeNull()
    expect(host?.querySelector('.cm-lp-image')).not.toBeNull()
  })

  it('setText 不触发置脏回调', () => {
    let changes = 0
    host = document.createElement('div')
    document.body.append(host)
    current = new MarkdownEditor({
      parent: host,
      theme: 'light',
      mode: 'preview',
      onDocChanged: () => {
        changes += 1
      },
      onCursor: () => {},
      onSave: () => {},
    })
    current.setText(SAMPLE)
    expect(changes).toBe(0)

    current.view.dispatch({ changes: { from: 0, insert: 'x' } })
    expect(changes).toBe(1)
  })
})
