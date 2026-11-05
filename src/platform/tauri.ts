import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { DirEntry, DocMeta, OpenedDoc, Platform, SaveResult } from './types'

interface MetaPayload {
  id: string
  name: string
  path: string
  charset: string
  eol: string
  mtimeMs: number
  size: number
}

interface OpenedPayload {
  meta: MetaPayload
  text: string
}

function toMeta(meta: MetaPayload): DocMeta {
  return {
    id: meta.id,
    name: meta.name,
    path: meta.path,
    charset: meta.charset,
    eol: meta.eol as DocMeta['eol'],
    mtimeMs: meta.mtimeMs,
    size: meta.size,
  }
}

function toOpened(payload: OpenedPayload): OpenedDoc {
  return { text: payload.text, meta: toMeta(payload.meta) }
}

/** 由 Rust 侧处理文件系统的正式实现。 */
export const tauriPlatform: Platform = {
  kind: 'tauri',

  async pickAndOpen() {
    const payload = await invoke<OpenedPayload | null>('pick_document')
    return payload ? toOpened(payload) : null
  },

  async openPath(path: string) {
    const payload = await invoke<OpenedPayload>('open_document', { path })
    return toOpened(payload)
  },

  async save(meta: DocMeta, text: string) {
    return invoke<SaveResult>('save_document', {
      id: meta.id,
      text,
      expectMtimeMs: meta.mtimeMs,
    })
  },

  async saveAs(text: string, suggestedName: string) {
    const payload = await invoke<OpenedPayload | null>('save_document_as', { text, suggestedName })
    return payload ? toOpened(payload) : null
  },

  async openExternal(url: string) {
    await openUrl(url)
  },

  async loadImage(docPath: string, src: string) {
    try {
      return await invoke<string>('load_image', { docPath, src })
    } catch {
      return null
    }
  },

  async newWindow() {
    await invoke('open_new_window')
  },

  async pickFolder() {
    return invoke<string | null>('pick_folder')
  },

  async listDirectory(path: string) {
    return invoke<DirEntry[]>('list_directory', { path })
  },

  async createEntry(parent: string, name: string, directory: boolean) {
    return invoke<string>('create_entry', { parent, name, directory })
  },

  async deleteEntry(path: string) {
    await invoke('delete_entry', { path })
  },

  async copyEntry(from: string, to: string) {
    await invoke('copy_entry', { from, to })
  },

  async moveEntry(from: string, to: string) {
    await invoke('move_entry', { from, to })
  },

  async revealEntry(path: string) {
    await invoke('reveal_entry', { path })
  },

  async watchWorkspace(path: string) {
    await invoke('watch_workspace', { path })
  },

  async onWorkspaceChanged(handler: (root: string) => void) {
    return listen<string>('workspace://changed', (event) => handler(event.payload))
  },

  async removeRecent(path: string) {
    return invoke<DocMeta[]>('remove_recent', { path })
  },

  async recent() {
    const list = await invoke<MetaPayload[]>('recent_documents')
    return list.map(toMeta)
  },
}
