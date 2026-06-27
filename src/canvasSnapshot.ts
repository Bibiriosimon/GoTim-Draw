type Editor = any

export type CanvasShapeSummary = {
  id: string
  type: string
  x: number
  y: number
  rotation?: number
  parentId?: string
  index?: string
  bounds?: CanvasBounds | null
  props: Record<string, unknown>
  text?: string
}

export type CanvasBounds = {
  x?: number
  y?: number
  w?: number
  h?: number
  minX?: number
  minY?: number
  maxX?: number
  maxY?: number
}

export type CanvasSnapshot = {
  pageId?: string
  shapeCount: number
  bounds: CanvasBounds | null
  shapes: CanvasShapeSummary[]
  updatedAt: string
}

const PROP_ALLOWLIST = new Set([
  'color',
  'fill',
  'dash',
  'size',
  'geo',
  'w',
  'h',
  'scale',
  'spline',
  'richText',
  'text',
  'start',
  'end',
  'startArrowhead',
  'endArrowhead',
  'points',
  'opacity',
  'assetId',
  'url',
  'altText',
])

function summarizeBounds(bounds: any): CanvasBounds | null {
  if (!bounds) return null
  const out: CanvasBounds = {}
  for (const key of ['x', 'y', 'w', 'h', 'minX', 'minY', 'maxX', 'maxY'] as const) {
    const value = bounds[key]
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.round(value * 100) / 100
  }
  return Object.keys(out).length > 0 ? out : null
}

function compactValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth >= 3) return '[Object]'
  if (Array.isArray(value)) {
    if (value.length > 12) return { type: 'array', length: value.length, sample: value.slice(0, 3).map((item) => compactValue(item, depth + 1)) }
    return value.map((item) => compactValue(item, depth + 1))
  }

  const input = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(input).slice(0, 24)) {
    out[key] = compactValue(item, depth + 1)
  }
  return out
}

function summarizeProps(props: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!props) return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (PROP_ALLOWLIST.has(key)) out[key] = compactValue(value)
  }
  return out
}

function extractText(props: Record<string, unknown> | undefined): string | undefined {
  if (!props) return undefined
  if (typeof props.text === 'string') return props.text
  const richText = props.richText as any
  const text = richText?.content
    ?.flatMap((block: any) => block?.content ?? [])
    ?.map((node: any) => node?.text)
    ?.filter(Boolean)
    ?.join('')
  return text || undefined
}

export function createCanvasSnapshot(editor: Editor): CanvasSnapshot {
  const shapes = editor.getCurrentPageShapes() as any[]
  const shapeIds = shapes.map((shape) => shape.id)
  const pageBounds = shapeIds.length > 0 ? editor.getShapesPageBounds(shapeIds) : null
  const shapeSummaries = shapes.map((shape) => {
    const summary: CanvasShapeSummary = {
      id: shape.id,
      type: shape.type,
      x: shape.x ?? 0,
      y: shape.y ?? 0,
      rotation: shape.rotation,
      parentId: shape.parentId,
      index: shape.index,
      bounds: summarizeBounds(editor.getShapePageBounds(shape)),
      props: summarizeProps(shape.props),
      text: extractText(shape.props),
    }

    if (shape.type === 'line' && shape.props?.points) {
      summary.props.points = compactValue(shape.props.points)
    }
    if (shape.type === 'image') {
      summary.props.assetId = shape.props?.assetId
      summary.props.altText = shape.props?.altText
      summary.props.url = shape.props?.url
    }

    return summary
  })

  return {
    pageId: editor.getCurrentPageId?.(),
    shapeCount: shapes.length,
    bounds: summarizeBounds(pageBounds),
    shapes: shapeSummaries,
    updatedAt: new Date().toISOString(),
  }
}

export async function postCanvasSnapshot(snapshot: CanvasSnapshot): Promise<void> {
  await fetch('/api/canvas/snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  })
}
