import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import type { ColumnType, TableColumn, TableRow } from '../types/table'
import { isEmptyCell, parseDate, parseNumber } from './dataType'
import { formatCellDisplay } from './filter'

export type ExportFormat = 'xlsx' | 'csv' | 'txt'

/**
 * 按「字段设置」中的类型导出单元格，避免仍按导入时的原始形态写出。
 */
export function exportCellByType(
  raw: unknown,
  type: ColumnType,
): string | number | boolean | null {
  if (isEmptyCell(raw)) return null

  switch (type) {
    case 'number': {
      const n = parseNumber(raw)
      return n
    }
    case 'percent': {
      const n = parseNumber(raw)
      return n === null ? null : Number(n.toFixed(6))
    }
    case 'date': {
      const d = parseDate(raw)
      return d ? d.format('YYYY-MM-DD HH:mm:ss') : String(raw)
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw
      const s = String(raw).trim().toLowerCase()
      if (['true', '1', '是', 'yes', 'y'].includes(s)) return true
      if (['false', '0', '否', 'no', 'n'].includes(s)) return false
      return null
    }
    default:
      return String(raw)
  }
}

function buildTypedRows(
  rows: TableRow[],
  cols: TableColumn[],
): Record<string, string | number | boolean | null>[] {
  return rows.map((row) => {
    const obj: Record<string, string | number | boolean | null> = {}
    cols.forEach((col) => {
      obj[col.title] = exportCellByType(row[col.key], col.type)
    })
    return obj
  })
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function toTsv(rows: Record<string, string | number | boolean | null>[], headers: string[]): string {
  const escape = (v: string | number | boolean | null) => {
    const s = v === null || v === undefined ? '' : String(v)
    return s.replace(/\t/g, ' ').replace(/\r?\n/g, ' ')
  }
  const lines = [headers.join('\t')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h] ?? '')).join('\t'))
  }
  return lines.join('\n')
}

export function exportFilteredData(options: {
  rows: TableRow[]
  columns: TableColumn[]
  format: ExportFormat
  fileName: string
  selectedKeys: string[]
}) {
  const { rows, columns, format, fileName, selectedKeys } = options
  const cols = columns
    .filter((c) => selectedKeys.includes(c.key))
    .sort((a, b) => a.order - b.order)

  if (!cols.length) return

  const stamp = dayjs().format('YYYYMMDD_HHmmss')
  const base = fileName.replace(/\.(xlsx|xls|csv|txt)$/i, '')
  const headers = cols.map((c) => c.title)

  if (format === 'txt') {
    // 文本：按字段类型的展示格式（百分比带 %、日期格式化等）
    const displayRows = rows.map((row) => {
      const obj: Record<string, string | number | boolean | null> = {}
      cols.forEach((col) => {
        obj[col.title] = formatCellDisplay(row[col.key], col.type)
      })
      return obj
    })
    downloadText(`${base}_筛选结果_${stamp}.txt`, toTsv(displayRows, headers))
    return
  }

  // Excel / CSV：按字段类型写出数值/日期/布尔，与字段设置一致
  const data = buildTypedRows(rows, cols)
  const outName = `${base}_筛选结果_${stamp}.${format}`
  const sheet = XLSX.utils.json_to_sheet(data)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, '筛选结果')
  XLSX.writeFile(book, outName)
}
