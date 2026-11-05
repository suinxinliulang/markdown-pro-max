/**
 * 行内 Markdown → HTML（纯函数）。
 *
 * 用于表格单元格这类"没有 CodeMirror 装饰可用"的位置。
 * 处理顺序很关键：先把行内代码和公式抠成占位符（它们的内部不再解析），
 * 再整体转义 HTML，最后才套用行内语法——这样文档里的 `<script>` 只会变成文本。
 */

import katex from 'katex'

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** 转义 HTML 特殊字符。 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character)
}

/** 只放行 http(s)、mailto 和页内锚点，其余（javascript:、data: 等）当作普通文本。 */
export function isSafeHref(href: string): boolean {
  const value = href.trim()
  if (value.startsWith('#')) return true
  return /^(https?:|mailto:)/i.test(value)
}

function renderMath(tex: string): string {
  try {
    return `<span class="cm-lp-math">${katex.renderToString(tex, {
      throwOnError: false,
      strict: 'ignore',
      output: 'html',
    })}</span>`
  } catch {
    return `<span class="cm-lp-math cm-lp-math-error">${escapeHtml(tex)}</span>`
  }
}

/**
 * 渲染一段行内 Markdown。
 *
 * 支持：行内代码、行内公式、粗体、斜体、删除线、链接、图片（降级为 alt 文本）。
 */
export function renderInlineMarkdown(source: string): string {
  const stash: string[] = []
  const keep = (html: string): string => `\u0000${stash.push(html) - 1}\u0000`

  // 1) 行内公式（未转义的 $），先抠出来
  let text = source.replace(/(^|[^\\$])\$([^$\n]+)\$/g, (_match, prefix: string, tex: string) => {
    return `${prefix}${keep(renderMath(tex))}`
  })

  // 2) 行内代码，同样先抠出来
  text = text.replace(/`([^`]+)`/g, (_match, code: string) => keep(`<code>${escapeHtml(code)}</code>`))

  // 3) 剩下的按纯文本转义，文档里的 HTML 只会变成文本
  text = escapeHtml(text)

  // 4) 链接与图片（alt 文本降级显示，单元格里不加载图片）
  text = text.replace(/!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g, (_match, alt: string) => alt)
  text = text.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_match, label: string, href: string) => {
    if (!isSafeHref(href)) return label
    return `<a class="cm-lp-link" data-href="${href}" title="${href}">${label}</a>`
  })

  // 5) 强调
  text = text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')

  // 6) 还原占位符
  return text.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => stash[Number(index)] ?? '')
}
