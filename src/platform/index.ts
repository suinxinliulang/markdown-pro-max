import { tauriPlatform } from './tauri'
import { webPlatform } from './web'
import type { Platform } from './types'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** 当前宿主对应的平台实现。 */
export const platform: Platform = isTauri ? tauriPlatform : webPlatform

export type { DocMeta, Eol, OpenedDoc, Platform, SaveResult } from './types'
