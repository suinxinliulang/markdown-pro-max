import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ThemeName } from '../editor'
import {
  DEFAULT_LAYOUT,
  estimateTextWidth,
  layoutMindMap,
  truncateText,
  type Layout,
} from '../mindmap/layout'
import { buildMindMap, type MindNode } from '../mindmap/tree'
import { clampScale, fitToContent, panBy, toTransform, zoomAt, type Viewport } from '../mindmap/viewport'

export interface MindMapViewProps {
  markdown: string
  title: string
  theme: ThemeName
  onExit: () => void
}

const DEFAULT_VIEWPORT: Viewport = { scale: 1, x: 0, y: 0 }

/** markmap 用 innerHTML 渲染节点内容，纯文本必须先转义。 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface MarkmapData {
  content: string
  children: MarkmapData[]
}

function toMarkmapData(node: MindNode): MarkmapData {
  return { content: escapeHtml(node.content), children: node.children.map(toMarkmapData) }
}

interface MarkmapInstance {
  fit(): Promise<void>
  rescale(scale: number): Promise<void>
  destroy(): void
}

const MARKMAP_OPTIONS = {
  autoFit: true,
  duration: 200,
  maxWidth: 220,
  initialExpandLevel: -1,
  toggleRecursively: true,
  scrollForPan: false,
  zoom: true,
  pan: true,
}

/** canvas 量文字宽度；拿不到时退回估算。 */
const createMeasurer = () => {
  let context: CanvasRenderingContext2D | null = null
  try {
    context = document.createElement('canvas').getContext('2d')
    if (context) context.font = `${DEFAULT_LAYOUT.fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`
  } catch {
    context = null
  }

  return (text: string): number => {
    const measured = context?.measureText(text).width
    if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0) return measured
    return estimateTextWidth(text, DEFAULT_LAYOUT.fontSize)
  }
}

/**
 * 脑图视图。
 *
 * 默认用 `markmap-view` 渲染（缩放/平移/折叠都是它内置的）；
 * 如果 markmap 加载失败，或者它在当前 WebView 里画不出文字（`foreignObject` 高度为 0），
 * 自动回退到自研的 SVG 渲染器，保证脑图始终可用。
 */
export function MindMapView({ markdown, title, theme, onExit }: MindMapViewProps) {
  const rootLabel = useMemo(() => title.replace(/\.[^.]+$/, '') || '文档', [title])
  const map = useMemo(() => buildMindMap(markdown, rootLabel), [markdown, rootLabel])
  const empty = map.root.children.length === 0

  const [mode, setMode] = useState<'markmap' | 'svg'>('markmap')
  const [scale, setScale] = useState(1)

  const canvasRef = useRef<HTMLDivElement>(null)
  const markmapSvgRef = useRef<SVGSVGElement>(null)
  const markmapRef = useRef<MarkmapInstance | null>(null)

  /** markmap 缩放时 d3 会在 svg 上派发 zoom 事件，从 <g> 的 transform 里读回比例。 */
  const handleZoomEvent = useCallback(() => {
    const transform = markmapSvgRef.current?.querySelector('g')?.getAttribute('transform') ?? ''
    const match = /scale\(([\d.]+)\)/.exec(transform)
    if (match) setScale(Number(match[1]))
  }, [])

  useEffect(() => {
    if (mode !== 'markmap' || empty) return

    let disposed = false
    let instance: MarkmapInstance | null = null

    const setup = async () => {
      try {
        const { Markmap } = (await import('markmap-view')) as unknown as {
          Markmap: { create(el: Element, options: unknown, data: unknown): MarkmapInstance }
        }
        if (disposed || !markmapSvgRef.current) return

        const created = Markmap.create(markmapSvgRef.current, MARKMAP_OPTIONS, toMarkmapData(map.root))
        instance = created
        markmapRef.current = created
        markmapSvgRef.current.addEventListener('zoom', handleZoomEvent)

        // 自检：真实布局下 foreignObject 里若量不到尺寸，说明这个 WebView 画不出标签
        requestAnimationFrame(() => {
          if (disposed || !markmapSvgRef.current) return
          const box = markmapSvgRef.current.getBoundingClientRect()
          if (box.width <= 0) return // 测试/无布局环境，跳过自检

          const labels = Array.from(
            markmapSvgRef.current.querySelectorAll('foreignObject > div'),
          ) as HTMLElement[]
          if (labels.length > 0 && !labels.some((label) => label.scrollHeight > 0 && label.scrollWidth > 0)) {
            setMode('svg')
          }
        })
      } catch {
        if (!disposed) setMode('svg')
      }
    }

    void setup()

    return () => {
      disposed = true
      markmapSvgRef.current?.removeEventListener('zoom', handleZoomEvent)
      instance?.destroy()
      markmapRef.current = null
    }
  }, [mode, map.root, empty, theme, handleZoomEvent])

  // ---------------- 回退渲染器（自研 SVG）的布局与变换 ----------------

  const measure = useMemo(() => createMeasurer(), [])
  const layout: Layout = useMemo(() => layoutMindMap(map.root, measure), [map.root, measure])
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT)
  const [dragging, setDragging] = useState(false)
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)

  const fitSvg = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const box = canvas.getBoundingClientRect()
    setViewport(
      fitToContent({ width: layout.width, height: layout.height }, { width: box.width, height: box.height }),
    )
  }, [layout.width, layout.height])

  useLayoutEffect(() => {
    if (mode === 'svg') fitSvg()
  }, [mode, fitSvg])

  useEffect(() => {
    if (mode !== 'svg') return
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const box = canvas.getBoundingClientRect()
      const anchor = { x: event.clientX - box.left, y: event.clientY - box.top }
      setViewport((current) => zoomAt(current, Math.exp(-event.deltaY * 0.0015), anchor))
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [mode])

  const zoomBy = (factor: number) => {
    if (mode === 'markmap') {
      const next = clampScale(scale * factor)
      setScale(next)
      void markmapRef.current?.rescale(next)
      return
    }
    const box = canvasRef.current?.getBoundingClientRect()
    const anchor = box ? { x: box.width / 2, y: box.height / 2 } : { x: 0, y: 0 }
    setViewport((current) => zoomAt(current, factor, anchor))
  }

  const fitAll = () => {
    if (mode === 'markmap') {
      void markmapRef.current?.fit()
      return
    }
    fitSvg()
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'svg' || event.button !== 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragOrigin.current = { x: event.clientX, y: event.clientY }
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'svg') return
    const origin = dragOrigin.current
    if (!origin) return
    const dx = event.clientX - origin.x
    const dy = event.clientY - origin.y
    dragOrigin.current = { x: event.clientX, y: event.clientY }
    setViewport((current) => panBy(current, dx, dy))
  }

  const endDrag = () => {
    dragOrigin.current = null
    setDragging(false)
  }

  const displayedScale = mode === 'markmap' ? scale : viewport.scale

  return (
    <div className="mindmap">
      <div className="mindmap-head">
        <span className="mindmap-title" title={title}>
          🧠 {title}
        </span>
        <span className="mindmap-meta">
          共 {map.headingCount} 个标题
          {map.markedCount > 0
            ? ` · 仅显示 ${map.markedCount} 个带 {#mm} 标记的标题`
            : ' · 显示全部标题'}
          {mode === 'svg' && ' · 已切换兼容渲染'}
        </span>
        <button type="button" className="tool" onClick={onExit}>
          返回编辑
        </button>
      </div>

      <div
        ref={canvasRef}
        className={`mindmap-canvas${dragging ? ' dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        {empty ? (
          <p className="mindmap-hint">这篇文档里没有可用作节点的标题</p>
        ) : (
          <>
            {mode === 'markmap' ? (
              <svg ref={markmapSvgRef} className="mindmap-markmap" />
            ) : (
              <div
                className="mindmap-stage"
                style={{ transform: toTransform(viewport), width: layout.width, height: layout.height }}
              >
                <svg
                  width={layout.width}
                  height={layout.height}
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                  role="img"
                  aria-label={`${rootLabel} 的脑图`}
                >
                  {layout.edges.map((edge) => (
                    <path key={`${edge.from}-${edge.to}`} className="mindmap-edge" d={edge.path} />
                  ))}
                  {layout.nodes.map((node) => (
                    <g
                      key={node.id}
                      className={`mindmap-node${node.depth === 0 ? ' root' : ''}`}
                      transform={`translate(${node.x}, ${node.y})`}
                    >
                      <rect width={node.width} height={node.height} rx={8} ry={8} />
                      <text x={node.width / 2} y={node.height / 2} dominantBaseline="central" textAnchor="middle">
                        {truncateText(node.text, node.width - DEFAULT_LAYOUT.paddingX * 2, measure)}
                      </text>
                      <title>{`第 ${node.line} 行：${node.text}`}</title>
                    </g>
                  ))}
                </svg>
              </div>
            )}

            <div className="mindmap-controls" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" className="mindmap-zoom" onClick={() => zoomBy(1 / 1.2)} title="缩小">
                −
              </button>
              <span className="mindmap-scale">{Math.round(displayedScale * 100)}%</span>
              <button type="button" className="mindmap-zoom" onClick={() => zoomBy(1.2)} title="放大">
                ＋
              </button>
              <button type="button" className="mindmap-zoom" onClick={fitAll} title="适应画布">
                ⤢
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
