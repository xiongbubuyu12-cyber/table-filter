import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import type { ColumnType, TableColumn, TableRow } from '../types/table'
import { isEmptyCell, looksLikeIdHeader, parseDate, parseNumber, toPlainText } from './dataType'
import { formatCellDisplay } from './filter'

export type ExportFormat = 'xlsx' | 'csv' | 'txt'

function shouldExportAsText(col: TableColumn): boolean {
  return col.type === 'string' || looksLikeIdHeader(col.title) || looksLikeIdHeader(col.key)
}

/**
 * 按「字段设置」中的类型导出单元格，避免仍按导入时的原始形态写出。
 * ID / 文本字段一律导出为纯文本，防止 Excel 科学计数法。
 */
export function exportCellByType(
  raw: unknown,
  type: ColumnType,
  col?: TableColumn,
): string | number | boolean | null {
  if (isEmptyCell(raw)) return null

  if (col && shouldExportAsText(col)) {
    return toPlainText(raw)
  }

  switch (type) {
    case 'number': {
      const n = parseNumber(raw)
      // 超长整型用文本写出，避免精度丢失与科学计数法
      if (n !== null && Number.isInteger(n) && Math.abs(n) >= 1e15) {
        return toPlainText(n)
      }
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
      return toPlainText(raw)
  }
}

function buildTypedMatrix(
  rows: TableRow[],
  cols: TableColumn[],
): { headers: string[]; matrix: (string | number | boolean | null)[][]; textCols: boolean[] } {
  const headers = cols.map((c) => c.title)
  const textCols = cols.map((c) => shouldExportAsText(c))
  const matrix = rows.map((row) =>
    cols.map((col) => exportCellByType(row[col.key], col.type, col)),
  )
  return { headers, matrix, textCols }
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

function needsExcelTextGuard(value: string): boolean {
  // 长数字 / 科学计数法文本：Excel 打开 CSV 时会当成数字
  return /^\d{12,}$/.test(value) || /^\d+(\.\d+)?e[+\-]?\d+$/i.test(value)
}

function toDelimited(
  rows: Record<string, string | number | boolean | null>[],
  headers: string[],
  sep: '\t' | ',',
  textHeaderSet: Set<string>,
): string {
  const escape = (header: string, v: string | number | boolean | null) => {
    let s = v === null || v === undefined ? '' : String(v)
    s = s.replace(/\r?\n/g, ' ')
    if (sep === '\t') {
      s = s.replace(/\t/g, ' ')
      if (textHeaderSet.has(header) && needsExcelTextGuard(s)) {
        return `="${s}"`
      }
      return s
    }
    // CSV
    if (textHeaderSet.has(header) && needsExcelTextGuard(s)) {
      s = `="${s}"`
    }
    if (/[",\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const lines = [headers.join(sep)]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(h, row[h] ?? '')).join(sep))
  }
  return lines.join('\n')
}

function buildWorkbookSheet(
  headers: string[],
  matrix: (string | number | boolean | null)[][],
  textCols: boolean[],
): XLSX.WorkSheet {
  const aoa: (string | number | boolean | null)[][] = [headers, ...matrix]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)

  // 强制文本列 / 长数字单元格为 Excel 文本，避免科学计数法
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < textCols.length; c++) {
      const value = matrix[r][c]
      if (value === null || value === undefined) continue
      const asText =
        textCols[c] ||
        (typeof value === 'string' && needsExcelTextGuard(value)) ||
        (typeof value === 'number' && Number.isInteger(value) && Math.abs(value) >= 1e15)
      if (!asText) continue
      const addr = XLSX.utils.encode_cell({ r: r + 1, c })
      const text = typeof value === 'string' ? value : toPlainText(value)
      sheet[addr] = { t: 's', v: text, z: '@' }
    }
  }

  return sheet
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
  const textHeaderSet = new Set(cols.filter(shouldExportAsText).map((c) => c.title))

  if (format === 'txt') {
    // 文本：按字段类型的展示格式（百分比带 %、日期格式化等）
    const displayRows = rows.map((row) => {
      const obj: Record<string, string | number | boolean | null> = {}
      cols.forEach((col) => {
        obj[col.title] = formatCellDisplay(row[col.key], col.type)
      })
      return obj
    })
    downloadText(`${base}_筛选结果_${stamp}.txt`, toDelimited(displayRows, headers, '\t', textHeaderSet))
    return
  }

  const { matrix, textCols } = buildTypedMatrix(rows, cols)
  const outName = `${base}_筛选结果_${stamp}.${format}`

  if (format === 'csv') {
    const dataRows = matrix.map((cells) => {
      const obj: Record<string, string | number | boolean | null> = {}
      headers.forEach((h, i) => {
        obj[h] = cells[i]
      })
      return obj
    })
    downloadText(outName, toDelimited(dataRows, headers, ',', textHeaderSet))
    return
  }

  // Excel：文本列写为字符串单元格（格式 @）
  const sheet = buildWorkbookSheet(headers, matrix, textCols)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, '筛选结果')
  XLSX.writeFile(book, outName)
}
