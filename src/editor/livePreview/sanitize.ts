/**
 * 文档内 HTML 的清洗（allowlist 策略）。
 *
 * 为什么不直接用 DOMPurify：它依赖真实浏览器的 DOM 特性探测，
 * 在测试环境（happy-dom）里会静默降级——实测连 `onerror` 都清不掉。
 * 安全相关的路径必须能被测试钉住，所以这里用一份显式的 allowlist 实现。
 *
 * 防线不止这一层：生产 CSP 是 `script-src 'self'`，内联事件处理器本身就跑不起来。
 */

/** 直接丢弃（连内容一起）的标签。 */
const DROP_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'link',
  'meta',
  'base',
  'noscript',
  'template',
  'title',
  'head',
])

/** 允许保留的标签，其余标签会被"拆壳"（保留子节点）。 */
const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'del',
  'code',
  'pre',
  'kbd',
  'mark',
  'small',
  'sub',
  'sup',
  'span',
  'div',
  'p',
  'br',
  'hr',
  'blockquote',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'img',
  'figure',
  'figcaption',
  'details',
  'summary',
])

/** 允许保留的属性。 */
const ALLOWED_ATTRS = new Set([
  'href',
  'src',
  'alt',
  'title',
  'class',
  'style',
  'align',
  'width',
  'height',
  'colspan',
  'rowspan',
  'start',
  'reversed',
])

const XHTML = 'http://www.w3.org/1999/xhtml'
const SAFE_URL = /^(https?:|mailto:|tel:|#)/i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** 判断 URL 是否安全（相对路径一律放行，scheme 只放行白名单）。 */
export function isSafeUrl(value: string): boolean {
  const url = value.trim()
  if (!url) return false
  if (/^data:image\//i.test(url)) return true
  if (!HAS_SCHEME.test(url)) return true
  return SAFE_URL.test(url)
}

/** 清洗一段 HTML，返回可安全插入 DOM 的字符串。 */
export function sanitizeHtml(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html
  cleanChildren(template.content)
  return template.innerHTML
}

function cleanChildren(root: ParentNode): void {
  for (const node of Array.from(root.children)) {
    cleanElement(node)
  }
}

function cleanElement(element: Element): void {
  // 非 HTML 命名空间（SVG / MathML）一律拆掉：mXSS 主要靠这里进来
  if (element.namespaceURI !== XHTML) {
    element.remove()
    return
  }

  const tag = element.tagName.toLowerCase()
  if (DROP_TAGS.has(tag)) {
    element.remove()
    return
  }

  cleanChildren(element)

  if (!ALLOWED_TAGS.has(tag)) {
    unwrap(element)
    return
  }

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase()
    const value = attribute.value

    if (!ALLOWED_ATTRS.has(name)) {
      element.removeAttribute(attribute.name)
      continue
    }
    if ((name === 'href' || name === 'src') && !isSafeUrl(value)) {
      element.removeAttribute(attribute.name)
      continue
    }
    if (name === 'style' && /url\s*\(/i.test(value)) {
      element.removeAttribute(attribute.name)
    }
  }

  if (tag === 'a') {
    element.setAttribute('rel', 'noopener noreferrer')
    element.setAttribute('target', '_blank')
  }
}

/** 去掉标签本身但保留其子节点。 */
function unwrap(element: Element): void {
  const parent = element.parentNode
  if (!parent) return
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element)
  }
  parent.removeChild(element)
}
