import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import type { TableColumn, TableRow } from '../types/table'
import { formatCellDisplay } from './filter'

export type ExportFormat = 'xlsx' | 'csv' | 'txt'

function buildRows(
  rows: TableRow[],
  cols: TableColumn[],
): Record<string, string | number | boolean | null>[] {
  return rows.map((row) => {
    const obj: Record<string, string | number | boolean | null> = {}
    cols.forEach((col) => {
      const raw = row[col.key]
      if (col.type === 'percent' && typeof raw === 'number') {
        obj[col.title] = Number(raw.toFixed(4))
      } else if (raw === null || raw === undefined) {
        obj[col.title] = ''
      } else {
        obj[col.title] = raw as string | number | boolean
      }
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
  const data = buildRows(rows, cols)
  const headers = cols.map((c) => c.title)

  if (format === 'txt') {
    // 纯文本：制表符分隔，便于粘贴到记事本 / 飞书
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

  const outName = `${base}_筛选结果_${stamp}.${format}`
  const sheet = XLSX.utils.json_to_sheet(data)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, '筛选结果')
  XLSX.writeFile(book, outName)
}
