/**
 * 脑图的树形布局（纯函数）。
 *
 * 典型的"从左到右"紧凑树布局：
 * - 每个节点宽度由文字测量得到，同一层的节点左对齐到同一列；
 * - 叶子按顺序纵向排开，父节点垂直居中于子节点的跨度；
 * - 连线用三次贝塞尔。
 *
 * 不依赖 DOM：文字宽度通过 `measure` 注入，测试里可以给固定值。
 */

import type { MindNode } from './tree'

export interface LayoutOptions {
  fontSize: number
  paddingX: number
  nodeHeight: number
  /** 列间距（父子之间）。 */
  gapX: number
  /** 兄弟节点间距。 */
  gapY: number
  /** 节点最大宽度，超出后文字靠 CSS 截断。 */
  maxNodeWidth: number
  /** 画布四周留白。 */
  margin: number
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  fontSize: 13,
  paddingX: 12,
  nodeHeight: 30,
  gapX: 56,
  gapY: 10,
  maxNodeWidth: 280,
  margin: 24,
}

export interface LayoutNode {
  id: string
  text: string
  depth: number
  x: number
  y: number
  width: number
  height: number
  line: number
}

export interface LayoutEdge {
  from: string
  to: string
  /** SVG path 的 d 属性。 */
  path: string
}

export interface Layout {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
}

interface Measured {
  node: MindNode
  id: string
  depth: number
  width: number
  children: Measured[]
  subtreeHeight: number
}

function buildMeasured(
  node: MindNode,
  depth: number,
  id: string,
  measure: (text: string) => number,
  options: LayoutOptions,
): Measured {
  const textWidth = measure(node.content)
  const width = Math.min(options.maxNodeWidth, Math.max(48, textWidth + options.paddingX * 2))
  return {
    node,
    id,
    depth,
    width,
    children: node.children.map((child, index) => buildMeasured(child, depth + 1, `${id}.${index}`, measure, options)),
    subtreeHeight: 0,
  }
}

function measureHeights(root: Measured, options: LayoutOptions): number {
  if (root.children.length === 0) {
    root.subtreeHeight = options.nodeHeight
    return root.subtreeHeight
  }

  const childrenTotal =
    root.children.reduce((sum, child) => sum + measureHeights(child, options), 0) +
    options.gapY * (root.children.length - 1)

  root.subtreeHeight = Math.max(options.nodeHeight, childrenTotal)
  return root.subtreeHeight
}

function columnWidths(root: Measured): number[] {
  const widths: number[] = []
  const walk = (item: Measured) => {
    widths[item.depth] = Math.max(widths[item.depth] ?? 0, item.width)
    item.children.forEach(walk)
  }
  walk(root)
  return widths
}

/** 计算布局：节点位置、连线路径与整体尺寸。 */
export function layoutMindMap(
  root: MindNode,
  measure: (text: string) => number,
  options: LayoutOptions = DEFAULT_LAYOUT,
): Layout {
  const measured = buildMeasured(root, 0, '0', measure, options)
  measureHeights(measured, options)

  const widths = columnWidths(measured)
  const columnX: number[] = []
  let cursor = options.margin
  for (let depth = 0; depth < widths.length; depth += 1) {
    columnX[depth] = cursor
    cursor += widths[depth] + options.gapX
  }

  const nodes: LayoutNode[] = []
  const edges: LayoutEdge[] = []

  const place = (item: Measured, top: number): number => {
    const x = columnX[item.depth]
    let centerY: number

    if (item.children.length === 0) {
      centerY = top + options.nodeHeight / 2
    } else {
      const used = item.children.reduce((sum, child) => sum + child.subtreeHeight, 0) +
        options.gapY * (item.children.length - 1)
      let childTop = top + (item.subtreeHeight - used) / 2
      const childCenters: number[] = []

      for (const child of item.children) {
        const childCenter = place(child, childTop)
        childCenters.push(childCenter)
        edges.push({
          from: item.id,
          to: child.id,
          path: '',
        })
        childTop += child.subtreeHeight + options.gapY
      }

      centerY = (childCenters[0] + childCenters[childCenters.length - 1]) / 2
    }

    nodes.push({
      id: item.id,
      text: item.node.content,
      depth: item.depth,
      x,
      y: centerY - options.nodeHeight / 2,
      width: item.width,
      height: options.nodeHeight,
      line: item.node.line,
    })

    return centerY
  }

  place(measured, options.margin)

  const byId = new Map(nodes.map((node) => [node.id, node]))
  for (const edge of edges) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to) continue

    const x1 = from.x + from.width
    const y1 = from.y + from.height / 2
    const x2 = to.x
    const y2 = to.y + to.height / 2
    const midX = (x1 + x2) / 2
    edge.path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
  }

  const lastColumn = widths.length - 1
  return {
    nodes,
    edges,
    width: columnX[lastColumn] + widths[lastColumn] + options.margin,
    height: measured.subtreeHeight + options.margin * 2,
  }
}

/**
 * 估算文字宽度（无 canvas 时兜底）：CJK 按一个全宽、其余按 0.6 宽。
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0
  for (const char of text) {
    width += char.charCodeAt(0) > 0x2e80 ? fontSize : fontSize * 0.6
  }
  return width
}

/** 按宽度截断文字，超出部分用 `…` 表示。 */
export function truncateText(text: string, maxWidth: number, measure: (text: string) => number): string {
  if (measure(text) <= maxWidth) return text

  const characters = [...text]
  let result = ''
  for (const char of characters) {
    if (measure(`${result}${char}…`) > maxWidth) break
    result += char
  }
  return result.length > 0 ? `${result}…` : '…'
}
