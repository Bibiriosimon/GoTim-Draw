/**
 * GOTIM DRAWER — renderCoordinatePlot
 *
 * Creates a coordinate system + function plot using tldraw native shapes.
 * Draws axes, key-point markers, a parabola curve, and annotation labels.
 *
 * Default size 520(width) × 480(height).
 * Coordinate origin is placed at (tx + 260, ty + 300), scale ~36 px/unit.
 */

import { createShapeId, toRichText } from '@tldraw/tlschema'
import type { InsertTemplateAction } from '../types'

type Editor = any

// ── helpers ──

function px(x: number): number {
  return Math.round(x * 100) / 100
}

// Map math (mx, my) → canvas-relative coordinates given origin & scale
function toCanvas(
  mx: number,
  my: number,
  ox: number,
  oy: number,
  scale: number,
): { x: number; y: number } {
  return { x: px(ox + mx * scale), y: px(oy - my * scale) }
}

export function renderCoordinatePlot(
  editor: Editor,
  action: InsertTemplateAction,
): string[] {
  const ids: string[] = []
  const sid = () => {
    const id = createShapeId()
    ids.push(id)
    return id
  }

  const tx = action.x
  const ty = action.y
  const w = action.w ?? 520
  const h = action.h ?? 480
  const pad = 16
  const slots = action.slots as Record<string, any>

  const originX = tx + 260
  const originY = ty + 300
  const scale = 36

  // Max bounds in math coordinates visible in the plot area
  const xMin = -5
  const xMax = 6
  const yMin = -3
  const yMax = 9

  // ── 0. Card frame (subtle background) ──
  editor.createShape({
    id: sid(),
    type: 'geo',
    x: tx,
    y: ty,
    props: {
      geo: 'rectangle',
      w,
      h,
      color: 'grey',
      fill: 'semi',
      dash: 'draw',
      font: 'sans',
        richText: toRichText(''),
    },
  })

  // ── 1. Title ──
  if (slots.title) {
    editor.createShape({
      id: sid(),
      type: 'text',
      x: tx + pad,
      y: ty + 16,
      props: {
        font: 'sans',
        richText: toRichText(String(slots.title)),
        color: 'blue',
        size: 'l',
      },
    })
  }

  // ── 2. Formula subtitle ──
  if (slots.formula) {
    editor.createShape({
      id: sid(),
      type: 'text',
      x: tx + pad + 120,
      y: ty + 22,
      props: {
        font: 'sans',
        richText: toRichText(String(slots.formula)),
        color: 'black',
        size: 'm',
      },
    })
  }

  // ── 3. X-axis arrow ──
  const xStart = toCanvas(xMin, 0, originX, originY, scale)
  const xEnd = toCanvas(xMax, 0, originX, originY, scale)
  editor.createShape({
    id: sid(),
    type: 'arrow',
    x: xStart.x,
    y: xStart.y,
    props: {
      color: 'black',
      start: { x: 0, y: 0 },
      end: { x: xEnd.x - xStart.x, y: xEnd.y - xStart.y },
      startArrowhead: 'none',
      endArrowhead: 'arrow',
      size: 's',
      dash: 'solid',
    },
  })

  // X-axis label
  editor.createShape({
    id: sid(),
    type: 'text',
    x: xEnd.x + 4,
    y: xEnd.y - 20,
    props: { font: 'sans', richText: toRichText('x'), color: 'black', size: 's' },
  })

  // ── 4. Y-axis arrow ──
  const yEnd = toCanvas(0, yMax, originX, originY, scale)
  editor.createShape({
    id: sid(),
    type: 'arrow',
    x: originX,
    y: originY,
    props: {
      color: 'black',
      start: { x: 0, y: 0 },
      end: { x: 0, y: yEnd.y - originY },
      startArrowhead: 'none',
      endArrowhead: 'arrow',
      size: 's',
      dash: 'solid',
    },
  })

  // Y-axis label
  editor.createShape({
    id: sid(),
    type: 'text',
    x: originX + 6,
    y: yEnd.y - 28,
    props: { font: 'sans', richText: toRichText('y'), color: 'black', size: 's' },
  })

  // Origin label
  editor.createShape({
    id: sid(),
    type: 'text',
    x: originX - 18,
    y: originY + 6,
    props: { font: 'sans', richText: toRichText('O'), color: 'black', size: 's' },
  })

  // ── 5. Tick marks on axes ──
  for (let i = Math.ceil(xMin); i <= Math.floor(xMax); i++) {
    if (i === 0) continue
    const tick = toCanvas(i, 0, originX, originY, scale)
    // small tick line (use a tiny arrow with no arrowheads)
    editor.createShape({
      id: sid(),
      type: 'arrow',
      x: tick.x,
      y: tick.y - 4,
      props: {
        color: 'grey',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 8 },
        startArrowhead: 'none',
        endArrowhead: 'none',
        size: 's',
      },
    })
    // tick number
    if (i >= -4 && i <= 5 && (i % 1 === 0)) {
      editor.createShape({
        id: sid(),
        type: 'text',
        x: tick.x - 8,
        y: tick.y + 8,
        props: {
          font: 'sans',
        richText: toRichText(String(i)),
          color: 'grey',
          size: 's',
        },
      })
    }
  }

  // ── 6. Parabola curve (draw shape with calculated points) ──
  const parabolaPoints: { x: number; y: number }[] = []
  const steps = 30
  for (let i = 0; i <= steps; i++) {
    const mx = xMin + (xMax - xMin) * (i / steps)
    const my = mx * mx - 4 * mx + 3 // y = x² - 4x + 3
    if (my > yMax + 1) continue // clip beyond visible range
    const cp = toCanvas(mx, my, originX, originY, scale)
    parabolaPoints.push({ x: cp.x - tx, y: cp.y - ty })
  }

  if (parabolaPoints.length > 2) {
    editor.createShape({
      id: sid(),
      type: 'draw',
      x: tx,
      y: ty,
      props: {
        segments: [{ type: 'free', points: parabolaPoints }],
        color: 'blue',
        size: 'm',
        dash: 'solid',
        isComplete: true,
      },
    })
  }

  // ── 7. Vertex marker (small orange-red filled circle) ──
  if (slots.vertex) {
    const vtx = toCanvas(2, -1, originX, originY, scale)
    // highlight dot
    editor.createShape({
      id: sid(),
      type: 'geo',
      x: vtx.x - 8,
      y: vtx.y - 8,
      props: {
        geo: 'ellipse',
        w: 16,
        h: 16,
        color: 'red',
        fill: 'solid',
        dash: 'solid',
        font: 'sans',
        richText: toRichText(''),
      },
    })
    // label
    editor.createShape({
      id: sid(),
      type: 'text',
      x: vtx.x + 12,
      y: vtx.y - 20,
      props: {
        font: 'sans',
        richText: toRichText(`顶点 ${String(slots.vertex)}`),
        color: 'red',
        size: 's',
      },
    })
  }

  // ── 8. Root markers ──
  const roots: string[] = Array.isArray(slots.roots) ? slots.roots : []
  if (roots.length > 0) {
    // Parse roots: assume format like "1" or "3" as x-coordinates
    roots.forEach((rootStr) => {
      const rootVal = parseFloat(String(rootStr).replace(/[^0-9.\-]/g, ''))
      if (isNaN(rootVal)) return
      const rp = toCanvas(rootVal, 0, originX, originY, scale)
      // dot
      editor.createShape({
        id: sid(),
        type: 'geo',
        x: rp.x - 6,
        y: rp.y - 6,
        props: {
          geo: 'ellipse',
          w: 12,
          h: 12,
          color: 'violet',
          fill: 'solid',
          dash: 'solid',
          font: 'sans',
        richText: toRichText(''),
        },
      })
      // label
      editor.createShape({
        id: sid(),
        type: 'text',
        x: rp.x - 10,
        y: rp.y + 12,
        props: {
          font: 'sans',
        richText: toRichText(`x=${rootVal}`),
          color: 'violet',
          size: 's',
        },
      })
    })
  }

  // ── 9. Axis of symmetry (vertical dashed line) ──
  if (slots.axis) {
    const symX = toCanvas(2, 0, originX, originY, scale) // x=2
    const symBottom = toCanvas(2, yMin, originX, originY, scale)
    const symTop = toCanvas(2, yMax, originX, originY, scale)
    editor.createShape({
      id: sid(),
      type: 'arrow',
      x: symBottom.x,
      y: symBottom.y,
      props: {
        color: 'green',
        start: { x: 0, y: 0 },
        end: { x: 0, y: symTop.y - symBottom.y },
        startArrowhead: 'none',
        endArrowhead: 'none',
        size: 's',
        dash: 'dashed',
      },
    })
    // label
    editor.createShape({
      id: sid(),
      type: 'text',
      x: symX.x + 6,
      y: symTop.y + 6,
      props: {
        font: 'sans',
        richText: toRichText(String(slots.axis)),
        color: 'green',
        size: 's',
      },
    })
  }

  // ── 10. Opening-direction annotation ──
  if (slots.opening) {
    const label = String(slots.opening)
    // Place at bottom-right of plot
    const labelX = tx + w - 120
    const labelY = ty + h - 40
    editor.createShape({
      id: sid(),
      type: 'text',
      x: labelX,
      y: labelY,
      props: {
        font: 'sans',
        richText: toRichText(`开口方向: ${label}`),
        color: 'black',
        size: 'm',
      },
    })
  }

  return ids
}
