import dayjs from 'dayjs'
import type {
  ColumnType,
  FilterCondition,
  FilterConfig,
  FilterOperator,
  TableColumn,
  TableRow,
} from '../types/table'
import { isEmptyCell, parseDate, parseNumber } from './dataType'

const TEXT_OPS: FilterOperator[] = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'isEmpty',
  'isNotEmpty',
  'in',
]

const NUMBER_OPS: FilterOperator[] = [
  'equals',
  'notEquals',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'between',
  'isEmpty',
  'isNotEmpty',
]

const DATE_OPS: FilterOperator[] = [
  'equals',
  'before',
  'beforeOrEqual',
  'after',
  'afterOrEqual',
  'dateBetween',
  'isEmpty',
  'isNotEmpty',
]

const BOOL_OPS: FilterOperator[] = ['equals', 'notEquals', 'isEmpty', 'isNotEmpty']

export function operatorsForType(type: ColumnType): { value: FilterOperator; label: string }[] {
  const map: Record<FilterOperator, string> = {
    equals: '等于',
    notEquals: '不等于',
    contains: '包含',
    notContains: '不包含',
    startsWith: '开头是',
    endsWith: '结尾是',
    greaterThan: '大于',
    greaterThanOrEqual: '大于等于',
    lessThan: '小于',
    lessThanOrEqual: '小于等于',
    between: '介于',
    in: '属于',
    isEmpty: '为空',
    isNotEmpty: '不为空',
    before: '早于',
    beforeOrEqual: '早于或等于',
    after: '晚于',
    afterOrEqual: '晚于或等于',
    dateBetween: '日期范围',
  }

  let ops: FilterOperator[] = TEXT_OPS
  if (type === 'number' || type === 'percent') ops = NUMBER_OPS
  else if (type === 'date') ops = DATE_OPS
  else if (type === 'boolean') ops = BOOL_OPS

  return ops.map((value) => ({ value, label: map[value] }))
}

function asText(value: unknown): string {
  if (isEmptyCell(value)) return ''
  return String(value).toLowerCase()
}

function matchCondition(row: TableRow, condition: FilterCondition, columns: TableColumn[]): boolean {
  const col = columns.find((c) => c.key === condition.field)
  if (!col) return true

  const cell = row[condition.field]
  const op = condition.operator

  if (op === 'isEmpty') return isEmptyCell(cell)
  if (op === 'isNotEmpty') return !isEmptyCell(cell)

  if (col.type === 'number' || col.type === 'percent') {
    const n = parseNumber(cell)
    const v1 = parseNumber(condition.value as unknown)
    const v2 = parseNumber(condition.value2 as unknown)
    if (op === 'between') {
      if (n === null || v1 === null || v2 === null) return false
      return n >= Math.min(v1, v2) && n <= Math.max(v1, v2)
    }
    if (v1 === null && ['equals', 'notEquals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual'].includes(op)) {
      return false
    }
    switch (op) {
      case 'equals':
        return n !== null && n === v1
      case 'notEquals':
        return n === null || n !== v1
      case 'greaterThan':
        return n !== null && v1 !== null && n > v1
      case 'greaterThanOrEqual':
        return n !== null && v1 !== null && n >= v1
      case 'lessThan':
        return n !== null && v1 !== null && n < v1
      case 'lessThanOrEqual':
        return n !== null && v1 !== null && n <= v1
      default:
        return true
    }
  }

  if (col.type === 'date') {
    const d = parseDate(cell)
    const v1 = parseDate(condition.value as unknown)
    const v2 = parseDate(condition.value2 as unknown)
    if (!d && op !== 'notEquals') return false
    switch (op) {
      case 'equals':
        return !!d && !!v1 && d.isSame(v1, 'day')
      case 'before':
        return !!d && !!v1 && d.isBefore(v1, 'day')
      case 'beforeOrEqual':
        return !!d && !!v1 && (d.isBefore(v1, 'day') || d.isSame(v1, 'day'))
      case 'after':
        return !!d && !!v1 && d.isAfter(v1, 'day')
      case 'afterOrEqual':
        return !!d && !!v1 && (d.isAfter(v1, 'day') || d.isSame(v1, 'day'))
      case 'dateBetween': {
        if (!d || !v1 || !v2) return false
        const start = v1.isBefore(v2) ? v1 : v2
        const end = v1.isBefore(v2) ? v2 : v1
        return (d.isAfter(start, 'day') || d.isSame(start, 'day')) && (d.isBefore(end, 'day') || d.isSame(end, 'day'))
      }
      default:
        return true
    }
  }

  if (col.type === 'boolean') {
    const b = cell === true || cell === false ? cell : null
    const expected = condition.value === true || condition.value === 'true' || condition.value === 1
    if (op === 'equals') return b === expected
    if (op === 'notEquals') return b !== expected
    return true
  }

  // string
  const text = asText(cell)
  const target = asText(condition.value)
  switch (op) {
    case 'equals':
      return text === target
    case 'notEquals':
      return text !== target
    case 'contains':
      return text.includes(target)
    case 'notContains':
      return !text.includes(target)
    case 'startsWith':
      return text.startsWith(target)
    case 'endsWith':
      return text.endsWith(target)
    case 'in': {
      const list = Array.isArray(condition.value)
        ? condition.value.map((x) => asText(x))
        : String(condition.value ?? '')
            .split(/[,，]/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
      return list.includes(text)
    }
    default:
      return true
  }
}

export function isConditionActive(condition: FilterCondition): boolean {
  if (!condition.field || !condition.operator) return false
  if (condition.operator === 'isEmpty' || condition.operator === 'isNotEmpty') return true
  if (condition.operator === 'in') {
    return Array.isArray(condition.value)
      ? condition.value.length > 0
      : String(condition.value ?? '').trim().length > 0
  }
  if (condition.operator === 'between' || condition.operator === 'dateBetween') {
    return (
      condition.value !== undefined &&
      condition.value !== '' &&
      condition.value2 !== undefined &&
      condition.value2 !== ''
    )
  }
  return condition.value !== undefined && condition.value !== ''
}

function matchGroup(row: TableRow, conditions: FilterCondition[], columns: TableColumn[]): boolean {
  const active = conditions.filter(isConditionActive)
  if (!active.length) return true
  return active.every((c) => matchCondition(row, c, columns))
}

export function filterRowIndices(
  rows: TableRow[],
  columns: TableColumn[],
  config: FilterConfig,
): number[] | null {
  const groups = config.groups.filter((g) => g.conditions.some(isConditionActive))
  if (!groups.length) return null

  const indices: number[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const results = groups.map((g) => matchGroup(row, g.conditions, columns))
    const ok = config.groupLogic === 'OR' ? results.some(Boolean) : results.every(Boolean)
    if (ok) indices.push(i)
  }
  return indices
}

export function filterRows(rows: TableRow[], columns: TableColumn[], config: FilterConfig): TableRow[] {
  const indices = filterRowIndices(rows, columns, config)
  if (!indices) return rows
  return indices.map((i) => rows[i])
}

export function createEmptyCondition(): FilterCondition {
  return {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    field: '',
    operator: 'contains',
    value: undefined,
    value2: undefined,
  }
}

export function createEmptyGroup(): FilterConfig['groups'][number] {
  return {
    id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    conditions: [createEmptyCondition()],
  }
}

export function emptyFilterConfig(): FilterConfig {
  return { groupLogic: 'AND', groups: [createEmptyGroup()] }
}

export function formatCellDisplay(value: unknown, type: ColumnType): string {
  if (isEmptyCell(value)) return '—'
  if (type === 'percent' && typeof value === 'number') {
    return `${Number(value.toFixed(2))}%`
  }
  if (type === 'number' && typeof value === 'number') {
    if (Number.isInteger(value) || Math.abs(value) >= 1e15) {
      return value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 })
    }
    return String(Number(value.toFixed(4)))
  }
  if (type === 'date') {
    const d = parseDate(value)
    return d ? d.format('YYYY-MM-DD HH:mm') : String(value)
  }
  if (type === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 })
  }
  return String(value)
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${dayjs().valueOf()}-${Math.random().toString(36).slice(2, 7)}`
}
