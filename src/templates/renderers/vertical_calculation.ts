import { createShapeId, toRichText } from '@tldraw/tlschema'
import type { InsertTemplateAction } from '../types'

type Editor = any

export function renderVerticalCalculation(editor: Editor, action: InsertTemplateAction): string[] {
  const ids: string[] = []
  const sid = () => {
    const id = createShapeId()
    ids.push(id)
    return id
  }

  const slots = action.slots as Record<string, any>
  const x = action.x
  const y = action.y
  const cellW = Number(slots.cellW ?? 44)
  const cellH = Number(slots.cellH ?? 48)
  const rows: string[] = Array.isArray(slots.rows) ? slots.rows.map(String) : []
  const maxLen = Math.max(1, ...rows.map((row) => row.length), String(slots.result ?? '').length)
  const titleH = slots.title ? 48 : 0
  const operator = slots.operator ? String(slots.operator) : ''
  const result = slots.result !== undefined ? String(slots.result) : ''
  const frameW = (maxLen + 1) * cellW + 32
  const frameH = titleH + (rows.length + (result ? 1 : 0)) * cellH + 64

  editor.createShape({
    id: sid(),
    type: 'geo',
    x,
    y,
    props: {
      geo: 'rectangle',
      w: frameW,
      h: frameH,
      color: slots.color ?? 'grey',
      fill: 'semi',
      dash: 'draw',
      font: 'sans',
        richText: toRichText(''),
    },
  })

  if (slots.title) {
    editor.createShape({
      id: sid(),
      type: 'text',
      x: x + 16,
      y: y + 14,
      props: { font: 'sans', richText: toRichText(String(slots.title)), color: slots.color ?? 'blue', size: 'l' },
    })
  }

  rows.forEach((row, rowIndex) => {
    const padded = row.padStart(maxLen, ' ')
    if (rowIndex === rows.length - 1 && operator) {
      editor.createShape({
        id: sid(),
        type: 'text',
        x: x + 16,
        y: y + titleH + rowIndex * cellH + 10,
        props: { font: 'sans', richText: toRichText(operator), color: slots.operatorColor ?? 'violet', size: 'l' },
      })
    }
    Array.from(padded).forEach((char, colIndex) => {
      if (char === ' ') return
      editor.createShape({
        id: sid(),
        type: 'text',
        x: x + 44 + colIndex * cellW,
        y: y + titleH + rowIndex * cellH + 10,
        props: { font: 'sans', richText: toRichText(char), color: 'black', size: 'l' },
      })
    })
  })

  const lineY = y + titleH + rows.length * cellH + 2
  editor.createShape({
    id: sid(),
    type: 'arrow',
    x: x + 28,
    y: lineY,
    props: {
      color: slots.color ?? 'black',
      start: { x: 0, y: 0 },
      end: { x: frameW - 56, y: 0 },
      startArrowhead: 'none',
      endArrowhead: 'none',
      size: 's',
    },
  })

  if (result) {
    const padded = result.padStart(maxLen, ' ')
    Array.from(padded).forEach((char, colIndex) => {
      if (char === ' ') return
      editor.createShape({
        id: sid(),
        type: 'text',
        x: x + 44 + colIndex * cellW,
        y: lineY + 16,
        props: { font: 'sans', richText: toRichText(char), color: slots.resultColor ?? 'green', size: 'l' },
      })
    })
  }

  const carries: string[] = Array.isArray(slots.carries) ? slots.carries.map(String) : []
  carries.forEach((carry, index) => {
    if (!carry) return
    editor.createShape({
      id: sid(),
      type: 'text',
      x: x + 44 + index * cellW + 10,
      y: y + titleH - 6,
      props: { font: 'sans', richText: toRichText(carry), color: slots.carryColor ?? 'red', size: 's' },
    })
  })

  return ids
}
