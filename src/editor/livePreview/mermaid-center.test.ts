// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { centerNodeLabels } from './mermaid-widget'

const SVG = `<svg viewBox="0 0 200 200" width="200" height="200">
  <g class="node" transform="translate(100, 100)">
    <rect x="-50" y="-20" width="100" height="40"/>
    <g class="label" transform="translate(-30, -10)"><text>标签</text></g>
  </g>
</svg>`

function stubRect(element: Element, rect: { left: number; top: number; width: number; height: number }) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => rect }),
  })
}

describe('centerNodeLabels', () => {
  it('把标签平移到节点中心', () => {
    const host = document.createElement('div')
    host.innerHTML = SVG
    const svg = host.querySelector('svg') as SVGSVGElement
    stubRect(svg, { left: 0, top: 0, width: 200, height: 200 })

    const shape = host.querySelector('rect') as Element
    stubRect(shape, { left: 50, top: 80, width: 100, height: 40 }) // 中心 (100, 100)

    const label = host.querySelector('g.label') as Element
    stubRect(label, { left: 70, top: 90, width: 20, height: 10 }) // 中心 (80, 95) → 需要 +20, +5

    centerNodeLabels(host)

    const transform = label.getAttribute('transform') ?? ''
    expect(transform).toContain('translate(20.00, 5.00)')
    // 原有 transform 保留
    expect(transform).toContain('translate(-30, -10)')
  })

  it('已经居中时不动', () => {
    const host = document.createElement('div')
    host.innerHTML = SVG
    const svg = host.querySelector('svg') as SVGSVGElement
    stubRect(svg, { left: 0, top: 0, width: 200, height: 200 })
    stubRect(host.querySelector('rect') as Element, { left: 50, top: 80, width: 100, height: 40 })
    stubRect(host.querySelector('g.label') as Element, { left: 90, top: 95, width: 20, height: 10 })

    centerNodeLabels(host)
    expect(host.querySelector('g.label')?.getAttribute('transform')).toBe('translate(-30, -10)')
  })

  it('没有 SVG 时安全返回', () => {
    expect(() => centerNodeLabels(document.createElement('div'))).not.toThrow()
  })
})
