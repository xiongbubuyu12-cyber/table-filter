import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import type { TableColumn, TableRow } from '../types/table'

export function exportFilteredData(options: {
  rows: TableRow[]
  columns: TableColumn[]
  format: 'xlsx' | 'csv'
  fileName: string
  selectedKeys: string[]
}) {
  const { rows, columns, format, fileName, selectedKeys } = options
  const cols = columns
    .filter((c) => selectedKeys.includes(c.key))
    .sort((a, b) => a.order - b.order)

  const data = rows.map((row) => {
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

  const stamp = dayjs().format('YYYYMMDD_HHmmss')
  const base = fileName.replace(/\.(xlsx|xls|csv)$/i, '')
  const outName = `${base}_筛选结果_${stamp}.${format}`

  const sheet = XLSX.utils.json_to_sheet(data)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, '筛选结果')
  XLSX.writeFile(book, outName)
}
