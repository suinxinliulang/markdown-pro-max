import type { EditorView } from '@codemirror/view'

/** 点击块级 widget 时把光标放回源码里，触发「揭示」后就能编辑了。 */
export function revealOnClick(view: EditorView, pos: number): void {
  const target = Math.min(pos + 1, view.state.doc.length)
  view.dispatch({ selection: { anchor: target }, scrollIntoView: true })
}

/** 让一个 widget 的 DOM 可点击/可聚焦，回车或空格同样回到源码。 */
export function clickable(element: HTMLElement, view: EditorView, pos: number): void {
  element.tabIndex = 0
  element.addEventListener('mousedown', (event) => {
    // 阻止默认行为，否则 CodeMirror 会先把光标放到 widget 之外。
    // 同时阻止冒泡：一旦 CodeMirror 处理了这次点击，光标移动会触发装饰重建，
    // 当前 widget 会被销毁，异步回调就写到游离节点上了。
    event.preventDefault()
    event.stopPropagation()
    revealOnClick(view, pos)
  })
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      revealOnClick(view, pos)
    }
  })
}
