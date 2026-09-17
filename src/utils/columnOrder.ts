import type { TableColumn } from '../types/table'

/** 可见列按 order 排序 */
export function sortedVisible(columns: TableColumn[]): TableColumn[] {
  return columns.filter((c) => c.visible).sort((a, b) => a.order - b.order)
}

/**
 * 将可见列中的一块（单列或多列）移动到 targetKey 之前；
 * targetKey 为 null 时移到可见列末尾。
 */
export function moveVisibleBlock(
  columns: TableColumn[],
  movedKeys: string[],
  beforeKey: string | null,
): TableColumn[] {
  if (!movedKeys.length) return columns
  const movedSet = new Set(movedKeys)
  if (beforeKey && movedSet.has(beforeKey)) return columns

  const visible = sortedVisible(columns)
  const hidden = columns.filter((c) => !c.visible).sort((a, b) => a.order - b.order)

  const block = visible.filter((c) => movedSet.has(c.key))
  if (!block.length) return columns

  const rest = visible.filter((c) => !movedSet.has(c.key))
  let insertAt = beforeKey == null ? rest.length : rest.findIndex((c) => c.key === beforeKey)
  if (insertAt < 0) insertAt = rest.length

  const nextVisible = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)]
  return [
    ...nextVisible.map((c, i) => ({ ...c, order: i })),
    ...hidden.map((c, i) => ({ ...c, order: nextVisible.length + i })),
  ]
}

/** 从锚点到当前点，按可见列顺序取闭区间 keys */
export function visibleRangeKeys(
  columns: TableColumn[],
  anchorKey: string,
  endKey: string,
): string[] {
  const visible = sortedVisible(columns)
  const a = visible.findIndex((c) => c.key === anchorKey)
  const b = visible.findIndex((c) => c.key === endKey)
  if (a < 0 || b < 0) return [endKey]
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return visible.slice(lo, hi + 1).map((c) => c.key)
}
