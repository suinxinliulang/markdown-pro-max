import type { EditorView } from '@codemirror/view'
import { WidgetType } from '@codemirror/view'
import { clickable } from './clickable'

/** 远程图片加载器：返回 data URL，或 null 表示不加载。 */
export type RemoteImageLoader = (src: string) => Promise<string | null>

/**
 * 图片 widget。
 *
 * 远程图片默认**不加载**：CSP 只允许自身与 `data:`，避免在打开文档时
 * 就向任意域名发请求（泄露阅读行为、被追踪）。
 * 用户点击占位后才通过 Rust 侧代理下载（见 `markdownpromax-asset`）。
 */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    /** 已解析的成本地地址；`null` 表示需要用户手动加载。 */
    readonly resolved: string | null,
    readonly loader: RemoteImageLoader,
    readonly pos: number,
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt && other.resolved === this.resolved
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-lp-image'

    if (this.resolved) {
      wrapper.append(imageElement(this.resolved, this.alt, wrapper, view))
      clickable(wrapper, view, this.pos)
      return wrapper
    }

    const chip = document.createElement('span')
    chip.className = 'cm-lp-image-blocked'
    chip.textContent = `🖼 ${this.alt || this.src}（${isRemote(this.src) ? '点击加载远程图片' : '点击加载图片'}）`
    chip.title = this.src
    wrapper.append(chip)

    chip.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      chip.textContent = '加载中…'
      void this.loader(this.src).then((dataUrl) => {
        if (!dataUrl) {
          chip.textContent = `🖼 ${this.alt || this.src}（加载失败）`
          return
        }
        chip.replaceWith(imageElement(dataUrl, this.alt, wrapper, view))
        // 图片替换后高度会变，必须让 CodeMirror 重新测量，否则点击坐标会错位
        view.requestMeasure()
      })
    })

    return wrapper
  }

  ignoreEvent(): boolean {
    return false
  }
}

function isRemote(src: string): boolean {
  return /^(?:https?:)?\/\//i.test(src.trim())
}

function imageElement(
  src: string,
  alt: string,
  wrapper: HTMLElement,
  view: EditorView,
): HTMLImageElement {
  const image = document.createElement('img')
  image.src = src
  image.alt = alt
  image.loading = 'lazy'
  image.draggable = false
  // 图片解码完成后尺寸才确定，通知 CodeMirror 重新测量
  image.addEventListener('load', () => view.requestMeasure())
  image.addEventListener('error', () => {
    wrapper.classList.add('is-error')
    const chip = document.createElement('span')
    chip.className = 'cm-lp-image-blocked'
    chip.textContent = `🖼 ${alt || src}（图片加载失败）`
    image.replaceWith(chip)
    view.requestMeasure()
  })
  return image
}
