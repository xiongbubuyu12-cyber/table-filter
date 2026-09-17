export type ColumnType = 'string' | 'number' | 'date' | 'boolean' | 'percent'

export interface TableColumn {
  key: string
  title: string
  type: ColumnType
  visible: boolean
  order: number
  /** 导入时自动识别的比率列（源值为 0~1 小数） */
  rateSource?: 'decimal' | 'percent'
  /** 计算列，不来自原始表 */
  computed?: boolean
}

export type CellValue = string | number | boolean | null

export interface TableRow {
  __rowId: string
  [key: string]: CellValue
}

export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'between'
  | 'in'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'before'
  | 'beforeOrEqual'
  | 'after'
  | 'afterOrEqual'
  | 'dateBetween'

export interface FilterCondition {
  id: string
  field: string
  operator: FilterOperator
  value?: unknown
  value2?: unknown
}

export interface FilterGroup {
  id: string
  conditions: FilterCondition[]
}

export interface FilterConfig {
  /** 组内条件默认 AND；组与组之间由此控制 */
  groupLogic: 'AND' | 'OR'
  groups: FilterGroup[]
}

export interface SavedFilter {
  id: string
  name: string
  createdAt: string
  updatedAt?: string
  /** 作为可复用模板 */
  isTemplate?: boolean
  note?: string
  filters: FilterConfig
}

export interface ImportHistoryItem {
  id: string
  fileName: string
  importedAt: string
  rowCount: number
  sheetName: string
}

export interface SheetData {
  name: string
  columns: TableColumn[]
  rows: TableRow[]
}

export interface ParsedWorkbook {
  fileName: string
  sheets: SheetData[]
  deferredMatrices?: Record<string, unknown[][]>
}
