import dayjs from 'dayjs'
import type { SheetData, TableColumn, TableRow } from '../src/types/table'
import {
  calcCreativeAgeDays,
  detectColumnType,
  looksLikePostedTimeHeader,
  normalizeCell,
  uniqueHeaderKeys,
} from '../src/utils/dataType'
import { filterRows } from '../src/utils/filter'
import { buildLowSupportPreset } from '../src/utils/presets'

export async function enrichSheetLike(matrix: unknown[][]) {
  const headerRow = matrix[0]
  const { keys, titles } = uniqueHeaderKeys(headerRow.map((h) => String(h ?? '')))
  const dataRows = matrix
    .slice(1)
    .filter((row) => row.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))

  const columns: TableColumn[] = keys.map((key, index) => {
    const samples = dataRows.map((r) => r[index])
    const detected = detectColumnType(titles[index], samples)
    return {
      key,
      title: titles[index],
      type: detected.type,
      visible: true,
      order: index,
      rateSource: detected.rateSource,
    }
  })

  const rows: TableRow[] = dataRows.map((raw, rowIndex) => {
    const row: TableRow = { __rowId: `v-${rowIndex}` }
    columns.forEach((col, colIndex) => {
      row[col.key] = normalizeCell(raw[colIndex], col.type, col.rateSource)
    })
    return row
  })

  const postedCol = columns.find(
    (c) => looksLikePostedTimeHeader(c.title) || looksLikePostedTimeHeader(c.key),
  )
  if (postedCol && !columns.some((c) => c.key === '素材天数')) {
    columns.push({
      key: '素材天数',
      title: '素材天数',
      type: 'number',
      visible: true,
      order: columns.length,
      computed: true,
    })
    const ref = dayjs()
    rows.forEach((row) => {
      row['素材天数'] = calcCreativeAgeDays(row[postedCol.key], ref)
    })
  }

  const { filters, missing, labels } = buildLowSupportPreset(columns)
  const filtered = filterRows(rows, columns, filters)
  const sheet: SheetData = { name: 'Sheet1', columns, rows }
  return { ...sheet, filtered, missing, labels }
}
