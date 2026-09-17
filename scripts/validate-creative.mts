/**
 * 用真实素材表校验：解析换算 + 最低支持条件命中数
 * 运行：npx vite-node scripts/validate-creative.mts
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import { enrichSheetLike } from './validate-helpers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sample =
  process.argv[2] ||
  'E:/Zippo跨境电商/outputs/20260917_表格筛选器/Creative data 2026-09-10 - 2026-09-17 - Product 1733854367607392225.xlsx'

async function main() {
  if (!fs.existsSync(sample)) {
    console.error('sample missing:', sample)
    process.exit(1)
  }
  const buf = fs.readFileSync(sample)
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true, raw: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  }) as unknown[][]

  const { columns, rows, filtered, missing, labels } = await enrichSheetLike(matrix)
  console.log('file', path.basename(sample))
  console.log('rows', rows.length)
  console.log(
    'columns',
    columns.map((c) => `${c.title}:${c.type}${c.computed ? '(computed)' : ''}`).join(' | '),
  )
  console.log('missing fields', missing)
  console.log('labels', labels)
  console.log('filtered', filtered.length)

  const ctrCol = columns.find((c) => /click rate/i.test(c.key) || c.title.includes('点击率'))
  if (ctrCol) {
    console.log(
      'ctr normalized samples',
      rows.slice(0, 5).map((r) => r[ctrCol.key]),
    )
  }
  console.log(
    'age samples',
    rows.slice(0, 5).map((r) => r['素材天数']),
    'ref',
    dayjs().format('YYYY-MM-DD'),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
