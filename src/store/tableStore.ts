import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  FilterConfig,
  ImportHistoryItem,
  SavedFilter,
  TableColumn,
  TableRow,
} from '../types/table'
import { enrichDeferredSheet, LARGE_ROW_HINT, parseTableFile } from '../utils/excel'
import { uid } from '../utils/filter'

interface TableState {
  fileName: string
  sheetNames: string[]
  currentSheet: string
  columns: TableColumn[]
  rows: TableRow[]
  sheetCache: Record<string, { columns: TableColumn[]; rows: TableRow[] }>
  deferredMatrices: Record<string, unknown[][]>
  savedFilters: SavedFilter[]
  history: ImportHistoryItem[]
  loading: boolean
  loadingTip: string
  loadingPercent: number
  error: string | null
  dataVersion: number

  importFile: (file: File) => Promise<{ rowCount: number; large: boolean }>
  switchSheet: (name: string) => Promise<void>
  setColumns: (columns: TableColumn[]) => void
  saveTemplate: (name: string, filters: FilterConfig, note?: string, updateId?: string) => void
  deleteSavedFilter: (id: string) => void
  getTemplate: (id: string) => SavedFilter | undefined
}

function cloneFilters(filters: FilterConfig): FilterConfig {
  return JSON.parse(JSON.stringify(filters)) as FilterConfig
}

export const useTableStore = create<TableState>()(
  persist(
    (set, get) => ({
      fileName: '',
      sheetNames: [],
      currentSheet: '',
      columns: [],
      rows: [],
      sheetCache: {},
      deferredMatrices: {},
      savedFilters: [],
      history: [],
      loading: false,
      loadingTip: '',
      loadingPercent: 0,
      error: null,
      dataVersion: 0,

      importFile: async (file) => {
        set({ loading: true, loadingTip: '准备导入…', loadingPercent: 0, error: null })
        try {
          const parsed = await parseTableFile(file, ({ stage, percent }) => {
            set({ loadingTip: stage, loadingPercent: percent })
          })
          const cache: TableState['sheetCache'] = {}
          parsed.sheets.forEach((s) => {
            if (s.rows.length || s.columns.length) {
              cache[s.name] = { columns: s.columns, rows: s.rows }
            }
          })
          const first = parsed.sheets[0]
          const historyItem: ImportHistoryItem = {
            id: uid('h'),
            fileName: parsed.fileName,
            importedAt: new Date().toISOString(),
            rowCount: first.rows.length,
            sheetName: first.name,
          }
          set({
            fileName: parsed.fileName,
            sheetNames: parsed.sheets.map((s) => s.name),
            currentSheet: first.name,
            columns: first.columns,
            rows: first.rows,
            sheetCache: cache,
            deferredMatrices: parsed.deferredMatrices ?? {},
            history: [historyItem, ...get().history.filter((h) => h.fileName !== parsed.fileName)].slice(
              0,
              8,
            ),
            loading: false,
            loadingTip: '',
            loadingPercent: 100,
            error: null,
            dataVersion: get().dataVersion + 1,
          })
          return { rowCount: first.rows.length, large: first.rows.length >= LARGE_ROW_HINT }
        } catch (err) {
          set({
            loading: false,
            loadingTip: '',
            loadingPercent: 0,
            error: err instanceof Error ? err.message : '文件读取失败，请检查文件是否损坏。',
          })
          throw err
        }
      },

      switchSheet: async (name) => {
        const cached = get().sheetCache[name]
        if (cached && cached.rows.length) {
          set({
            currentSheet: name,
            columns: cached.columns,
            rows: cached.rows,
            dataVersion: get().dataVersion + 1,
          })
          return
        }

        const matrix = get().deferredMatrices[name]
        if (!matrix) return

        set({ loading: true, loadingTip: `加载工作表 ${name}…`, loadingPercent: 0 })
        try {
          const sheet = await enrichDeferredSheet(name, matrix, ({ stage, percent }) => {
            set({ loadingTip: stage, loadingPercent: percent })
          })
          const cache = {
            ...get().sheetCache,
            [name]: { columns: sheet.columns, rows: sheet.rows },
          }
          const deferred = { ...get().deferredMatrices }
          delete deferred[name]
          set({
            sheetCache: cache,
            deferredMatrices: deferred,
            currentSheet: name,
            columns: sheet.columns,
            rows: sheet.rows,
            loading: false,
            loadingTip: '',
            loadingPercent: 100,
            dataVersion: get().dataVersion + 1,
          })
        } catch (err) {
          set({
            loading: false,
            loadingTip: '',
            error: err instanceof Error ? err.message : '工作表加载失败',
          })
          throw err
        }
      },

      setColumns: (columns) => {
        const name = get().currentSheet
        const sheetCache = { ...get().sheetCache }
        if (name && sheetCache[name]) {
          sheetCache[name] = { ...sheetCache[name], columns: columns.map((c) => ({ ...c })) }
        }
        set({ columns, sheetCache })
      },

      saveTemplate: (name, filters, note, updateId) => {
        const now = new Date().toISOString()
        if (updateId) {
          set({
            savedFilters: get().savedFilters.map((item) =>
              item.id === updateId
                ? {
                    ...item,
                    name,
                    note,
                    updatedAt: now,
                    isTemplate: true,
                    filters: cloneFilters(filters),
                  }
                : item,
            ),
          })
          return
        }
        const item: SavedFilter = {
          id: uid('sf'),
          name,
          note,
          createdAt: now,
          updatedAt: now,
          isTemplate: true,
          filters: cloneFilters(filters),
        }
        set({ savedFilters: [item, ...get().savedFilters].slice(0, 40) })
      },

      deleteSavedFilter: (id) => {
        set({ savedFilters: get().savedFilters.filter((s) => s.id !== id) })
      },

      getTemplate: (id) => get().savedFilters.find((s) => s.id === id),
    }),
    {
      name: 'table-filter-store-v2',
      partialize: (s) => ({
        savedFilters: s.savedFilters,
        history: s.history,
      }),
    },
  ),
)
