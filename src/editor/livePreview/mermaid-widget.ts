import type { EditorView } from '@codemirror/view'
import { WidgetType } from '@codemirror/view'
import { clickable } from './clickable'

/**
 * Mermaid 图表 widget。
 *
 * Mermaid 必须跑在浏览器里（依赖 DOM 测量），体积也大（gzip ~1MB），所以：
 * - 用动态 `import('mermaid')` 懒加载，首屏不含它；
 * - 渲染串行排队 + 按「主题 + 源码」哈希缓存，避免滚动时反复渲染；
 * - SVG 插入前做一次轻量清洗（保留文本/样式，移除脚本与事件属性）。
 */

interface MermaidApi {
  initialize(config: Record<string, unknown>): void
  render(id: string, text: string): Promise<{ svg: string }>
}

let loader: Promise<MermaidApi> | null = null
const svgCache = new Map<string, string>()
let queue: Promise<unknown> = Promise.resolve()

function loadMermaid(): Promise<MermaidApi> {
  if (!loader) {
    loader = import('mermaid').then((module) => {
      const api = (module.default ?? module) as unknown as MermaidApi
      api.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'default',
        fontFamily: 'inherit',
        // 全局开关（mermaid 12 起 flowchart.htmlLabels 已废弃）
        htmlLabels: false,
      })
      return api
    })
  }
  return loader
}

/** 渲染一张图，返回已清洗的 SVG 字符串。相同输入命中缓存。 */
export function renderDiagram(source: string, dark: boolean): Promise<string> {
  const key = `${dark ? 'dark' : 'light'}\u0000${source}`
  const cached = svgCache.get(key)
  if (cached) return Promise.resolve(cached)

  const task = queue.then(async () => {
    const mermaid = await loadMermaid()
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      fontFamily: 'inherit',
      // 用 SVG <text> 画标签，而不是 foreignObject 里的 HTML。
      // mermaid 12 起 flowchart.htmlLabels 已废弃，必须设全局项。
      htmlLabels: false,
    })

    const id = `cm-lp-mermaid-${Math.random().toString(36).slice(2, 10)}`
    const { svg } = await mermaid.render(id, source)
    const clean = sanitizeMermaidSvg(svg)
    svgCache.set(key, clean)
    return clean
  })

  // 队列不能因为一次失败就断掉
  queue = task.catch(() => undefined)
  return task
}

/**
 * 清洗 mermaid 产出的 SVG。
 *
 * 不用 DOMPurify：它按 HTML 规则解析字符串，会把 `<style>` 与
 * `foreignObject` 里的 HTML 一并丢掉，结果就是"有框没字"。
 * 这里改成 DOM 层面的定点清洗——只移除脚本和事件属性，文本与样式原样保留，
 * 再加上 mermaid 自身的 `securityLevel: 'strict'` 与应用的 CSP（`script-src 'self'`）双重兜底。
 */
export function sanitizeMermaidSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement

  if (!root || root.tagName.toLowerCase() !== 'svg') {
    return svg
  }

  stripUnsafeNodes(root)
  return new XMLSerializer().serializeToString(root)
}

/**
 * 把节点标签对齐到节点图形的正中心。
 *
 * Mermaid 生成的标签定位依赖它自己的文本测量，换字体/换 WebView 时容易偏，
 * 这里在插入 DOM 之后按实际渲染盒重新对一次——只平移标签组，不改节点尺寸。
 */
export function centerNodeLabels(container: Element): void {
  const svg = container.querySelector('svg')
  if (!svg) return

  const svgRect = svg.getBoundingClientRect()
  const viewBox = (svg as SVGSVGElement).viewBox?.baseVal
  const scale = viewBox && viewBox.width > 0 && svgRect.width > 0 ? svgRect.width / viewBox.width : 1
  if (!Number.isFinite(scale) || scale <= 0) return

  for (const node of Array.from(svg.querySelectorAll('g.node'))) {
    const shape = node.querySelector(':scope > rect, :scope > circle, :scope > ellipse, :scope > polygon, :scope > path')
    const label = node.querySelector(':scope > g.label') ?? node.querySelector(':scope > text')
    if (!shape || !label) continue

    const shapeRect = shape.getBoundingClientRect()
    const labelRect = label.getBoundingClientRect()
    if (shapeRect.width <= 0 || shapeRect.height <= 0 || labelRect.width <= 0 || labelRect.height <= 0) continue

    const dx = (shapeRect.left + shapeRect.width / 2 - (labelRect.left + labelRect.width / 2)) / scale
    const dy = (shapeRect.top + shapeRect.height / 2 - (labelRect.top + labelRect.height / 2)) / scale
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue

    const offset = `translate(${dx.toFixed(2)}, ${dy.toFixed(2)})`
    const existing = label.getAttribute('transform')
    label.setAttribute('transform', existing ? `${offset} ${existing}` : offset)
  }
}

function stripUnsafeNodes(root: Element): void {
  for (const script of Array.from(root.querySelectorAll('script'))) {
    script.remove()
  }

  const elements: Element[] = [root, ...Array.from(root.querySelectorAll('*'))]
  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (name.startsWith('on') || value.startsWith('javascript:') || value.startsWith('data:text/html')) {
        element.removeAttribute(attribute.name)
      }
    }
  }
}

/** 清空缓存（切换主题后由外部按需调用；当前按 key 区分，可不调用）。 */
export function clearDiagramCache(): void {
  svgCache.clear()
}

export class MermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly pos: number,
  ) {
    super()
  }

  eq(other: MermaidWidget): boolean {
    return other.source === this.source
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-lp-block cm-lp-mermaid'

    const body = document.createElement('div')
    body.className = 'cm-lp-mermaid-body'
    body.textContent = '图形渲染中…'
    wrapper.append(body)

    clickable(wrapper, view, this.pos)

    const dark = document.documentElement.dataset.theme === 'dark'
    renderDiagram(this.source, dark)
      .then((svg) => {
        // 组件可能已经被 CodeMirror 回收，别往游离节点里写
        if (!body.isConnected) return
        body.innerHTML = svg
        centerNodeLabels(body)
        // 字体加载完成后尺寸可能变化，再对一次
        void document.fonts?.ready?.then(() => {
          if (!body.isConnected) return
          centerNodeLabels(body)
          view.requestMeasure()
        })
        body.classList.add('is-ready')
        // 图形从占位变成真实 SVG，高度变化必须重新测量，否则点击会错行
        view.requestMeasure()
      })
      .catch((error: unknown) => {
        if (!body.isConnected) return
        const message = error instanceof Error ? error.message : String(error)
        body.textContent = `Mermaid 渲染失败：${message}`
        body.classList.add('is-error')
        view.requestMeasure()
      })

    return wrapper
  }

  ignoreEvent(): boolean {
    return false
  }
}
