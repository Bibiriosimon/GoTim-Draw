/**
 * GOTIM DRAWER — renderMathExplainerCard
 *
 * Creates a structured math explainer card using tldraw native shapes.
 * Layout (default 480 × 540):
 *
 *   ┌──────────────────────────────────────┐
 *   │  Title (blue, size l)                │  y = 20
 *   │  Formula (black, size m, centred)    │  y = 70
 *   │  [ keyIdea note ]                    │  y = 125
 *   │  ── Steps ──                         │  y = 190
 *   │  1. …  2. …  3. …  4. …             │  y = 225–330
 *   │  ── Conclusion ──                    │  y = 370
 *   │  conclusion text                     │  y = 405
 *   └──────────────────────────────────────┘
 */

import { createShapeId, toRichText } from '@tldraw/tlschema'
import type { InsertTemplateAction } from '../types'

type Editor = any

export function renderMathExplainerCard(
  editor: Editor,
  action: InsertTemplateAction,
): string[] {
  const ids: string[] = []
  const sid = () => {
    const id = createShapeId()
    ids.push(id)
    return id
  }

  const x = action.x
  const y = action.y
  const w = action.w ?? 480
  const h = action.h ?? 540
  const pad = 18
  const slots = action.slots as Record<string, any>

  // ── 1. Card background (subtle warm fill, grey border) ──
  editor.createShape({
    id: sid(),
    type: 'geo',
    x,
    y,
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

  // ── 2. Title (blue, bold-ish) ──
  if (slots.title) {
    editor.createShape({
      id: sid(),
      type: 'text',
      x: x + pad,
      y: y + 20,
      props: {
        font: 'sans',
        richText: toRichText(String(slots.title)),
        color: 'blue',
        size: 'l',
      },
    })
  }

  // ── 3. Formula (centred, medium, larger text) ──
  if (slots.formula) {
    editor.createShape({
      id: sid(),
      type: 'text',
      x: x + pad,
      y: y + 70,
      props: {
        font: 'sans',
        richText: toRichText(String(slots.formula)),
        color: 'black',
        size: 'xl',
      },
    })
  }

  // ── 4. Key-idea note ──
  if (slots.keyIdea) {
    editor.createShape({
      id: sid(),
      type: 'note',
      x: x + pad,
      y: y + 125,
      props: {
        font: 'sans',
        richText: toRichText(String(slots.keyIdea)),
        color: 'yellow',
        size: 'm',
      },
    })
  }

  // ── 5. Steps heading + list ──
  const steps: string[] = Array.isArray(slots.steps) ? slots.steps : []
  if (steps.length > 0) {
    editor.createShape({
      id: sid(),
      type: 'text',
      x: x + pad,
      y: y + 195,
      props: {
        font: 'sans',
        richText: toRichText('步骤'),
        color: 'grey',
        size: 'm',
      },
    })

    const stepLines = steps
      .map((s: string, i: number) => `${i + 1}. ${s}`)
      .join('\n')
    editor.createShape({
      id: sid(),
      type: 'text',
      x: x + pad + 8,
      y: y + 225,
      props: {
        font: 'sans',
        richText: toRichText(stepLines),
        color: 'black',
        size: 'm',
      },
    })
  }

  // ── 6. Conclusion ──
  if (slots.conclusion) {
    editor.createShape({
      id: sid(),
      type: 'text',
      x: x + pad,
      y: y + h - 80,
      props: {
        font: 'sans',
        richText: toRichText('结论'),
        color: 'grey',
        size: 'm',
      },
    })
    editor.createShape({
      id: sid(),
      type: 'text',
      x: x + pad + 8,
      y: y + h - 56,
      props: {
        font: 'sans',
        richText: toRichText(String(slots.conclusion)),
        color: 'black',
        size: 'm',
      },
    })
  }

  return ids
}
