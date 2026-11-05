import type { DirEntry } from '../platform/types'

/** 侧栏里的一行。 */
export interface SidebarRow {
  entry: DirEntry
  depth: number
}

/** 取路径最后一段，用来显示工作区名。 */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0)
  return parts[parts.length - 1] ?? path
}

/**
 * 路径过长时只保留尾部，前面用省略号。
 *
 * 只在路径分隔符处截断，避免出现「…llo-rust」这种半截目录名。
 */
export function ellipsizePath(path: string, max = 42): string {
  if (path.length <= max) return path

  const tail = path.slice(path.length - (max - 1))
  const separator = tail.search(/[\\/]/)
  const trimmed = separator >= 0 ? tail.slice(separator) : tail
  return `…${trimmed}`
}

/**
 * 把「已展开的目录」摊平成可见行。
 *
 * 树是懒加载的：某个目录还没加载过时，`childrenOf` 返回空数组，
 * 行里会显示加载占位，但不会把树撑乱。
 */
export function flattenTree(
  nodes: readonly DirEntry[],
  childrenOf: (path: string) => readonly DirEntry[],
  isExpanded: (path: string) => boolean,
  depth = 0,
  /** 已展开过的路径：防止异常数据（比如目录里包含自己）导致无限递归。 */
  visited: Set<string> = new Set<string>(),
): SidebarRow[] {
  const rows: SidebarRow[] = []
  if (depth > 64) return rows

  for (const entry of nodes) {
    // 目录已经出现过（异常的自引用数据）就跳过，避免无限递归
    if (entry.isDir && visited.has(entry.path)) continue

    rows.push({ entry, depth })
    if (entry.isDir && isExpanded(entry.path)) {
      visited.add(entry.path)
      const children = childrenOf(entry.path)
      if (children.length > 0) {
        rows.push(...flattenTree(children, childrenOf, isExpanded, depth + 1, visited))
      }
    }
  }
  return rows
}

/** 路径分隔符：Windows 风格用 `\`，其余用 `/`。 */
export function separatorOf(path: string): string {
  return path.includes('\\') && !path.includes('/') ? '\\' : '/'
}

/** 拼接目录与名字，避免出现重复分隔符。 */
export function joinPath(directory: string, name: string): string {
  return `${directory.replace(/[\\/]+$/, '')}${separatorOf(directory)}${name}`
}

/** 取父目录；已经是根时返回原样。 */
export function parentOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index <= 0 ? path : path.slice(0, index)
}

/** 把绝对路径转成相对工作区根的路径；不在工作区内时原样返回。 */
export function relativeTo(root: string | null, path: string): string {
  if (!root) return path
  const prefix = root.endsWith('/') || root.endsWith('\\') ? root : `${root}${separatorOf(root)}`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}
