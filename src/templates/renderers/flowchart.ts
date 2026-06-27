import { createShapeId, toRichText } from '@tldraw/tlschema'
import type { InsertTemplateAction } from '../types'

type Editor = any

type FlowNode = {
  id?: string
  label: string
  detail?: string
  color?: string
  geo?: string
}

type FlowEdge = {
  from: string
  to: string
  label?: string
  color?: string
}

export function renderFlowchart(editor: Editor, action: InsertTemplateAction): string[] {
  const ids: string[] = []
  const sid = () => {
    const id = createShapeId()
    ids.push(id)
    return id
  }

  const slots = action.slots as Record<string, any>
  const nodes: FlowNode[] = Array.isArray(slots.nodes) ? slots.nodes : []
  const edges: FlowEdge[] = Array.isArray(slots.edges) ? slots.edges : []
  const direction = slots.direction === 'vertical' ? 'vertical' : 'horizontal'
  const x = action.x
  const y = action.y
  const nodeW = Number(slots.nodeW ?? 220)
  const nodeH = Number(slots.nodeH ?? 110)
  const gapX = Number(slots.gapX ?? 80)
  const gapY = Number(slots.gapY ?? 64)
  const titleH = slots.title ? 56 : 0

  if (slots.title) {
    editor.createShape({
      id: sid(),
      type: 'text',
      x,
      y,
      props: { font: 'sans', richText: toRichText(String(slots.title)), color: slots.color ?? 'violet', size: 'xl' },
    })
  }

  const centers = new Map<string, { x: number; y: number }>()
  nodes.forEach((node, index) => {
    const nodeId = node.id ?? String(index)
    const nx = x + (direction === 'horizontal' ? index * (nodeW + gapX) : 0)
    const ny = y + titleH + (direction === 'vertical' ? index * (nodeH + gapY) : 0)
    centers.set(nodeId, { x: nx + nodeW / 2, y: ny + nodeH / 2 })
    editor.createShape({
      id: sid(),
      type: 'geo',
      x: nx,
      y: ny,
      props: {
        geo: node.geo ?? 'rectangle',
        w: nodeW,
        h: nodeH,
        color: node.color ?? slots.color ?? 'blue',
        fill: 'semi',
        dash: 'draw',
        font: 'sans',
        richText: toRichText(node.detail ? `${node.label}\n${node.detail}` : node.label),
      },
    })
  })

  const fallbackEdges: FlowEdge[] = edges.length > 0
    ? edges
    : nodes.slice(0, -1).map((node, index) => ({ from: node.id ?? String(index), to: nodes[index + 1].id ?? String(index + 1) }))

  fallbackEdges.forEach((edge) => {
    const from = centers.get(edge.from)
    const to = centers.get(edge.to)
    if (!from || !to) return
    const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
    const startX = horizontal ? from.x + nodeW / 2 : from.x
    const startY = horizontal ? from.y : from.y + nodeH / 2
    const endX = horizontal ? to.x - nodeW / 2 : to.x
    const endY = horizontal ? to.y : to.y - nodeH / 2
    editor.createShape({
      id: sid(),
      type: 'arrow',
      x: startX,
      y: startY,
      props: {
        color: edge.color ?? slots.color ?? 'violet',
        start: { x: 0, y: 0 },
        end: { x: endX - startX, y: endY - startY },
      },
    })
    if (edge.label) {
      editor.createShape({
        id: sid(),
        type: 'text',
        x: (startX + endX) / 2 - 24,
        y: (startY + endY) / 2 - 18,
        props: { font: 'sans', richText: toRichText(edge.label), color: edge.color ?? 'grey', size: 's' },
      })
    }
  })

  return ids
}
