import { describe, expect, it } from 'vitest'
import { parseAlign, parseTable, splitRow } from './table'

describe('splitRow', () => {
  it('去掉首尾管道符并按列切分', () => {
    expect(splitRow('| a | b | c |')).toEqual(['a', 'b', 'c'])
    expect(splitRow('a | b')).toEqual(['a', 'b'])
  })

  it('保留转义的管道符', () => {
    expect(splitRow('| a \\| b | c |')).toEqual(['a | b', 'c'])
  })
})

describe('parseAlign', () => {
  it('识别四种对齐', () => {
    expect(parseAlign(['---', ':--', '--:', ':-:'], 4)).toEqual([null, 'left', 'right', 'center'])
  })

  it('列数不匹配时返回 null', () => {
    expect(parseAlign(['---'], 2)).toBeNull()
  })

  it('非法分隔行返回 null', () => {
    expect(parseAlign(['abc', '---'], 2)).toBeNull()
  })
})

describe('parseTable', () => {
  it('解析表头、对齐与数据行', () => {
    const table = parseTable(['| 名称 | 数量 |', '| :--- | ---: |', '| 苹果 | 3 |', '| 梨 | 5 |'].join('\n'))
    expect(table).not.toBeNull()
    expect(table?.header).toEqual(['名称', '数量'])
    expect(table?.align).toEqual(['left', 'right'])
    expect(table?.rows).toEqual([
      ['苹果', '3'],
      ['梨', '5'],
    ])
  })

  it('允许前后空行', () => {
    const table = parseTable('\n| a |\n| --- |\n| 1 |\n')
    expect(table?.rows).toEqual([['1']])
  })

  it('没有分隔行时不是表格', () => {
    expect(parseTable('| a | b |\n| 1 | 2 |')).toBeNull()
  })

  it('列数不一致时拒绝解析（宁可显示源码）', () => {
    expect(parseTable('| a | b |\n| --- |\n| 1 | 2 |')).toBeNull()
  })

  it('单行不是表格', () => {
    expect(parseTable('| a | b |')).toBeNull()
  })
})
