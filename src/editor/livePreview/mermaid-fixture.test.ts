// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import mermaid from 'mermaid'
import { describe, expect, it } from 'vitest'

/**
 * 用 Mermaid 官方解析器校验测试文档里的每一张图。
 * 这一步能证明：围栏提取没漏内容，图表语法本身也是对的。
 */

const FIXTURE = readFileSync(join(process.cwd(), 'docs/fixtures/kitchen-sink.md'), 'utf8')

function mermaidBlocks(text: string): string[] {
  const blocks: string[] = []
  let current: string[] | null = null

  for (const line of text.split('\n')) {
    if (current) {
      if (/^\s*```\s*$/.test(line)) {
        blocks.push(current.join('\n'))
        current = null
      } else {
        current.push(line)
      }
      continue
    }
    if (/^\s*```mermaid\s*$/.test(line)) current = []
  }

  return blocks
}

describe('Mermaid 图表语法', () => {
  it('文档里的 15 张图都能被 Mermaid 解析器接受', async () => {
    const blocks = mermaidBlocks(FIXTURE)
    expect(blocks).toHaveLength(15)

    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })

    const failures: string[] = []
    for (const block of blocks) {
      const title = block.trim().split('\n')[0]
      try {
        await mermaid.parse(block)
      } catch (error) {
        failures.push(`${title} → ${(error as Error).message}`)
      }
    }

    expect(failures).toEqual([])
  })
})
