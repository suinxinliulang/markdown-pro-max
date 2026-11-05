/**
 * 测试环境补丁。
 *
 * happy-dom 的 document 没有 `<!doctype html>`，`document.compatMode` 是 undefined；
 * KaTeX 在**模块加载时**就会据此判定 quirks mode 并禁用渲染。
 * 所以必须在任何测试模块 import katex 之前把 compatMode 摆正。
 */
if (typeof document !== 'undefined' && document.compatMode !== 'CSS1Compat') {
  Object.defineProperty(document, 'compatMode', {
    configurable: true,
    get: () => 'CSS1Compat',
  })
}
