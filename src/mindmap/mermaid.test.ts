// @vitest-environment happy-dom
import mermaid from 'mermaid'
import { describe, expect, it } from 'vitest'
import { buildMindMap } from './tree'

/**
 * 生成的 mindmap 源码必须能被 Mermaid 官方解析器接受——
 * 标题里什么字符都可能出现（括号、冒号、emoji、全角标点）。
 */
describe('生成的 mermaid mindmap 源码', () => {
  it('复杂标题也能被官方解析器接受', async () => {
    const doc = [
      '# 系统架构（总览）',
      '## 前端 :: React {#mm}',
      '### 组件库/A 测试',
      '## 后端: Rust + Tauri',
      '### 🧠 脑图 [试验]',
      '## 部署 & 发布',
    ].join('\n')

    const { source } = buildMindMap(doc, 'MarkdownProMax 文档')
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    await expect(mermaid.parse(source)).resolves.toBeTruthy()
  })

  it('只有根节点的空脑图也合法', async () => {
    const { source } = buildMindMap('没有标题的正文', '空文档')
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    await expect(mermaid.parse(source)).resolves.toBeTruthy()
  })
})
