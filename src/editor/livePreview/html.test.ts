import { describe, expect, it } from 'vitest'
import { groupHtmlRuns, isClosing, isSelfClosing, tagName } from './html'

const tag = (from: number, raw: string) => ({ from, to: from + raw.length, raw })

describe('tagName / isClosing / isSelfClosing', () => {
  it('解析标签名', () => {
    expect(tagName('<kbd>')).toBe('kbd')
    expect(tagName('</kbd >')).toBe('kbd')
    expect(tagName('<my-element x="1">')).toBe('my-element')
    expect(tagName('not a tag')).toBeNull()
  })

  it('识别闭合与自闭合', () => {
    expect(isClosing('</span>')).toBe(true)
    expect(isClosing('<span>')).toBe(false)
    expect(isSelfClosing('<br/>')).toBe(true)
    expect(isSelfClosing('<img src="a" />')).toBe(true)
    expect(isSelfClosing('<br>')).toBe(false)
  })
})

describe('groupHtmlRuns', () => {
  it('把开闭标签合并成一段（含中间文字）', () => {
    const tags = [tag(0, '<kbd>'), tag(5, '</kbd>')]
    expect(groupHtmlRuns(tags)).toEqual([{ from: 0, to: 11 }])
  })

  it('同一行多个元素分别成段', () => {
    const tags = [tag(0, '<kbd>'), tag(5, '</kbd>'), tag(12, '<kbd>'), tag(17, '</kbd>')]
    expect(groupHtmlRuns(tags)).toEqual([
      { from: 0, to: 11 },
      { from: 12, to: 23 },
    ])
  })

  it('自闭合标签单独成段', () => {
    const tags = [tag(0, '<br/>')]
    expect(groupHtmlRuns(tags)).toEqual([{ from: 0, to: 5 }])
  })

  it('没有闭合标签时只渲染标签本身', () => {
    const tags = [tag(0, '<b>')]
    expect(groupHtmlRuns(tags)).toEqual([{ from: 0, to: 3 }])
  })

  it('嵌套不同名标签只配对同名的', () => {
    const tags = [tag(0, '<span>'), tag(6, '<b>'), tag(9, '</b>'), tag(13, '</span>')]
    // 外层 span 配对外层闭合标签：0 → 13 + len('</span>') = 20
    expect(groupHtmlRuns(tags)).toEqual([{ from: 0, to: 20 }])
  })
})
