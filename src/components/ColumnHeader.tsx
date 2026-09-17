import { useEffect, useRef } from 'react'
import { FilterOutlined } from '@ant-design/icons'

const LONG_PRESS_MS = 380
const MIN_COL_WIDTH = 72

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
  onResize: (colKey: string, nextWidth: number) => void
  currentWidth: number
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
  onResize,
  currentWidth,
}: Props) {
  const timer = useRef<number | null>(null)
  const armed = useRef(false)
  const resizing = useRef(false)

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current)
    },
    [],
  )

  const startResize = (e: React.PointerEvent, edge: 'left' | 'right') => {
    e.preventDefault()
    e.stopPropagation()
    if (timer.current != null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    resizing.current = true
    const startX = e.clientX
    const startW = currentWidth

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const delta = edge === 'right' ? dx : -dx
      const next = Math.max(MIN_COL_WIDTH, Math.round(startW + delta))
      onResize(colKey, next)
    }
    const onUp = () => {
      resizing.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className={`col-head${selected ? ' is-selected' : ''}${dropTarget ? ' is-drop-target' : ''}${dragging ? ' is-dragging' : ''}`}
      data-col-key={colKey}
      onPointerDown={(e) => {
        if (e.button !== 0 || resizing.current) return
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
        if (armed.current || dragging || resizing.current) {
          e.preventDefault()
          e.stopPropagation()
          armed.current = false
          return
        }
        onSelect(e)
      }}
      title="点选列（Shift 扩选）；Esc 取消选中；选中后拖线框调列宽；长按拖动调顺序"
    >
      {selected ? (
        <>
          <span
            className="col-resize-handle col-resize-left"
            onPointerDown={(e) => startResize(e, 'left')}
          />
          <span
            className="col-resize-handle col-resize-right"
            onPointerDown={(e) => startResize(e, 'right')}
          />
        </>
      ) : null}
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
