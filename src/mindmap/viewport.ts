/**
 * 脑图画布的视口变换（纯函数，便于单测）。
 *
 * 约定：`x`/`y` 是画布坐标系里的平移量，`scale` 是缩放倍数，
 * 实际渲染时用 `transform: translate(x, y) scale(scale)`，原点在左上角。
 */

export interface Viewport {
  scale: number
  x: number
  y: number
}

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export const MIN_SCALE = 0.2
export const MAX_SCALE = 5

/** 把缩放限制在合理范围。 */
export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/**
 * 以画布上的某个点为锚点缩放。
 *
 * 缩放后该点仍然停在原来的屏幕位置——这是"滚轮对着哪里放大哪里"的关键。
 */
export function zoomAt(viewport: Viewport, factor: number, anchor: Point): Viewport {
  const scale = clampScale(viewport.scale * factor)
  const ratio = scale / viewport.scale

  return {
    scale,
    x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio,
  }
}

/** 平移（拖动）。 */
export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy }
}

/**
 * 计算「内容适配画布」的初始视口：等比缩放到放得下，并居中。
 *
 * 内容比画布小时不放大（最多 1 倍），避免小图被拉糊。
 */
export function fitToContent(content: Size, canvas: Size, padding = 32): Viewport {
  if (content.width <= 0 || content.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    return { scale: 1, x: 0, y: 0 }
  }

  const availableWidth = Math.max(1, canvas.width - padding * 2)
  const availableHeight = Math.max(1, canvas.height - padding * 2)
  const raw = Math.min(availableWidth / content.width, availableHeight / content.height)
  const scale = clampScale(Math.min(raw, 1))

  return {
    scale,
    x: (canvas.width - content.width * scale) / 2,
    y: (canvas.height - content.height * scale) / 2,
  }
}

/** 转成 CSS transform 字符串。 */
export function toTransform(viewport: Viewport): string {
  return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
}
