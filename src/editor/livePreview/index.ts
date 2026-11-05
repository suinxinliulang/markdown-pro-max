import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import {
  type EditorState,
  type Extension,
  Facet,
  type Range,
  RangeSet,
  StateField,
  type Text,
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { externalOpener } from './facets'
import { findFrontmatter } from './frontmatter'
import { FrontmatterWidget } from './frontmatter-widget'
import { groupHtmlRuns, type HtmlTagRange } from './html'
import { HtmlBlockWidget, HtmlInlineWidget } from './html-widget'
import { ImageWidget, type RemoteImageLoader } from './image-widget'
import { collectLinkDefinitions, parseLink } from './links'
import { scanBlockMath, scanInlineMath } from './math'
import { MathWidget } from './math-widget'
import { MermaidWidget } from './mermaid-widget'
import { BulletWidget, CodeBlockWidget, RuleWidget, TableWidget } from './widgets'

/**
 * Live Preview 装饰层。
 *
 * 原则：**文本永远不动，只叠加装饰**。
 * - 光标不在这一行：把 `**`、`#`、`>`、反引号之类隐藏掉，只显示渲染后的样子；
 * - 光标进入这一行：把标记符以低透明度重新显示出来，方便直接改。
 *
 * 隐藏区间同时进 `atomicRanges`，否则方向键会"卡"在不可见的字符里。
 *
 * 结构上必须拆成两层：CodeMirror **不允许 ViewPlugin 提供块级装饰**，
 * 所以表格 / 代码卡片 / 分割线 / 块级公式 / Mermaid 走 StateField，
 * 行内标记、行样式、行内公式与图片走 ViewPlugin。
 */

/** 标记符节点：非当前行隐藏，当前行变暗。 */
const MARK_NODES = new Set([
  'HeaderMark',
  'QuoteMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'LinkMark',
  'URL',
  'LinkTitle',
])

/** 整块替换成只读 widget 的节点。 */
const BLOCK_NODES = new Set(['FencedCode', 'Table', 'HorizontalRule', 'HTMLBlock', 'CommentBlock'])

/** 这些节点内部的内容不参与公式/图片的替换。 */
const OPAQUE_NODES = new Set(['InlineCode', 'Link', 'Image', 'FencedCode', 'Table', 'Autolink', 'URL'])

/** 超过这个体量就不再生成块级 widget，避免全量遍历语法树拖慢输入。 */
export const MAX_BLOCK_WIDGET_DOC = 2 * 1024 * 1024

/** 把图片地址解析成 WebView 可用的 URL；返回 null 表示当前策略下不加载。 */
export type ImageResolver = (src: string) => string | null

/** 图片地址解析器（由编辑器宿主注入，默认一律不加载）。 */
export const imageResolver: Facet<ImageResolver, ImageResolver> = Facet.define<ImageResolver, ImageResolver>({
  combine: (values) => values[values.length - 1] ?? (() => null),
})

export { externalOpener, type ExternalOpener } from './facets'

/** 远程图片加载器（由宿主注入，默认不加载）。 */
export { type RemoteImageLoader } from './image-widget'

/** 远程图片加载实现。 */
export const remoteImageLoader: Facet<RemoteImageLoader, RemoteImageLoader> = Facet.define<
  RemoteImageLoader,
  RemoteImageLoader
>({
  combine: (values) => values[values.length - 1] ?? (async () => null),
})

/** 选区所在的全部行号。 */
export function revealedLines(state: EditorState): Set<number> {
  const lines = new Set<number>()
  const { doc } = state
  for (const range of state.selection.ranges) {
    const start = doc.lineAt(range.from).number
    const end = doc.lineAt(range.to).number
    for (let line = start; line <= end; line += 1) lines.add(line)
  }
  return lines
}

function lineRangeOf(doc: Text, from: number, to: number): { start: number; end: number } {
  const startLine = doc.lineAt(from)
  const endLine = doc.lineAt(Math.max(from, to - 1))
  return { start: startLine.number, end: endLine.number }
}

function overlapsSelection(revealed: Set<number>, doc: Text, from: number, to: number): boolean {
  const { start, end } = lineRangeOf(doc, from, to)
  for (let line = start; line <= end; line += 1) {
    if (revealed.has(line)) return true
  }
  return false
}

/** 围栏里的语言标识是不是 mermaid。 */
function isMermaidFence(source: string): boolean {
  return /^(?:`{3,}|~{3,})\s*mermaid\b/i.test(source)
}

/** 取出围栏代码块的正文（去掉首尾围栏行）。 */
export function fenceBody(source: string): string {
  const lines = source.split('\n')
  if (lines.length > 0) lines.shift()
  const last = lines[lines.length - 1]
  if (last !== undefined && /^\s*(`{3,}|~{3,})\s*$/.test(last)) lines.pop()
  return lines.join('\n')
}

/** 块级装饰的计算结果，附一份选区快照用于跳过重复计算。 */
export interface BlockValue {
  decorations: DecorationSet
  /** 被 widget 覆盖的行号（升序）。 */
  lines: number[]
  /** 被 widget 覆盖的字符区间：行内层据此跳过这些区域。 */
  ranges: Array<{ from: number; to: number }>
  /** 选区行号快照。 */
  key: string
}

function selectionKey(state: EditorState): string {
  return [...revealedLines(state)].sort((a, b) => a - b).join(',')
}

/** 计算块级装饰（表格 / 代码卡片 / 分割线 / 块级公式 / Mermaid）。 */
export function buildBlockDecorations(state: EditorState): BlockValue {
  const key = selectionKey(state)
  const doc = state.doc

  if (doc.length > MAX_BLOCK_WIDGET_DOC) {
    return { decorations: Decoration.none, lines: [], ranges: [], key }
  }

  const revealed = revealedLines(state)
  const decorations: Range<Decoration>[] = []
  const lines: number[] = []
  const ranges: Array<{ from: number; to: number }> = []
  /** 代码块/表格覆盖的行：里面的 `$$` 与 `![]()` 都不该被渲染。 */
  const codeLines = new Set<number>()

  const push = (
    widget:
      | TableWidget
      | CodeBlockWidget
      | RuleWidget
      | MermaidWidget
      | MathWidget
      | FrontmatterWidget
      | HtmlBlockWidget,
    start: number,
    end: number,
    startLine: number,
    endLine: number,
  ) => {
    decorations.push(Decoration.replace({ widget, block: true }).range(start, end))
    ranges.push({ from: start, to: end })
    for (let line = startLine; line <= endLine; line += 1) lines.push(line)
  }

  // frontmatter：文档开头的 YAML，默认折叠成一张卡片
  const text = doc.toString()
  const frontmatter = findFrontmatter(text)
  if (frontmatter) {
    const endLine = frontmatter.endLine + 1
    if (overlapsSelection(revealed, doc, frontmatter.from, frontmatter.to)) {
      for (let line = 1; line <= endLine; line += 1) {
        decorations.push(Decoration.line({ class: 'cm-lp-src-block' }).range(doc.line(line).from))
      }
    } else {
      push(new FrontmatterWidget(frontmatter.body, 0), frontmatter.from, frontmatter.to, 1, endLine)
    }
    for (let line = 1; line <= endLine; line += 1) codeLines.add(line)
  }

  const tree = ensureSyntaxTree(state, doc.length, 2000) ?? syntaxTree(state)

  tree.iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      // 已经折叠成 widget 的区域不再参与块级识别（否则会重叠）
      if (frontmatter && node.from < frontmatter.to) return true
      const name = node.name
      if (!BLOCK_NODES.has(name)) return true

      const startLine = doc.lineAt(node.from)
      const endLine = doc.lineAt(Math.max(node.from, node.to - 1))
      const source = doc.sliceString(startLine.from, endLine.to)

      if (name !== 'HorizontalRule') {
        for (let line = startLine.number; line <= endLine.number; line += 1) codeLines.add(line)
      }

      if (overlapsSelection(revealed, doc, node.from, node.to)) return true

      if (name === 'HTMLBlock' || name === 'CommentBlock') {
        push(
          new HtmlBlockWidget(source, startLine.from, name === 'CommentBlock'),
          startLine.from,
          endLine.to,
          startLine.number,
          endLine.number,
        )
      } else if (name === 'FencedCode' && isMermaidFence(source)) {
        push(new MermaidWidget(fenceBody(source), startLine.from), startLine.from, endLine.to, startLine.number, endLine.number)
      } else if (name === 'FencedCode') {
        push(new CodeBlockWidget(source, startLine.from), startLine.from, endLine.to, startLine.number, endLine.number)
      } else if (name === 'Table') {
        push(new TableWidget(source, startLine.from), startLine.from, endLine.to, startLine.number, endLine.number)
      } else {
        push(new RuleWidget(startLine.from), startLine.from, endLine.to, startLine.number, endLine.number)
      }
      return false
    },
  })

  // 块级公式：行扫描 + 跳过代码块/表格内的行
  for (const block of scanBlockMath(text)) {
    const startLineNumber = block.startLine + 1
    const endLineNumber = block.endLine + 1

    let insideCode = false
    for (let line = startLineNumber; line <= endLineNumber; line += 1) {
      if (codeLines.has(line)) insideCode = true
    }
    if (insideCode) continue
    if (overlapsSelection(revealed, doc, block.from, block.to)) continue

    const start = doc.line(startLineNumber).from
    const end = doc.line(endLineNumber).to
    push(new MathWidget(block.tex.trim(), true), start, end, startLineNumber, endLineNumber)
  }

  return {
    decorations: Decoration.set(decorations, true),
    lines: lines.sort((a, b) => a - b),
    ranges,
    key,
  }
}

/** 计算行内标记与行样式（只处理可见区间）。 */
export interface BlockedArea {
  /** 被 widget 覆盖的行。 */
  lines: ReadonlySet<number>
  /** 被 widget 覆盖的字符区间。 */
  ranges: ReadonlyArray<{ from: number; to: number }>
}

export function buildInlineDecorations(
  state: EditorState,
  visibleRanges: readonly { from: number; to: number }[],
  blocked: BlockedArea,
): DecorationSet {
  const blockedLines = blocked.lines
  /** 整段落在某个 widget 区间内才跳过——文档根节点跨全篇，不能被跳过。 */
  const insideBlock = (from: number, to: number): boolean =>
    blocked.ranges.some((range) => from >= range.from && to <= range.to)
  const doc = state.doc
  const revealed = revealedLines(state)
  const resolver = state.facet(imageResolver)
  const loadRemoteImage = state.facet(remoteImageLoader)
  let definitions: Map<string, string> | null = null
  const linkDefinitions = (): Map<string, string> => {
    if (!definitions) definitions = collectLinkDefinitions(doc.toString())
    return definitions
  }
  const marks: Range<Decoration>[] = []
  const lineDecorations: Range<Decoration>[] = []
  const opaque: Array<{ from: number; to: number }> = []
  const htmlTags: HtmlTagRange[] = []

  const hidden = Decoration.replace({})
  const dimmed = Decoration.mark({ class: 'cm-lp-mark' })

  const overlapsOpaque = (from: number, to: number): boolean =>
    opaque.some((range) => from < range.to && to > range.from)

  const conflictsWithMark = (from: number, to: number): boolean =>
    marks.some((range) => from < range.to && to > range.from)

  const lastVisible = visibleRanges[visibleRanges.length - 1]?.to ?? 0
  const tree = ensureSyntaxTree(state, Math.max(lastVisible, 1), 1000) ?? syntaxTree(state)

  // 第一遍：收集不能被公式/图片替换的区间
  for (const visible of visibleRanges) {
    tree.iterate({
      from: visible.from,
      to: visible.to,
      enter: (node) => {
        if (OPAQUE_NODES.has(node.name)) {
          opaque.push({ from: node.from, to: node.to })
          return false
        }
        return true
      },
    })
  }

  // 第二遍：标记符、行样式、图片
  for (const visible of visibleRanges) {
    tree.iterate({
      from: visible.from,
      to: visible.to,
      enter: (node) => {
        const name = node.name

        // 整段都在 widget 覆盖区间内（代码块 / 表格 / frontmatter）才跳过
        if (insideBlock(node.from, node.to)) return false

        // 块级节点在 StateField 里处理；这里只给"揭示状态"的源码加样式
        if (BLOCK_NODES.has(name)) {
          const { start, end } = lineRangeOf(doc, node.from, node.to)
          for (let line = start; line <= end; line += 1) {
            if (blockedLines.has(line)) continue
            lineDecorations.push(Decoration.line({ class: 'cm-lp-src-block' }).range(doc.line(line).from))
          }
          return false
        }

        // 图片：`![alt](src)` 渲染成真实图片（远程默认不加载）
        if (name === 'Image') {
          if (overlapsSelection(revealed, doc, node.from, node.to)) return true
          const raw = doc.sliceString(node.from, node.to)
          const match = /^!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)$/.exec(raw)
          if (!match) return true

          const [, alt, src] = match
          marks.push(
            Decoration.replace({
              widget: new ImageWidget(src, alt, resolver(src), loadRemoteImage, node.from),
            }).range(node.from, node.to),
          )
          return false
        }

        // 行内 HTML 标签先收集，循环结束后按行配对成整段
        if (name === 'HTMLTag') {
          if (!overlapsSelection(revealed, doc, node.from, node.to)) {
            htmlTags.push({ from: node.from, to: node.to, raw: doc.sliceString(node.from, node.to) })
          }
          return false
        }

        // 链接：把文字部分标成可点击（点击打开）
        if (name === 'Link') {
          if (overlapsSelection(revealed, doc, node.from, node.to)) return true
          const raw = doc.sliceString(node.from, node.to)
          const parsed = parseLink(raw, linkDefinitions())
          if (!parsed) return true

          const textStart = node.from + parsed.textStart
          const textEnd = textStart + parsed.text.length
          if (textEnd > textStart && !conflictsWithMark(textStart, textEnd)) {
            marks.push(
              Decoration.mark({
                class: 'cm-lp-link',
                attributes: { 'data-url': parsed.url },
              }).range(textStart, textEnd),
            )
            // `[`、`](url)`、`][label]` 这些外壳在非编辑态隐藏
            if (textStart > node.from) marks.push(hidden.range(node.from, textStart))
            if (textEnd < node.to) marks.push(hidden.range(textEnd, node.to))
          }
          return false
        }

        // 自动链接 `<https://a.b>` 与裸链接
        if (name === 'Autolink') {
          if (overlapsSelection(revealed, doc, node.from, node.to)) return false
          const url = doc.sliceString(node.from, node.to).replace(/^</, '').replace(/>$/, '').trim()
          if (url && !conflictsWithMark(node.from, node.to)) {
            marks.push(Decoration.mark({ class: 'cm-lp-link', attributes: { 'data-url': url } }).range(node.from, node.to))
          }
          return false
        }

        // 无序列表：把 `-` 换成圆点（有序列表保留数字）
        if (name === 'ListMark') {
          const list = node.node.parent?.parent?.name
          if (list !== 'BulletList' || overlapsSelection(revealed, doc, node.from, node.to)) return false
          let to = node.to
          if (doc.sliceString(to, to + 1) === ' ') to += 1
          if (conflictsWithMark(node.from, to)) return false
          marks.push(Decoration.replace({ widget: new BulletWidget(node.from) }).range(node.from, to))
          return false
        }

        // 标题：整行放大
        if (name.startsWith('ATXHeading') || name === 'SetextHeading1' || name === 'SetextHeading2') {
          const level = name.endsWith('1') ? '1' : name.endsWith('2') ? '2' : name.slice(-1)
          const line = doc.lineAt(node.from)
          lineDecorations.push(Decoration.line({ class: `cm-lp-h${level}` }).range(line.from))

          // 脑图标记 `{#mm}` 在非编辑态隐藏，避免污染标题外观
          const lineText = doc.sliceString(line.from, line.to)
          const marker = /\s*\{#mm\}\s*$/i.exec(lineText)
          if (marker && !overlapsSelection(revealed, doc, line.from, line.to)) {
            const from = line.from + marker.index
            if (from < line.to && !conflictsWithMark(from, line.to)) {
              marks.push(hidden.range(from, line.to))
            }
          }
          return true
        }

        // 引用：整段左侧竖线
        if (name === 'Blockquote') {
          const { start, end } = lineRangeOf(doc, node.from, node.to)
          for (let line = start; line <= end; line += 1) {
            if (blockedLines.has(line)) continue
            lineDecorations.push(Decoration.line({ class: 'cm-lp-quote' }).range(doc.line(line).from))
          }
          return true
        }

        // 行内标记符
        if (MARK_NODES.has(name)) {
          if (node.to <= node.from) return false
          if (node.node.parent?.name === 'Image') return false

          // 行首标记（`#`、`>`）后面那个空格也一起吃掉，否则会留下一个空档
          let to = node.to
          if ((name === 'HeaderMark' || name === 'QuoteMark') && doc.sliceString(to, to + 1) === ' ') {
            to += 1
          }

          if (conflictsWithMark(node.from, to)) return false
          marks.push(
            overlapsSelection(revealed, doc, node.from, node.to)
              ? dimmed.range(node.from, to)
              : hidden.range(node.from, to),
          )
          return false
        }

        return true
      },
    })
  }

  // 行内 HTML：把「开标签 → 闭标签」整段渲染成真正的元素
  const tagsByLine = new Map<number, HtmlTagRange[]>()
  for (const tag of htmlTags) {
    const line = doc.lineAt(tag.from).number
    const bucket = tagsByLine.get(line)
    if (bucket) bucket.push(tag)
    else tagsByLine.set(line, [tag])
  }
  for (const tags of tagsByLine.values()) {
    for (const run of groupHtmlRuns(tags)) {
      if (overlapsOpaque(run.from, run.to) || conflictsWithMark(run.from, run.to)) continue
      marks.push(
        Decoration.replace({
          widget: new HtmlInlineWidget(doc.sliceString(run.from, run.to), run.from),
        }).range(run.from, run.to),
      )
    }
  }

  // 第三遍：行内公式（按行扫描，跳过代码/链接/图片内部）
  for (const visible of visibleRanges) {
    let line = doc.lineAt(visible.from)
    for (;;) {
      if (!blockedLines.has(line.number)) {
        for (const span of scanInlineMath(line.text, line.from)) {
          if (overlapsOpaque(span.from, span.to)) continue
          if (conflictsWithMark(span.from, span.to)) continue
          if (overlapsSelection(revealed, doc, span.from, span.to)) continue
          marks.push(Decoration.replace({ widget: new MathWidget(span.tex, false) }).range(span.from, span.to))
        }
      }
      if (line.to >= visible.to || line.number >= doc.lines) break
      line = doc.line(line.number + 1)
    }
  }

  return Decoration.set([...marks, ...lineDecorations], true)
}

/**
 * 合并两层装饰。
 *
 * 运行时两层是分开挂的（块级走 StateField，行内走 ViewPlugin）；
 * 这个函数主要给测试和调试用，一次拿到完整结果。
 */
export function buildDecorations(
  state: EditorState,
  visibleRanges: readonly { from: number; to: number }[],
): { decorations: DecorationSet; atomic: DecorationSet } {
  const blocks = buildBlockDecorations(state)
  const inline = buildInlineDecorations(state, visibleRanges, {
    lines: new Set(blocks.lines),
    ranges: blocks.ranges,
  })

  const blockRanges: Range<Decoration>[] = []
  blocks.decorations.between(0, state.doc.length, (from, to, value) => {
    blockRanges.push(value.range(from, to))
  })

  const inlineRanges: Range<Decoration>[] = []
  const inlineHidden: Range<Decoration>[] = []
  inline.between(0, state.doc.length, (from, to, value) => {
    inlineRanges.push(value.range(from, to))
    // 隐藏用的 replace 装饰没有 widget；块级 widget 由 StateField 负责
    if (from !== to && value.spec.widget === undefined) inlineHidden.push(value.range(from, to))
  })

  return {
    decorations: Decoration.set([...blockRanges, ...inlineRanges], true),
    atomic: Decoration.set([...blockRanges, ...inlineHidden], true),
  }
}

/** 块级装饰的 StateField（CodeMirror 只允许从这里提供块级 widget）。 */
export const blockWidgets: StateField<BlockValue> = StateField.define<BlockValue>({
  create: (state) => buildBlockDecorations(state),
  update: (value, transaction) => {
    if (transaction.docChanged) return buildBlockDecorations(transaction.state)
    if (transaction.selection === undefined) return value
    const key = selectionKey(transaction.state)
    if (key === value.key) return value
    return buildBlockDecorations(transaction.state)
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

class InlinePreviewPlugin {
  decorations: DecorationSet = Decoration.none
  atomic: DecorationSet = Decoration.none
  private composing = false

  constructor(view: EditorView) {
    this.rebuild(view)
  }

  update(update: ViewUpdate): void {
    // IME 组合期间不动装饰：中文输入时重建会导致跳字。
    if (update.view.composing) {
      this.composing = true
      return
    }

    const wasComposing = this.composing
    this.composing = false

    if (wasComposing || update.docChanged || update.viewportChanged || update.selectionSet) {
      this.rebuild(update.view)
    }
  }

  private rebuild(view: EditorView): void {
    try {
      const state = view.state
      const blocks = state.field(blockWidgets, false)
      this.decorations = buildInlineDecorations(state, view.visibleRanges, {
        lines: new Set(blocks?.lines ?? []),
        ranges: blocks?.ranges ?? [],
      })
      this.atomic = inlineAtomic(view.visibleRanges, this.decorations)
    } catch (error) {
      // 装饰层只是"显示层"：它挂了也不该让编辑器白屏，退化成纯源码显示。
      console.error('[markdownpromax] Live Preview 构建失败，已退回源码显示', error)
      this.decorations = Decoration.none
      this.atomic = Decoration.none
    }
  }
}

/** 从行内装饰里挑出隐藏区间（replace 且非空），供 atomicRanges 使用。 */
function inlineAtomic(
  visibleRanges: readonly { from: number; to: number }[],
  set: DecorationSet,
): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const visible of visibleRanges) {
    set.between(visible.from, visible.to, (from, to, value) => {
      if (from !== to && value.spec.widget === undefined) ranges.push(value.range(from, to))
    })
  }
  return Decoration.set(ranges, true)
}

const inlinePlugin = ViewPlugin.fromClass(InlinePreviewPlugin, {
  decorations: (value) => value.decorations,
  eventHandlers: {
    mousedown(event, view) {
      // 单击即打开：光标要编辑这一行时点标记符或行首即可
      const target = event.target as HTMLElement | null
      const link = target?.closest?.('.cm-lp-link')
      const url = link?.getAttribute('data-url')
      if (!url) return false
      event.preventDefault()
      view.state.facet(externalOpener)(url)
      return true
    },
  },
})

/** 把 Live Preview 挂到编辑器上。 */
export function livePreview(): Extension {
  return [
    blockWidgets,
    inlinePlugin,
    EditorView.atomicRanges.of((view) => {
      const sets: RangeSet<Decoration>[] = [view.state.field(blockWidgets).decorations]
      const plugin = view.plugin(inlinePlugin)
      if (plugin) sets.push(plugin.atomic)
      return RangeSet.join(sets)
    }),
  ]
}
