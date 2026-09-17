import { memo, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Radio,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Upload,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ClearOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FilterOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  HistoryOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  SnippetsOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useTableStore } from './store/tableStore'
import { formatCellDisplay, isConditionActive, operatorsForType } from './utils/filter'
import { exportFilteredData, type ExportFormat } from './utils/export'
import { moveVisibleBlock, sortedVisible, visibleRangeKeys } from './utils/columnOrder'
import { BUILTIN_PRESET_NAME, buildLowSupportPreset, LOW_SUPPORT_RULE_TEXT } from './utils/presets'
import { useFilterEngine } from './hooks/useFilterEngine'
import CellPeekFrame, { type PeekPayload } from './components/CellPeekFrame'
import ColumnHeader from './components/ColumnHeader'
import type { ColumnType, FilterOperator, TableColumn, TableRow } from './types/table'

const TYPE_OPTIONS: { value: ColumnType; label: string }[] = [
  { value: 'string', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'percent', label: '百分比' },
  { value: 'date', label: '日期' },
  { value: 'boolean', label: '布尔' },
]

/** 条件值：纯输入，不做枚举下拉扫全表 */
const ValueEditor = memo(function ValueEditor({
  type,
  operator,
  value,
  value2,
  onChange,
}: {
  type: ColumnType
  operator: FilterOperator
  value: unknown
  value2: unknown
  onChange: (patch: { value?: unknown; value2?: unknown }) => void
}) {
  if (operator === 'isEmpty' || operator === 'isNotEmpty') {
    return <span style={{ color: '#9ca3af' }}>—</span>
  }

  if (operator === 'in') {
    return (
      <Input
        placeholder="多个值用逗号分隔，如：视频,商品卡片"
        value={Array.isArray(value) ? value.join(',') : ((value as string) ?? '')}
        onChange={(e) => onChange({ value: e.target.value })}
        allowClear
      />
    )
  }

  if (operator === 'between') {
    return (
      <Space.Compact style={{ width: '100%' }}>
        <InputNumber
          style={{ width: '50%' }}
          placeholder="最小"
          value={value as number | null}
          onChange={(v) => onChange({ value: v ?? undefined })}
        />
        <InputNumber
          style={{ width: '50%' }}
          placeholder="最大"
          value={value2 as number | null}
          onChange={(v) => onChange({ value2: v ?? undefined })}
        />
      </Space.Compact>
    )
  }

  if (operator === 'dateBetween') {
    return (
      <DatePicker.RangePicker
        style={{ width: '100%' }}
        value={value && value2 ? [dayjs(String(value)), dayjs(String(value2))] : null}
        onChange={(dates) =>
          onChange({
            value: dates?.[0]?.format('YYYY-MM-DD') ?? undefined,
            value2: dates?.[1]?.format('YYYY-MM-DD') ?? undefined,
          })
        }
      />
    )
  }

  if (type === 'date' || ['before', 'beforeOrEqual', 'after', 'afterOrEqual'].includes(operator)) {
    return (
      <DatePicker
        style={{ width: '100%' }}
        showTime
        value={value ? dayjs(String(value)) : null}
        onChange={(d) => onChange({ value: d ? d.format('YYYY-MM-DD HH:mm:ss') : undefined })}
      />
    )
  }

  if (type === 'number' || type === 'percent') {
    return (
      <InputNumber
        style={{ width: '100%' }}
        placeholder={type === 'percent' ? '例如 3' : '输入数字'}
        value={typeof value === 'number' ? value : value === '' || value == null ? null : Number(value)}
        onChange={(v) => onChange({ value: v ?? undefined })}
        addonAfter={type === 'percent' ? '%' : undefined}
      />
    )
  }

  if (type === 'boolean') {
    return (
      <Select
        style={{ width: '100%' }}
        placeholder="选择"
        value={value as string | undefined}
        options={[
          { value: 'true', label: '是' },
          { value: 'false', label: '否' },
        ]}
        onChange={(v) => onChange({ value: v })}
        allowClear
      />
    )
  }

  return (
    <Input
      placeholder="输入条件值"
      value={(value as string) ?? ''}
      onChange={(e) => onChange({ value: e.target.value })}
      allowClear
    />
  )
})

export default function App() {
  const fileName = useTableStore((s) => s.fileName)
  const sheetNames = useTableStore((s) => s.sheetNames)
  const currentSheet = useTableStore((s) => s.currentSheet)
  const columns = useTableStore((s) => s.columns)
  const rows = useTableStore((s) => s.rows)
  const dataVersion = useTableStore((s) => s.dataVersion)
  const savedFilters = useTableStore((s) => s.savedFilters)
  const history = useTableStore((s) => s.history)
  const loading = useTableStore((s) => s.loading)
  const loadingTip = useTableStore((s) => s.loadingTip)
  const loadingPercent = useTableStore((s) => s.loadingPercent)
  const sheetCache = useTableStore((s) => s.sheetCache)

  const importFile = useTableStore((s) => s.importFile)
  const switchSheet = useTableStore((s) => s.switchSheet)
  const setColumns = useTableStore((s) => s.setColumns)
  const saveTemplate = useTableStore((s) => s.saveTemplate)
  const deleteSavedFilter = useTableStore((s) => s.deleteSavedFilter)
  const getTemplate = useTableStore((s) => s.getTemplate)

  const engine = useFilterEngine(rows, columns)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [fieldOpen, setFieldOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveNote, setSaveNote] = useState('')
  /** 正在编辑的模板 id；有值时「保存模板」会写回该模板 */
  const [editingTemplateId, setEditingTemplateId] = useState<string | undefined>()
  const [exportFormat, setExportFormat] = useState<ExportFormat>('xlsx')
  const [exportKeys, setExportKeys] = useState<string[]>([])
  const [draftColumns, setDraftColumns] = useState<TableColumn[]>([])
  const [peek, setPeek] = useState<PeekPayload | null>(null)
  /** 线框选中的可见列 */
  const [selectedColKeys, setSelectedColKeys] = useState<string[]>([])
  const [selectAnchor, setSelectAnchor] = useState<string | null>(null)
  /** 长按拖拽中的列（单列或区间） */
  const [draggingKeys, setDraggingKeys] = useState<string[]>([])
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)
  const [tableFullscreen, setTableFullscreen] = useState(false)
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  )

  // 数据版本变化时回第一页（引擎内部也会 reset draft）
  useEffect(() => {
    setPage(1)
    setPeek(null)
    setEditingTemplateId(undefined)
    setSelectedColKeys([])
    setSelectAnchor(null)
    setDraggingKeys([])
    setDropTargetKey(null)
  }, [dataVersion])

  // Esc：先取消列选中；无选中时若全屏则退出全屏
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selectedColKeys.length || draggingKeys.length) {
        setSelectedColKeys([])
        setSelectAnchor(null)
        setDraggingKeys([])
        setDropTargetKey(null)
        return
      }
      if (tableFullscreen) setTableFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedColKeys.length, draggingKeys.length, tableFullscreen])

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    document.body.style.overflow = tableFullscreen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [tableFullscreen])

  const tableScrollY = tableFullscreen ? Math.max(320, viewportH - 168) : 520

  // 列拖拽：全局 pointerup 落点
  useEffect(() => {
    if (!draggingKeys.length) return
    const onUp = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const head = el?.closest?.('[data-col-key]') as HTMLElement | null
      const targetKey = head?.dataset?.colKey ?? dropTargetKey
      if (targetKey && !draggingKeys.includes(targetKey)) {
        setColumns(moveVisibleBlock(columns, draggingKeys, targetKey))
        message.success(
          draggingKeys.length > 1 ? `已移动 ${draggingKeys.length} 列` : '已调整列顺序',
        )
      }
      setDraggingKeys([])
      setDropTargetKey(null)
    }
    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const head = el?.closest?.('[data-col-key]') as HTMLElement | null
      const key = head?.dataset?.colKey
      if (key) setDropTargetKey(key)
    }
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointermove', onMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingKeys, dropTargetKey, columns])

  const activeCount = useMemo(
    () => engine.draft.groups.reduce((n, g) => n + g.conditions.filter(isConditionActive).length, 0),
    [engine.draft],
  )

  const filteredFields = useMemo(() => {
    const set = new Set<string>()
    engine.draft.groups.forEach((g) =>
      g.conditions.forEach((c) => {
        if (c.field) set.add(c.field)
      }),
    )
    return set
  }, [engine.draft])

  const pageRows = useMemo(
    () => engine.getPageRows(page, pageSize),
    // applied / rows 变化时才重算页数据
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, pageSize, engine.applied, engine.total, rows, dataVersion],
  )

  const handleImport = async (file: File) => {
    try {
      const result = await importFile(file)
      message.success(`已导入「${file.name}」，共 ${result.rowCount.toLocaleString()} 条`)
      if (result.large) {
        message.info('数据量较大：已分片解析，筛选条件会在输入停顿后自动生效')
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '导入失败，请重试。')
    }
    return false
  }

  const applyPreset = () => {
    try {
      const { filters, missing, labels } = buildLowSupportPreset(columns)
      if (!columns.length) {
        message.warning('请先导入表格')
        return
      }
      engine.replaceFilters(filters)
      setPage(1)
      if (missing.length) {
        message.warning(`已套用预设，缺少字段：${missing.join('、')}`)
      } else {
        message.success(`已套用「${BUILTIN_PRESET_NAME}」（${labels.length} 组，组间或）`)
      }
    } catch (e) {
      console.error(e)
      message.error('套用预设失败，请重试')
    }
  }

  const onHeaderClick = (fieldKey: string) => {
    const { groupId } = engine.addFieldFromHeader(fieldKey)
    const col = columns.find((c) => c.key === fieldKey)
    message.success(`已将「${col?.title ?? fieldKey}」加入规则组`)
    if (groupId) {
      document.getElementById(`filter-group-${groupId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }

  const openCellPeek = (title: string, content: string, e: React.MouseEvent) => {
    if (!content || content === '—') return
    setPeek({
      title,
      content,
      anchor: {
        x: Math.min(e.clientX + 12, window.innerWidth - 440),
        y: Math.min(e.clientY + 12, window.innerHeight - 280),
      },
    })
  }

  const openExport = () => {
    // 默认导出当前列表展示的可见字段（字段设置后的结果）
    const visibleKeys = [...columns]
      .filter((c) => c.visible)
      .sort((a, b) => a.order - b.order)
      .map((c) => c.key)
    setExportKeys(visibleKeys)
    setExportFormat('xlsx')
    setExportOpen(true)
  }

  const doExport = () => {
    if (!exportKeys.length) {
      message.warning('请至少选择一个导出字段')
      return
    }
    const matched = engine.getAllMatchedRows()
    exportFilteredData({
      fileName: fileName || '表格',
      format: exportFormat,
      columns,
      rows: matched,
      selectedKeys: exportKeys,
    })
    message.success(`已导出 ${matched.length.toLocaleString()} 条（${exportFormat}）`)
    setExportOpen(false)
  }

  const onColSelect = (colKey: string, e: React.MouseEvent) => {
    if (e.shiftKey && selectAnchor) {
      setSelectedColKeys(visibleRangeKeys(columns, selectAnchor, colKey))
      return
    }
    setSelectAnchor(colKey)
    setSelectedColKeys([colKey])
  }

  const defaultColWidth = (col: TableColumn) =>
    col.width ?? (col.type === 'string' ? 180 : 130)

  const onColResize = (colKey: string, nextWidth: number) => {
    setColumns(columns.map((c) => (c.key === colKey ? { ...c, width: nextWidth } : c)))
  }

  const onLongPressStart = (colKey: string) => {
    const orderMap = new Map(sortedVisible(columns).map((c, i) => [c.key, i]))
    let block =
      selectedColKeys.includes(colKey) && selectedColKeys.length > 0
        ? [...selectedColKeys]
        : [colKey]
    block.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0))
    if (!selectedColKeys.includes(colKey)) {
      setSelectedColKeys(block)
      setSelectAnchor(colKey)
    }
    setDraggingKeys(block)
    setDropTargetKey(null)
    message.open({
      type: 'info',
      content: block.length > 1 ? `拖动 ${block.length} 列到目标位置后松开` : '拖动到目标列位置后松开',
      duration: 1.2,
      key: 'col-drag',
    })
  }

  const editingTemplate = editingTemplateId
    ? savedFilters.find((t) => t.id === editingTemplateId)
    : undefined

  const openSaveAsNew = () => {
    setEditingTemplateId(undefined)
    setSaveName('')
    setSaveNote('')
    setSaveOpen(true)
  }

  const openSaveEdit = () => {
    if (!editingTemplateId || !editingTemplate) {
      openSaveAsNew()
      return
    }
    setSaveName(editingTemplate.name)
    setSaveNote(editingTemplate.note || '')
    setSaveOpen(true)
  }

  const startEditTemplate = (id: string) => {
    const t = getTemplate(id)
    if (!t) return
    engine.replaceFilters(t.filters)
    setEditingTemplateId(t.id)
    setSaveName(t.name)
    setSaveNote(t.note || '')
    setPage(1)
    setTemplateOpen(false)
    message.success(`正在编辑「${t.name}」，调整条件后点「保存修改」`)
  }

  const tableColumns: ColumnsType<TableRow> = useMemo(() => {
    const visible = [...columns].filter((c) => c.visible).sort((a, b) => a.order - b.order)
    return [
      {
        title: '序号',
        key: '__index',
        width: 72,
        fixed: 'left' as const,
        render: (_: unknown, __: TableRow, index: number) => (page - 1) * pageSize + index + 1,
      },
      ...visible.map((col) => {
        const inFilter = filteredFields.has(col.key)
        const width = defaultColWidth(col)
        return {
          title: (
            <ColumnHeader
              title={col.title}
              colKey={col.key}
              inFilter={inFilter}
              selected={selectedColKeys.includes(col.key)}
              dropTarget={dropTargetKey === col.key && draggingKeys.length > 0}
              dragging={draggingKeys.includes(col.key)}
              currentWidth={width}
              onFilterClick={() => onHeaderClick(col.key)}
              onSelect={(e) => onColSelect(col.key, e)}
              onLongPressStart={onLongPressStart}
              onHoverWhileDrag={(k) => setDropTargetKey(k)}
              onResize={onColResize}
            />
          ),
          dataIndex: col.key,
          key: col.key,
          width,
          ellipsis: true,
          onHeaderCell: () => ({
            className: selectedColKeys.includes(col.key) ? 'th-col-selected' : undefined,
          }),
          render: (value: unknown) => {
            const text = formatCellDisplay(value, col.type)
            const long = text.length > 18 || col.type === 'string'
            return (
              <span
                className={`cell-ellipsis${long ? ' is-clip' : ''}${selectedColKeys.includes(col.key) ? ' col-selected-cell' : ''}`}
                onClick={(e) => {
                  if (long) openCellPeek(col.title, text, e)
                }}
                title={long ? '点击打开线框查看全文' : undefined}
              >
                {text}
              </span>
            )
          },
        }
      }),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, page, pageSize, filteredFields, selectedColKeys, draggingKeys, dropTargetKey])

  const hasData = rows.length > 0

  return (
    <div className="app-shell">
      <Spin
        spinning={loading || engine.busy}
        tip={
          <div style={{ minWidth: 220 }}>
            <div>{loading ? loadingTip || '加载中…' : '正在应用筛选…'}</div>
            {loading ? <Progress percent={loadingPercent} size="small" style={{ marginTop: 8 }} /> : null}
          </div>
        }
        size="large"
        fullscreen
      />

      <header className="app-header">
        <h1>表格筛选器</h1>
        <Space wrap>
          <Dropdown
            menu={{
              items: history.length
                ? history.map((h) => ({
                    key: h.id,
                    label: `${h.fileName}（${h.rowCount} 条 · ${dayjs(h.importedAt).format('MM-DD HH:mm')}）`,
                    disabled: true,
                  }))
                : [{ key: 'empty', label: '暂无最近导入', disabled: true }],
            }}
          >
            <Button icon={<HistoryOutlined />}>最近文件</Button>
          </Dropdown>
          <Upload accept=".xlsx,.xls,.csv" showUploadList={false} beforeUpload={handleImport}>
            <Button type="primary" icon={<UploadOutlined />} loading={loading}>
              导入表格
            </Button>
          </Upload>
        </Space>
      </header>

      <main className="app-main">
        {!hasData ? (
          <div className="empty-wrap">
            <div style={{ fontSize: 42 }}>📊</div>
            <h2>暂无数据</h2>
            <p>导入 Excel 或 CSV 开始筛选。</p>
            <Upload.Dragger
              accept=".xlsx,.xls,.csv"
              showUploadList={false}
              beforeUpload={handleImport}
              disabled={loading}
              style={{ maxWidth: 480, margin: '0 auto' }}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此处</p>
            </Upload.Dragger>
          </div>
        ) : (
          <>
            <Card size="small">
              <div className="stat-line">
                <span>
                  当前文件：<strong>{fileName}</strong>
                </span>
                <span>
                  原始：<strong>{rows.length.toLocaleString()}</strong> 条
                </span>
                <span>
                  筛选后：<strong>{engine.total.toLocaleString()}</strong> 条
                </span>
                <span>
                  生效条件：<strong>{activeCount}</strong> 个
                </span>
              </div>
              {sheetNames.length > 1 ? (
                <div style={{ marginTop: 10 }}>
                  <Space wrap>
                    <span style={{ color: '#6b7280' }}>Sheet：</span>
                    {sheetNames.map((name) => (
                      <Button
                        key={name}
                        size="small"
                        type={name === currentSheet ? 'primary' : 'default'}
                        onClick={async () => {
                          try {
                            await switchSheet(name)
                          } catch (e) {
                            message.error(e instanceof Error ? e.message : '切换失败')
                          }
                        }}
                      >
                        {name}
                        {!sheetCache[name]?.rows.length ? ' ·待加载' : ''}
                      </Button>
                    ))}
                  </Space>
                </div>
              ) : null}
            </Card>

            <Card
              size="small"
              title={
                <Space>
                  <FilterOutlined />
                  筛选条件
                  <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 12 }}>
                    输入后约 0.3 秒自动筛选 · 点击表头可加入字段
                  </span>
                </Space>
              }
              extra={
                <Space wrap>
                  <Space size={4}>
                    <Button icon={<ThunderboltOutlined />} onClick={applyPreset}>
                      最低支持条件
                    </Button>
                    <Tooltip
                      title={
                        <div>
                          {LOW_SUPPORT_RULE_TEXT.map((t) => (
                            <div key={t} style={{ marginBottom: 4 }}>
                              · {t}
                            </div>
                          ))}
                          <div style={{ marginTop: 6, opacity: 0.85 }}>组内且、组间或；点击率按百分数比较</div>
                        </div>
                      }
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<QuestionCircleOutlined />}
                        aria-label="最低支持条件说明"
                      />
                    </Tooltip>
                  </Space>
                  <Button
                    icon={editingTemplateId ? <EditOutlined /> : <SaveOutlined />}
                    type={editingTemplateId ? 'primary' : 'default'}
                    onClick={editingTemplateId ? openSaveEdit : openSaveAsNew}
                  >
                    {editingTemplateId ? '保存修改' : '保存模板'}
                  </Button>
                  <Button icon={<SnippetsOutlined />} onClick={() => setTemplateOpen(true)}>
                    模板管理
                  </Button>
                  <Button
                    icon={<ClearOutlined />}
                    onClick={() => {
                      engine.reset()
                      setEditingTemplateId(undefined)
                      setPage(1)
                    }}
                  >
                    清空筛选
                  </Button>
                </Space>
              }
            >
              {editingTemplate ? (
                <div className="edit-banner">
                  正在编辑模板：<strong>{editingTemplate.name}</strong>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => {
                      setEditingTemplateId(undefined)
                      message.info('已退出编辑，另存请点「保存模板」')
                    }}
                  >
                    退出编辑
                  </Button>
                </div>
              ) : null}

              <Space style={{ marginBottom: 10 }} wrap>
                <span>规则组关系</span>
                <Radio.Group
                  size="small"
                  value={engine.draft.groupLogic}
                  onChange={(e) => {
                    engine.setGroupLogic(e.target.value)
                    setPage(1)
                  }}
                  optionType="button"
                  options={[
                    { label: '组间或 OR', value: 'OR' },
                    { label: '组间且 AND', value: 'AND' },
                  ]}
                />
              </Space>

              {engine.draft.groups.map((group, groupIndex) => (
                <div key={group.id} id={`filter-group-${group.id}`}>
                  {groupIndex > 0 ? <div className="logic-chip">{engine.draft.groupLogic}</div> : null}
                  <div
                    className={`filter-group${engine.activeGroupId === group.id ? ' is-active-group' : ''}`}
                    onClick={() => engine.setActiveGroupId(group.id)}
                  >
                    <div className="filter-group-title">
                      <span>
                        规则组 {groupIndex + 1}（组内 AND）
                        {engine.activeGroupId === group.id ? (
                          <Tag color="blue" style={{ marginLeft: 8 }}>
                            当前
                          </Tag>
                        ) : null}
                      </span>
                      <Popconfirm title="删除该规则组？" onConfirm={() => engine.removeGroup(group.id)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </div>
                    {group.conditions.map((cond, condIndex) => {
                      const col = columns.find((c) => c.key === cond.field)
                      const type = col?.type ?? 'string'
                      return (
                        <div key={cond.id}>
                          {condIndex > 0 ? <div className="logic-chip">AND</div> : null}
                          <div className="filter-row">
                            <Select
                              showSearch
                              placeholder="字段"
                              value={cond.field || undefined}
                              options={columns.map((c) => ({ value: c.key, label: c.title }))}
                              onChange={(field) => {
                                const next = columns.find((c) => c.key === field)
                                const operator: FilterOperator =
                                  next?.type === 'number' || next?.type === 'percent'
                                    ? 'greaterThan'
                                    : next?.type === 'date'
                                      ? 'after'
                                      : 'contains'
                                engine.updateCondition(group.id, cond.id, {
                                  field,
                                  operator,
                                  value: undefined,
                                  value2: undefined,
                                })
                              }}
                            />
                            <Select
                              value={cond.operator}
                              options={operatorsForType(type)}
                              onChange={(operator) =>
                                engine.updateCondition(group.id, cond.id, {
                                  operator,
                                  value: undefined,
                                  value2: undefined,
                                })
                              }
                            />
                            <ValueEditor
                              type={type}
                              operator={cond.operator}
                              value={cond.value}
                              value2={cond.value2}
                              onChange={(patch) => engine.updateCondition(group.id, cond.id, patch)}
                            />
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => engine.removeCondition(group.id, cond.id)}
                            />
                          </div>
                          {!isConditionActive(cond) && cond.field ? (
                            <div style={{ color: '#faad14', fontSize: 12, marginBottom: 6 }}>
                              请完善条件值（停顿后自动筛选）
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                    <Button
                      type="dashed"
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => engine.addCondition(group.id)}
                    >
                      添加条件
                    </Button>
                  </div>
                </div>
              ))}

              <Button type="dashed" icon={<PlusOutlined />} onClick={() => engine.addGroup()}>
                添加规则组
              </Button>
            </Card>

            <Card
              size="small"
              className={`table-card${tableFullscreen ? ' is-fullscreen' : ''}`}
              title={
                <Space>
                  数据表格
                  <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 12 }}>
                    {tableFullscreen
                      ? '全屏模式 · Esc 退出'
                      : '点选列 / Shift 扩选 · Esc 取消 · 拖线框调列宽 · 长按拖动调顺序'}
                  </span>
                </Space>
              }
              extra={
                <Space wrap>
                  <Button
                    icon={tableFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                    onClick={() => setTableFullscreen((v) => !v)}
                  >
                    {tableFullscreen ? '退出全屏' : '全屏'}
                  </Button>
                  <Button
                    icon={<SettingOutlined />}
                    onClick={() => {
                      setDraftColumns(columns.map((c) => ({ ...c })))
                      setFieldOpen(true)
                    }}
                  >
                    字段设置
                  </Button>
                  <Button type="primary" icon={<DownloadOutlined />} onClick={openExport}>
                    导出数据
                  </Button>
                </Space>
              }
            >
              <Table<TableRow>
                size="small"
                rowKey="__rowId"
                columns={tableColumns}
                dataSource={pageRows}
                loading={false}
                scroll={{ x: Math.max(900, tableColumns.length * 140), y: tableScrollY }}
                pagination={{
                  current: page,
                  pageSize,
                  total: engine.total,
                  showSizeChanger: true,
                  pageSizeOptions: ['20', '50', '100', '200'],
                  showTotal: (t) => `共 ${t.toLocaleString()} 条`,
                  onChange: (p, ps) => {
                    setPage(p)
                    setPageSize(ps)
                  },
                }}
                locale={{
                  emptyText: <Empty description="暂无符合条件的数据" />,
                }}
              />
            </Card>
          </>
        )}
      </main>

      <CellPeekFrame peek={peek} onClose={() => setPeek(null)} />

      <Modal
        title="字段设置"
        open={fieldOpen}
        onCancel={() => setFieldOpen(false)}
        onOk={() => {
          setColumns(draftColumns)
          setFieldOpen(false)
          message.success('字段设置已保存')
        }}
        width={720}
      >
        <Table
          size="small"
          pagination={false}
          rowKey="key"
          dataSource={[...draftColumns].sort((a, b) => a.order - b.order)}
          columns={[
            { title: '字段名', dataIndex: 'title' },
            {
              title: '类型',
              dataIndex: 'type',
              width: 160,
              render: (type: ColumnType, record) => (
                <Select
                  style={{ width: '100%' }}
                  value={type}
                  options={TYPE_OPTIONS}
                  onChange={(v) =>
                    setDraftColumns((cols) =>
                      cols.map((c) => (c.key === record.key ? { ...c, type: v } : c)),
                    )
                  }
                />
              ),
            },
            {
              title: '显示',
              dataIndex: 'visible',
              width: 80,
              render: (visible: boolean, record) => (
                <Checkbox
                  checked={visible}
                  onChange={(e) =>
                    setDraftColumns((cols) =>
                      cols.map((c) =>
                        c.key === record.key ? { ...c, visible: e.target.checked } : c,
                      ),
                    )
                  }
                />
              ),
            },
          ]}
        />
      </Modal>

      <Modal title="导出数据" open={exportOpen} onCancel={() => setExportOpen(false)} onOk={doExport} okText="导出">
        <p>
          导出当前筛选结果 <strong>{engine.total.toLocaleString()}</strong> 条
          <span style={{ color: '#6b7280', marginLeft: 8 }}>默认勾选列表当前可见字段</span>
        </p>
        <Radio.Group
          value={exportFormat}
          onChange={(e) => setExportFormat(e.target.value)}
          style={{ marginBottom: 12 }}
        >
          <Radio value="xlsx">Excel</Radio>
          <Radio value="csv">CSV</Radio>
          <Radio value="txt">文本 (.txt)</Radio>
        </Radio.Group>
        <div style={{ marginBottom: 8 }}>
          <Space>
            <Button
              size="small"
              onClick={() =>
                setExportKeys(
                  [...columns]
                    .filter((c) => c.visible)
                    .sort((a, b) => a.order - b.order)
                    .map((c) => c.key),
                )
              }
            >
              仅可见字段
            </Button>
            <Button size="small" onClick={() => setExportKeys(columns.map((c) => c.key))}>
              全部字段
            </Button>
            <Button size="small" onClick={() => setExportKeys([])}>
              取消全选
            </Button>
          </Space>
        </div>
        <Checkbox.Group
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}
          value={exportKeys}
          onChange={(v) => setExportKeys(v as string[])}
          options={[...columns]
            .sort((a, b) => a.order - b.order)
            .map((c) => ({
              label: `${c.title}${c.visible ? '' : '（隐藏）'}`,
              value: c.key,
            }))}
        />
      </Modal>

      <Modal
        title={editingTemplateId ? '保存模板修改' : '保存筛选模板'}
        open={saveOpen}
        onCancel={() => setSaveOpen(false)}
        onOk={() => {
          if (!saveName.trim()) {
            message.warning('请输入模板名称')
            return
          }
          saveTemplate(
            saveName.trim(),
            engine.snapshot(),
            saveNote.trim() || undefined,
            editingTemplateId,
          )
          message.success(editingTemplateId ? '模板已更新' : '模板已保存')
          setSaveOpen(false)
          if (!editingTemplateId) {
            // 新建后不强制进入编辑态
          }
        }}
        okText={editingTemplateId ? '保存修改' : '保存'}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input
            placeholder="模板名称"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            maxLength={40}
          />
          <Input.TextArea
            placeholder="备注（可选）"
            value={saveNote}
            onChange={(e) => setSaveNote(e.target.value)}
            rows={2}
          />
        </Space>
      </Modal>

      <Modal
        title="筛选模板管理"
        open={templateOpen}
        onCancel={() => setTemplateOpen(false)}
        footer={null}
        width={720}
      >
        {!savedFilters.length ? (
          <Empty description="暂无模板，先配置筛选后点「保存模板」" />
        ) : (
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={savedFilters}
            columns={[
              { title: '名称', dataIndex: 'name' },
              {
                title: '备注',
                dataIndex: 'note',
                render: (v: string | undefined) => v || '—',
              },
              {
                title: '操作',
                width: 220,
                render: (_, record) => (
                  <Space>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => {
                        const t = getTemplate(record.id)
                        if (!t) return
                        engine.replaceFilters(t.filters)
                        setEditingTemplateId(undefined)
                        setPage(1)
                        setTemplateOpen(false)
                        message.success(`已应用「${record.name}」`)
                      }}
                    >
                      应用
                    </Button>
                    <Button type="link" size="small" onClick={() => startEditTemplate(record.id)}>
                      编辑
                    </Button>
                    <Popconfirm
                      title="删除该模板？"
                      onConfirm={() => {
                        deleteSavedFilter(record.id)
                        if (editingTemplateId === record.id) setEditingTemplateId(undefined)
                      }}
                    >
                      <Button type="link" size="small" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Modal>
    </div>
  )
}
