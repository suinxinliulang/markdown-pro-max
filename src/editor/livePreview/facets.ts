import { Facet } from '@codemirror/state'

/** 用系统程序打开链接（由宿主注入）。 */
export type ExternalOpener = (url: string) => void

/** 打开外部链接的实现。 */
export const externalOpener: Facet<ExternalOpener, ExternalOpener> = Facet.define<
  ExternalOpener,
  ExternalOpener
>({
  combine: (values) => values[values.length - 1] ?? (() => {}),
})
