import type { Extension } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

/** 主题名，同时决定 CM6 的暗色标记与 HTML 的 `data-theme`。 */
export type ThemeName = 'light' | 'dark'

/** 编辑器的外观。颜色全部走 CSS 变量，方便 M3 做主题文件。 */
function baseTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: '15px',
        backgroundColor: 'var(--editor-bg)',
        color: 'var(--editor-fg)',
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        lineHeight: '1.75',
        padding: '16px 0 40vh',
      },
      // 响应式：窗口不超 1400px 时铺满，超宽屏才回到居中版心
      '.cm-content': {
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '0 40px',
        caretColor: 'var(--accent)',
      },
      '.cm-line': { padding: '0' },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--editor-gutter)',
        border: 'none',
        paddingLeft: '8px',
      },
      '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--accent)' },
      '.cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection) !important' },
      '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--selection) !important' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: 'var(--selection)',
        outline: 'none',
      },
      '.cm-panels': { backgroundColor: 'var(--bg-elevated)', color: 'var(--fg)' },
      '.cm-searchMatch': { backgroundColor: 'var(--search-match)' },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--search-match-active)' },
      '.cm-foldPlaceholder': { backgroundColor: 'var(--bg-elevated)', border: 'none' },
    },
    { dark },
  )
}

const lightHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.7em', fontWeight: '700' },
  { tag: t.heading2, fontSize: '1.45em', fontWeight: '700' },
  { tag: t.heading3, fontSize: '1.25em', fontWeight: '650' },
  { tag: t.heading4, fontSize: '1.12em', fontWeight: '650' },
  { tag: [t.heading5, t.heading6, t.heading], fontWeight: '650' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: '#2563eb', textDecoration: 'underline' },
  { tag: t.url, color: '#0f766e' },
  { tag: t.monospace, color: '#b4341f', backgroundColor: '#f3f4f6', padding: '1px 3px', borderRadius: '3px' },
  { tag: t.quote, color: '#6b7280', fontStyle: 'italic' },
  { tag: t.list, color: '#6b7280' },
  { tag: t.contentSeparator, color: '#9ca3af' },
  { tag: t.processingInstruction, color: '#9aa0a6' },
])

const darkHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.7em', fontWeight: '700', color: '#e6edf3' },
  { tag: t.heading2, fontSize: '1.45em', fontWeight: '700', color: '#e6edf3' },
  { tag: t.heading3, fontSize: '1.25em', fontWeight: '650', color: '#dbe3ec' },
  { tag: t.heading4, fontSize: '1.12em', fontWeight: '650', color: '#dbe3ec' },
  { tag: [t.heading5, t.heading6, t.heading], fontWeight: '650', color: '#dbe3ec' },
  { tag: t.strong, fontWeight: '700', color: '#f0f6fc' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: '#8b949e' },
  { tag: t.link, color: '#58a6ff', textDecoration: 'underline' },
  { tag: t.url, color: '#56d4b8' },
  { tag: t.monospace, color: '#ffa198', backgroundColor: '#2b3038', padding: '1px 3px', borderRadius: '3px' },
  { tag: t.quote, color: '#8b949e', fontStyle: 'italic' },
  { tag: t.list, color: '#8b949e' },
  { tag: t.contentSeparator, color: '#6e7681' },
  { tag: t.processingInstruction, color: '#6e7681' },
])

/** 按主题生成一组 CM6 扩展。 */
export function editorTheme(mode: ThemeName): Extension {
  return [baseTheme(mode === 'dark'), syntaxHighlighting(mode === 'dark' ? darkHighlight : lightHighlight)]
}
