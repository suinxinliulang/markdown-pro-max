import { basicSetup } from 'codemirror'
import { indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import {
  externalOpener,
  imageResolver,
  livePreview,
  remoteImageLoader,
  type ExternalOpener,
  type ImageResolver,
  type RemoteImageLoader,
} from './livePreview'
import { editorTheme, type ThemeName } from './theme'

/** 编辑模式：所见即所得 / 纯源码。 */
export type EditorMode = 'preview' | 'source'

/** 状态栏用的光标信息。 */
export interface CursorInfo {
  /** 行号，从 1 开始。 */
  line: number
  /** 列号，从 1 开始（按 UTF-16 码元计，与 CM6 一致）。 */
  col: number
  /** 选中的字符数，0 表示没有选区。 */
  selected: number
}

export interface EditorOptions {
  /** 挂载节点。 */
  parent: HTMLElement
  /** 初始主题。 */
  theme: ThemeName
  /** 初始编辑模式，默认 `preview`。 */
  mode?: EditorMode
  /** 图片地址解析器（本地相对路径 → 可加载的 URL）。 */
  resolveImage?: ImageResolver
  /** 加载远程图片（点击占位后触发）。 */
  loadRemoteImage?: RemoteImageLoader
  /** 用系统程序打开链接。 */
  openExternal?: ExternalOpener
  /** 文档内容变化（用于置脏与字数统计）；只传长度，避免每次按键都复制整篇。 */
  onDocChanged: (length: number) => void
  /** 光标/选区变化。 */
  onCursor: (info: CursorInfo) => void
  /** 触发保存（Mod+S）。 */
  onSave: () => void
}

/**
 * CodeMirror 6 的薄封装。
 *
 * M0 只有纯源码编辑 + Markdown 语法着色；M2 的 Live Preview 装饰会作为
 * 额外的 Extension 挂进 `extensions`，不改这里的上层接口。
 */
export class MarkdownEditor {
  readonly view: EditorView
  private readonly options: EditorOptions
  private readonly themeSlot = new Compartment()
  private readonly modeSlot = new Compartment()
  /** 程序化设置文本时抑制 onDocChanged，避免刚打开就被标脏。 */
  private silent = false

  constructor(options: EditorOptions) {
    this.options = options

    this.view = new EditorView({
      parent: options.parent,
      state: EditorState.create({
        doc: '',
        extensions: [
          // 放在 basicSetup 之前，优先级高于默认键位。
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                this.options.onSave()
                return true
              },
            },
            indentWithTab,
          ]),
          basicSetup,
          markdown({ base: markdownLanguage, addKeymap: true }),
          EditorView.lineWrapping,
          this.themeSlot.of(editorTheme(options.theme)),
          this.modeSlot.of(options.mode === 'source' ? [] : livePreview()),
          options.resolveImage ? imageResolver.of(options.resolveImage) : [],
          options.loadRemoteImage ? remoteImageLoader.of(options.loadRemoteImage) : [],
          options.openExternal ? externalOpener.of(options.openExternal) : [],
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !this.silent) {
              this.options.onDocChanged(update.state.doc.length)
            }
            if (update.docChanged || update.selectionSet) {
              this.options.onCursor(this.cursorInfo())
            }
          }),
        ],
      }),
    })
  }

  private cursorInfo(): CursorInfo {
    const state = this.view.state
    const range = state.selection.main
    const line = state.doc.lineAt(range.head)
    return {
      line: line.number,
      col: range.head - line.from + 1,
      selected: range.to - range.from,
    }
  }

  /** 取当前正文。 */
  getText(): string {
    return this.view.state.doc.toString()
  }

  /** 用新文本替换全部内容（打开文件时调用）。 */
  setText(text: string): void {
    this.silent = true
    try {
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: text },
        selection: { anchor: 0 },
        scrollIntoView: true,
      })
    } finally {
      this.silent = false
    }
    this.options.onCursor(this.cursorInfo())
  }

  /** 切换主题。 */
  setTheme(theme: ThemeName): void {
    this.view.dispatch({ effects: this.themeSlot.reconfigure(editorTheme(theme)) })
  }

  /** 切换编辑模式（源码 / 所见即所得）。 */
  setMode(mode: EditorMode): void {
    this.view.dispatch({ effects: this.modeSlot.reconfigure(mode === 'source' ? [] : livePreview()) })
  }

  /** 聚焦编辑器。 */
  focus(): void {
    this.view.focus()
  }

  /** 销毁并释放 DOM。 */
  destroy(): void {
    this.view.destroy()
  }
}

export { editorTheme, type ThemeName } from './theme'
