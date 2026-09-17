import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import type { ParsedWorkbook, SheetData, TableColumn, TableRow } from '../types/table'
import {
  calcCreativeAgeDays,
  detectColumnType,
  looksLikePostedTimeHeader,
  normalizeCell,
  uniqueHeaderKeys,
} from './dataType'

const SAMPLE_SIZE = 200
const CHUNK_SIZE = 2000
/** 软上限：超过仍可导入，但会提示并分片处理 */
export const LARGE_ROW_HINT = 30000

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => resolve(), { timeout: 32 })
    } else {
      setTimeout(resolve, 0)
    }
  })
}

function sheetToMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  }) as unknown[][]
}

export type ParseProgress = (info: { stage: string; percent: number }) => void

async function enrichSheet(
  name: string,
  matrix: unknown[][],
  onProgress?: ParseProgress,
): Promise<SheetData> {
  if (!matrix.length) {
    throw new Error('文件为空，无法导入。')
  }

  const headerRow = matrix[0]
  if (!headerRow || headerRow.every((c) => c === null || c === undefined || String(c).trim() === '')) {
    throw new Error('无法识别表头，请检查文件格式。')
  }

  const { keys, titles } = uniqueHeaderKeys(headerRow.map((h) => String(h ?? '')))
  const dataRows = matrix
    .slice(1)
    .filter((row) => row.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))

  if (!dataRows.length) {
    throw new Error('文件为空，无法导入。')
  }

  onProgress?.({ stage: `识别字段（${name}）`, percent: 15 })

  const columns: TableColumn[] = keys.map((key, index) => {
    const samples = dataRows.slice(0, SAMPLE_SIZE).map((r) => r[index])
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

  const rows: TableRow[] = new Array(dataRows.length)
  const total = dataRows.length

  for (let start = 0; start < total; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, total)
    for (let i = start; i < end; i++) {
      const raw = dataRows[i]
      const row: TableRow = { __rowId: `${name}-${i}` }
      for (let colIndex = 0; colIndex < columns.length; colIndex++) {
        const col = columns[colIndex]
        row[col.key] = normalizeCell(raw[colIndex], col.type, col.rateSource)
      }
      rows[i] = row
    }
    const percent = 20 + Math.floor((end / total) * 70)
    onProgress?.({ stage: `转换数据 ${end.toLocaleString()}/${total.toLocaleString()}`, percent })
    if (end < total) await yieldToMain()
  }

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
    for (let i = 0; i < rows.length; i++) {
      rows[i]['素材天数'] = calcCreativeAgeDays(rows[i][postedCol.key], ref)
      if (i > 0 && i % CHUNK_SIZE === 0) await yieldToMain()
    }
  }

  onProgress?.({ stage: `完成 ${name}`, percent: 100 })
  return { name, columns, rows }
}

export async function parseTableFile(
  file: File,
  onProgress?: ParseProgress,
): Promise<ParsedWorkbook> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) {
    throw new Error('暂不支持该文件格式，请上传 XLSX、XLS 或 CSV 文件。')
  }

  try {
    onProgress?.({ stage: '读取文件', percent: 5 })
    const buffer = await file.arrayBuffer()
    await yieldToMain()
    onProgress?.({ stage: '解析工作簿', percent: 10 })

    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
      raw: true,
    })

    if (!workbook.SheetNames.length) {
      throw new Error('文件为空，无法导入。')
    }

    // 先只完整解析第一个 Sheet，其余延后到切换时（由 store 触发）
    const sheets: SheetData[] = []
    const firstName = workbook.SheetNames[0]
    const firstMatrix = sheetToMatrix(workbook.Sheets[firstName])
    sheets.push(await enrichSheet(firstName, firstMatrix, onProgress))

    // 其余 sheet 延后到切换时再解析
    const deferred: Record<string, unknown[][]> = {}
    for (let i = 1; i < workbook.SheetNames.length; i++) {
      const sheetName = workbook.SheetNames[i]
      deferred[sheetName] = sheetToMatrix(workbook.Sheets[sheetName])
      sheets.push({ name: sheetName, columns: [], rows: [] })
    }

    return {
      fileName: file.name,
      sheets,
      deferredMatrices: deferred,
    }
  } catch (err) {
    if (err instanceof Error && /暂不支持|文件为空|无法识别/.test(err.message)) throw err
    throw new Error('文件读取失败，请检查文件是否损坏。')
  }
}

export async function enrichDeferredSheet(
  name: string,
  matrix: unknown[][],
  onProgress?: ParseProgress,
): Promise<SheetData> {
  return enrichSheet(name, matrix, onProgress)
}
