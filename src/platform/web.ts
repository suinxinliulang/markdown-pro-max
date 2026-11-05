import type { DirEntry, DocMeta, Eol, OpenedDoc, Platform, SaveResult } from './types'

/**
 * 浏览器降级实现：只为在没有 WebView 开发包的机器上验证 UI 与编辑器行为。
 * 它不保证编码/行尾保真（浏览器按 UTF-8 解码文本文件）。
 */

interface FilePickerType {
  description: string
  accept: Record<string, string[]>
}

interface FilePickerOptions {
  types?: FilePickerType[]
  multiple?: boolean
  suggestedName?: string
}

declare global {
  interface Window {
    showOpenFilePicker?: (options?: FilePickerOptions) => Promise<FileSystemFileHandle[]>
    showSaveFilePicker?: (options?: FilePickerOptions) => Promise<FileSystemFileHandle>
  }
}

const MARKDOWN_TYPES: FilePickerType[] = [
  { description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.mdx', '.txt'] } },
]

const handles = new Map<string, FileSystemFileHandle>()

function newId(): string {
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function detectEol(text: string): Eol {
  if (text.includes('\r\n')) return 'crlf'
  if (text.includes('\r')) return 'cr'
  return 'lf'
}

async function fromHandle(handle: FileSystemFileHandle): Promise<OpenedDoc> {
  const file = await handle.getFile()
  const text = await file.text()
  const id = newId()
  handles.set(id, handle)
  const meta: DocMeta = {
    id,
    name: file.name,
    path: file.name,
    charset: 'UTF-8',
    eol: detectEol(text),
    mtimeMs: file.lastModified,
    size: file.size,
  }
  return { text, meta }
}

function pickWithInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.mdx,.txt,text/markdown'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

function download(text: string, name: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export const webPlatform: Platform = {
  kind: 'web',

  async pickAndOpen() {
    if (window.showOpenFilePicker) {
      const [handle] = await window.showOpenFilePicker({ types: MARKDOWN_TYPES })
      return handle ? fromHandle(handle) : null
    }
    const file = await pickWithInput()
    if (!file) return null
    const text = await file.text()
    return {
      text,
      meta: {
        id: newId(),
        name: file.name,
        path: file.name,
        charset: 'UTF-8',
        eol: detectEol(text),
        mtimeMs: file.lastModified,
        size: file.size,
      },
    }
  },

  async openPath(): Promise<OpenedDoc | null> {
    // 浏览器里没有可复用的路径，最近文件列表恒为空。
    return null
  },

  async save(meta: DocMeta, text: string): Promise<SaveResult> {
    const handle = handles.get(meta.id)
    if (!handle || !handle.createWritable) {
      download(text, meta.name)
      return { mtimeMs: Date.now(), bytes: new TextEncoder().encode(text).length }
    }
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
    const file = await handle.getFile()
    return { mtimeMs: file.lastModified, bytes: file.size }
  },

  async saveAs(text: string, suggestedName: string) {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: MARKDOWN_TYPES,
      })
      const writable = await handle.createWritable()
      await writable.write(text)
      await writable.close()
      return fromHandle(handle)
    }
    download(text, suggestedName)
    return null
  },

  async openExternal(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  },

  async loadImage(_docPath: string, src: string) {
    try {
      const response = await fetch(src, { mode: 'cors' })
      if (!response.ok) return null
      const blob = await response.blob()
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  },

  async newWindow(): Promise<void> {
    window.open(window.location.href, '_blank', 'noopener')
  },

  async pickFolder(): Promise<string | null> {
    // 浏览器预览模式没有真正的目录概念
    return null
  },

  async listDirectory(): Promise<DirEntry[]> {
    return []
  },

  async createEntry(): Promise<string> {
    throw new Error('浏览器预览模式不支持文件操作')
  },

  async deleteEntry(): Promise<void> {
    throw new Error('浏览器预览模式不支持文件操作')
  },

  async copyEntry(): Promise<void> {
    throw new Error('浏览器预览模式不支持文件操作')
  },

  async moveEntry(): Promise<void> {
    throw new Error('浏览器预览模式不支持文件操作')
  },

  async revealEntry(): Promise<void> {
    throw new Error('浏览器预览模式不支持文件操作')
  },

  async watchWorkspace(): Promise<void> {
    // 浏览器预览模式没有文件监听
  },

  async onWorkspaceChanged(): Promise<() => void> {
    return () => {}
  },

  async removeRecent(): Promise<DocMeta[]> {
    // 浏览器没有持久化的最近列表
    return []
  },

  async recent() {
    // 浏览器无法跨会话持有文件句柄，所以不提供最近列表。
    return []
  },
}
