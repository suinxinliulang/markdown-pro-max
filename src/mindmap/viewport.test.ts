import { describe, expect, it } from 'vitest'
import { MAX_SCALE, MIN_SCALE, clampScale, fitToContent, panBy, toTransform, zoomAt } from './viewport'

describe('clampScale', () => {
  it('限制在上下界内', () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE)
    expect(clampScale(100)).toBe(MAX_SCALE)
    expect(clampScale(1.5)).toBe(1.5)
  })

  it('非法值退回 1', () => {
    expect(clampScale(Number.NaN)).toBe(1)
  })
})

describe('zoomAt', () => {
  it('锚点位置在缩放前后保持不变', () => {
    const viewport = { scale: 1, x: 0, y: 0 }
    const anchor = { x: 100, y: 50 }
    const zoomed = zoomAt(viewport, 2, anchor)

    // 锚点对应的内容坐标在缩放前后都应落在同一个屏幕位置
    const contentBefore = { x: (anchor.x - viewport.x) / viewport.scale, y: (anchor.y - viewport.y) / viewport.scale }
    const screenAfter = { x: zoomed.x + contentBefore.x * zoomed.scale, y: zoomed.y + contentBefore.y * zoomed.scale }

    expect(screenAfter.x).toBeCloseTo(anchor.x)
    expect(screenAfter.y).toBeCloseTo(anchor.y)
  })

  it('缩放超过上限时被夹住', () => {
    const zoomed = zoomAt({ scale: MAX_SCALE, x: 0, y: 0 }, 2, { x: 0, y: 0 })
    expect(zoomed.scale).toBe(MAX_SCALE)
  })

  it('缩小到下限时不再变化', () => {
    const zoomed = zoomAt({ scale: MIN_SCALE, x: 10, y: 20 }, 0.5, { x: 0, y: 0 })
    expect(zoomed.scale).toBe(MIN_SCALE)
    expect(zoomed.x).toBe(10)
  })
})

describe('panBy', () => {
  it('按增量平移，缩放不变', () => {
    expect(panBy({ scale: 1.5, x: 0, y: 0 }, 10, -5)).toEqual({ scale: 1.5, x: 10, y: -5 })
  })
})

describe('fitToContent', () => {
  it('等比缩放到画布内并居中', () => {
    const viewport = fitToContent({ width: 400, height: 200 }, { width: 800, height: 600 }, 0)
    expect(viewport.scale).toBe(1) // 内容比画布小时不放大
    expect(viewport.x).toBe(200)
    expect(viewport.y).toBe(200)
  })

  it('内容比画布大时缩小', () => {
    const viewport = fitToContent({ width: 2000, height: 1000 }, { width: 1000, height: 800 }, 0)
    expect(viewport.scale).toBeCloseTo(0.5)
  })

  it('尺寸缺失时退回默认视口', () => {
    expect(fitToContent({ width: 0, height: 0 }, { width: 800, height: 600 })).toEqual({ scale: 1, x: 0, y: 0 })
  })
})

describe('toTransform', () => {
  it('生成 CSS transform', () => {
    expect(toTransform({ scale: 1.5, x: 10, y: -4 })).toBe('translate(10px, -4px) scale(1.5)')
  })
})
