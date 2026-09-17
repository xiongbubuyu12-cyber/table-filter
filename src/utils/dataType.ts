import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import type { CellValue, ColumnType } from '../types/table'

dayjs.extend(customParseFormat)

const EMPTY_MARKERS = new Set(['', '-', '—', 'N/A', 'n/a', 'null', 'undefined', '#N/A'])

export function isEmptyCell(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return EMPTY_MARKERS.has(value.trim())
  return false
}

export function parseNumber(value: unknown): number | null {
  if (isEmptyCell(value)) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  const raw = String(value).trim().replace(/,/g, '').replace(/%/g, '')
  if (!raw || EMPTY_MARKERS.has(raw)) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const DATE_FORMATS = [
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD HH:mm',
  'YYYY/MM/DD HH:mm:ss',
  'YYYY/MM/DD HH:mm',
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
]

export function parseDate(value: unknown): dayjs.Dayjs | null {
  if (isEmptyCell(value)) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return dayjs(value)
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date roughly
    if (value > 20000 && value < 80000) {
      const excelEpoch = dayjs('1899-12-30')
      return excelEpoch.add(value, 'day')
    }
  }
  const s = String(value).trim()
  for (const fmt of DATE_FORMATS) {
    const d = dayjs(s, fmt, true)
    if (d.isValid()) return d
  }
  const loose = dayjs(s)
  return loose.isValid() ? loose : null
}

export function looksLikeRateHeader(title: string): boolean {
  const t = title.toLowerCase()
  return (
    /rate|ctr|cvr|点击率|转化率|完播|观看率|view rate/i.test(t) ||
    t.includes('click rate') ||
    t.includes('conversion rate')
  )
}

export function looksLikeDateHeader(title: string): boolean {
  return /time|date|日期|时间|posted|发布时间|素材时间/i.test(title)
}

export function looksLikePostedTimeHeader(title: string): boolean {
  return /time posted|发布时间|素材时间|posted/i.test(title)
}

export function normalizeCell(
  value: unknown,
  type: ColumnType,
  rateSource?: 'decimal' | 'percent',
): CellValue {
  if (isEmptyCell(value)) return null

  if (type === 'boolean') {
    if (typeof value === 'boolean') return value
    const s = String(value).trim().toLowerCase()
    if (['true', '1', '是', 'yes', 'y'].includes(s)) return true
    if (['false', '0', '否', 'no', 'n'].includes(s)) return false
    return String(value)
  }

  if (type === 'number') {
    return parseNumber(value)
  }

  if (type === 'percent') {
    const n = parseNumber(value)
    if (n === null) return null
    // 源表多为 0.0506 表示 5.06%；若已是百分数 (>1 且常见 <=100) 则原样
    if (rateSource === 'percent') return n
    if (rateSource === 'decimal' || Math.abs(n) <= 1) return Number((n * 100).toFixed(6))
    return n
  }

  if (type === 'date') {
    const d = parseDate(value)
    return d ? d.format('YYYY-MM-DD HH:mm:ss') : String(value)
  }

  return String(value)
}

export function detectColumnType(title: string, values: unknown[]): {
  type: ColumnType
  rateSource?: 'decimal' | 'percent'
} {
  const nonEmpty = values.filter((v) => !isEmptyCell(v))
  if (nonEmpty.length === 0) return { type: 'string' }

  if (looksLikeRateHeader(title)) {
    const nums = nonEmpty.map(parseNumber).filter((n): n is number => n !== null)
    if (nums.length >= nonEmpty.length * 0.6) {
      const mostlyDecimal = nums.filter((n) => Math.abs(n) <= 1).length >= nums.length * 0.7
      return { type: 'percent', rateSource: mostlyDecimal ? 'decimal' : 'percent' }
    }
  }

  const boolCount = nonEmpty.filter((v) => {
    if (typeof v === 'boolean') return true
    const s = String(v).trim().toLowerCase()
    return ['true', 'false', '是', '否', 'yes', 'no'].includes(s)
  }).length
  if (boolCount >= nonEmpty.length * 0.9) return { type: 'boolean' }

  const numCount = nonEmpty.filter((v) => parseNumber(v) !== null).length
  const dateHint = looksLikeDateHeader(title)
  const dateCount = nonEmpty.filter((v) => parseDate(v) !== null).length

  if (dateHint && dateCount >= nonEmpty.length * 0.6) return { type: 'date' }
  if (numCount >= nonEmpty.length * 0.8) {
    // 避免把纯数字日期串误判：如 20260101 且表头像日期
    if (dateHint && dateCount >= nonEmpty.length * 0.6) return { type: 'date' }
    return { type: 'number' }
  }
  if (dateCount >= nonEmpty.length * 0.8) return { type: 'date' }

  return { type: 'string' }
}

export function calcCreativeAgeDays(posted: unknown, reference = dayjs()): number | null {
  const d = parseDate(posted)
  if (!d) return null
  const days = reference.startOf('day').diff(d.startOf('day'), 'day')
  return days
}

export function uniqueHeaderKeys(headers: string[]): { keys: string[]; titles: string[] } {
  const seen = new Map<string, number>()
  const keys: string[] = []
  const titles: string[] = []
  headers.forEach((raw, i) => {
    const title = String(raw ?? '').trim() || `列${i + 1}`
    const base = title
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    const key = count === 1 ? base : `${base}_${count}`
    keys.push(key)
    titles.push(title)
  })
  return { keys, titles }
}
