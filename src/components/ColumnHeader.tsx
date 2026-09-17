import { useEffect, useRef } from 'react'
import { FilterOutlined } from '@ant-design/icons'

const LONG_PRESS_MS = 380

interface Props {
  title: string
  colKey: string
  inFilter: boolean
  selected: boolean
  dropTarget: boolean
  dragging: boolean
  onFilterClick: () => void
  onSelect: (e: React.MouseEvent) => void
  onLongPressStart: (colKey: string) => void
  onHoverWhileDrag: (colKey: string) => void
}

export default function ColumnHeader({
  title,
  colKey,
  inFilter,
  selected,
  dropTarget,
  dragging,
  onFilterClick,
  onSelect,
  onLongPressStart,
  onHoverWhileDrag,
}: Props) {
  const timer = useRef<number | null>(null)
  const armed = useRef(false)

  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current)
  }, [])

  return (
    <div
      className={`col-head${selected ? ' is-selected' : ''}${dropTarget ? ' is-drop-target' : ''}${dragging ? ' is-dragging' : ''}`}
      data-col-key={colKey}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        armed.current = false
        if (timer.current != null) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          armed.current = true
          onLongPressStart(colKey)
        }, LONG_PRESS_MS)
      }}
      onPointerMove={() => {
        if (dragging) onHoverWhileDrag(colKey)
      }}
      onPointerUp={() => {
        if (timer.current != null) {
          window.clearTimeout(timer.current)
          timer.current = null
        }
      }}
      onPointerCancel={() => {
        if (timer.current != null) {
          window.clearTimeout(timer.current)
          timer.current = null
        }
      }}
      onClick={(e) => {
        if (armed.current || dragging) {
          e.preventDefault()
          e.stopPropagation()
          armed.current = false
          return
        }
        onSelect(e)
      }}
      title="点选列（Shift 扩选）；长按拖动调整顺序；漏斗加入筛选"
    >
      <button
        type="button"
        className={`th-filter-btn${inFilter ? ' is-active' : ''}`}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (timer.current != null) {
            window.clearTimeout(timer.current)
            timer.current = null
          }
        }}
        onClick={(e) => {
          e.stopPropagation()
          onFilterClick()
        }}
      >
        <FilterOutlined />
      </button>
      <span className="col-head-title">{title}</span>
    </div>
  )
}
