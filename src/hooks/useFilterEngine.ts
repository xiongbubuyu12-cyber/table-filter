import { useEffect, useMemo, useRef, useState, useCallback, startTransition } from 'react'
import type { FilterCondition, FilterConfig, FilterOperator, TableColumn, TableRow } from '../types/table'
import {
  createEmptyCondition,
  createEmptyGroup,
  emptyFilterConfig,
  filterRowIndices,
} from '../utils/filter'
import { useDebouncedValue } from './useDebouncedValue'

function cloneFilters(filters: FilterConfig): FilterConfig {
  return {
    groupLogic: filters.groupLogic,
    groups: filters.groups.map((g) => ({
      id: g.id,
      conditions: g.conditions.map((c) => ({ ...c })),
    })),
  }
}

function defaultOperator(type: TableColumn['type']): FilterOperator {
  if (type === 'number' || type === 'percent') return 'greaterThan'
  if (type === 'date') return 'after'
  if (type === 'boolean') return 'equals'
  return 'contains'
}

/**
 * 筛选引擎：
 * - draft：UI 即时响应（输入不卡）
 * - applied：防抖后才计算索引（避免每次按键全表扫描）
 * - 返回索引而非复制全部行，分页时再取页切片
 */
export function useFilterEngine(rows: TableRow[], columns: TableColumn[]) {
  const [draft, setDraft] = useState<FilterConfig>(() => emptyFilterConfig())
  const [activeGroupId, setActiveGroupId] = useState<string | null>(draft.groups[0]?.id ?? null)
  const [busy, setBusy] = useState(false)
  const gen = useRef(0)

  const applied = useDebouncedValue(draft, 300)

  const indices = useMemo(
    () => filterRowIndices(rows, columns, applied),
    [rows, columns, applied],
  )

  const total = indices ? indices.length : rows.length

  const getPageRows = useCallback(
    (page: number, pageSize: number) => {
      const start = (page - 1) * pageSize
      const end = start + pageSize
      if (!indices) return rows.slice(start, end)
      return indices.slice(start, end).map((i) => rows[i])
    },
    [indices, rows],
  )

  const getAllMatchedRows = useCallback(() => {
    if (!indices) return rows
    return indices.map((i) => rows[i])
  }, [indices, rows])

  /** 外部（导入 / 切 Sheet）重置 */
  const reset = useCallback(() => {
    const next = emptyFilterConfig()
    setDraft(next)
    setActiveGroupId(next.groups[0]?.id ?? null)
  }, [])

  /** 一次性替换（模板 / 预设），用 transition 降低卡顿 */
  const replaceFilters = useCallback((next: FilterConfig) => {
    const cloned = cloneFilters(next)
    setBusy(true)
    const my = ++gen.current
    startTransition(() => {
      setDraft(cloned)
      setActiveGroupId(cloned.groups[0]?.id ?? null)
      requestAnimationFrame(() => {
        if (gen.current === my) setBusy(false)
      })
    })
  }, [])

  const setGroupLogic = useCallback((logic: 'AND' | 'OR') => {
    setDraft((prev) => ({ ...prev, groupLogic: logic }))
  }, [])

  const addCondition = useCallback((groupId: string) => {
    setDraft((prev) => {
      const next = cloneFilters(prev)
      const group = next.groups.find((g) => g.id === groupId)
      if (!group) return prev
      group.conditions.push(createEmptyCondition())
      return next
    })
    setActiveGroupId(groupId)
  }, [])

  const removeCondition = useCallback((groupId: string, conditionId: string) => {
    setDraft((prev) => {
      const next = cloneFilters(prev)
      const group = next.groups.find((g) => g.id === groupId)
      if (!group) return prev
      group.conditions = group.conditions.filter((c) => c.id !== conditionId)
      if (!group.conditions.length) group.conditions.push(createEmptyCondition())
      return next
    })
  }, [])

  const updateCondition = useCallback(
    (groupId: string, conditionId: string, patch: Partial<FilterCondition>) => {
      setDraft((prev) => {
        const next = cloneFilters(prev)
        const group = next.groups.find((g) => g.id === groupId)
        if (!group) return prev
        const cond = group.conditions.find((c) => c.id === conditionId)
        if (!cond) return prev
        Object.assign(cond, patch)
        return next
      })
    },
    [],
  )

  const addGroup = useCallback(() => {
    const g = createEmptyGroup()
    setDraft((prev) => ({ ...prev, groups: [...prev.groups, g] }))
    setActiveGroupId(g.id)
  }, [])

  const removeGroup = useCallback((groupId: string) => {
    setDraft((prev) => {
      let groups = prev.groups.filter((g) => g.id !== groupId)
      if (!groups.length) groups = [createEmptyGroup()]
      return { ...prev, groups }
    })
    setActiveGroupId((cur) => (cur === groupId ? null : cur))
  }, [])

  const addFieldFromHeader = useCallback(
    (fieldKey: string): { groupId: string; created: boolean } => {
      const col = columns.find((c) => c.key === fieldKey)
      if (!col) return { groupId: '', created: false }

      const next = cloneFilters(draft)
      let group = next.groups.find((g) => g.id === activeGroupId) ?? next.groups[next.groups.length - 1]
      if (!group) {
        group = createEmptyGroup()
        next.groups.push(group)
      }
      const operator = defaultOperator(col.type)
      const empty = group.conditions.find((c) => !c.field)
      let created = false
      if (empty) {
        empty.field = fieldKey
        empty.operator = operator
        empty.value = undefined
        empty.value2 = undefined
      } else {
        group.conditions.push({
          ...createEmptyCondition(),
          field: fieldKey,
          operator,
        })
        created = true
      }
      setDraft(next)
      setActiveGroupId(group.id)
      return { groupId: group.id, created }
    },
    [activeGroupId, columns, draft],
  )

  // 切数据源时自动重置筛选
  const rowsRef = useRef(rows)
  useEffect(() => {
    if (rowsRef.current !== rows) {
      rowsRef.current = rows
      reset()
    }
  }, [rows, reset])

  return {
    draft,
    applied,
    busy,
    activeGroupId,
    setActiveGroupId,
    total,
    getPageRows,
    getAllMatchedRows,
    reset,
    replaceFilters,
    setGroupLogic,
    addCondition,
    removeCondition,
    updateCondition,
    addGroup,
    removeGroup,
    addFieldFromHeader,
    snapshot: () => cloneFilters(draft),
  }
}
