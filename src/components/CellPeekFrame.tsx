import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from 'antd'
import { CloseOutlined } from '@ant-design/icons'

export interface PeekPayload {
  title: string
  content: string
  anchor?: { x: number; y: number }
}

interface Props {
  peek: PeekPayload | null
  onClose: () => void
}

/**
 * 可拖拽移动、可拉动四边/角缩放的线框，用于查看被截断的单元格全文。
 */
export default function CellPeekFrame({ peek, onClose }: Props) {
  const [pos, setPos] = useState({ x: 120, y: 120 })
  const [size, setSize] = useState({ w: 420, h: 260 })
  const dragRef = useRef<{
    mode: 'move' | 'resize'
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
    edge?: string
  } | null>(null)

  useEffect(() => {
    if (!peek) return
    const x = peek.anchor?.x ?? Math.max(40, window.innerWidth / 2 - 210)
    const y = peek.anchor?.y ?? Math.max(40, window.innerHeight / 2 - 130)
    setPos({
      x: Math.min(x, window.innerWidth - 200),
      y: Math.min(y, window.innerHeight - 160),
    })
    setSize({ w: 420, h: 260 })
  }, [peek])

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (d.mode === 'move') {
      setPos({
        x: Math.max(8, d.origX + dx),
        y: Math.max(8, d.origY + dy),
      })
      return
    }
    let w = d.origW
    let h = d.origH
    let x = d.origX
    let y = d.origY
    const edge = d.edge ?? 'se'
    if (edge.includes('e')) w = Math.max(240, d.origW + dx)
    if (edge.includes('s')) h = Math.max(140, d.origH + dy)
    if (edge.includes('w')) {
      w = Math.max(240, d.origW - dx)
      x = d.origX + dx
    }
    if (edge.includes('n')) {
      h = Math.max(140, d.origH - dy)
      y = d.origY + dy
    }
    setSize({ w, h })
    setPos({ x, y })
  }, [])

  const onPointerUp = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }, [onPointerMove])

  const startDrag = (mode: 'move' | 'resize', e: React.PointerEvent, edge?: string) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      mode,
      edge,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      origW: size.w,
      origH: size.h,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  if (!peek) return null

  return (
    <div
      className="peek-frame"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      role="dialog"
      aria-label="截断内容查看"
    >
      <div className="peek-frame-header" onPointerDown={(e) => startDrag('move', e)}>
        <span className="peek-frame-title" title={peek.title}>
          {peek.title}
        </span>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>
      <div className="peek-frame-body">
        <pre>{peek.content}</pre>
      </div>
      <div className="peek-hint">拖动标题栏移动 · 拖动边角缩放</div>
      {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const).map((edge) => (
        <div
          key={edge}
          className={`peek-handle peek-handle-${edge}`}
          onPointerDown={(e) => startDrag('resize', e, edge)}
        />
      ))}
    </div>
  )
}
