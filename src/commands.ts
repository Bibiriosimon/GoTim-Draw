import { AssetRecordType, b64Vecs, createShapeId, TLAssetId, TLGeoShapeGeoStyle, TLShapeId, toRichText } from '@tldraw/tlschema'
import { getIndices } from '@tldraw/utils'
import type { InsertTemplateAction } from './templates/types'
import { getTemplate, validateSlots } from './templates/TemplateRegistry'

type Editor = any

export type CommandResult = {
  ok: boolean
  commandType: string
  createdIds?: string[]
  updatedIds?: string[]
  deletedIds?: string[]
  warnings?: string[]
  error?: string
}

export type LayoutItem = {
  id?: string
  label: string
  description?: string
  color?: string
  geo?: string
  w?: number
  h?: number
}

type CommandMeta = {
  delay?: number
  id?: number
  batchId?: string
  batchName?: string
  batchIndex?: number
  step?: number
  stepTitle?: string
}

type DrawerCommandBase =
  | { type: 'clear' }
  | { type: 'createSession'; mode?: SceneName; title?: string; prompt?: string }
  | { type: 'zoomToFit' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'deleteShape'; shapeId: string }
  | { type: 'updateShape'; shapeId: string; x?: number; y?: number; rotation?: number; props?: Record<string, unknown> }
  | {
      type: 'layout'
      mode: 'horizontal' | 'vertical' | 'grid'
      x?: number
      y?: number
      cols?: number
      gapX?: number
      gapY?: number
      itemW?: number
      itemH?: number
      color?: string
      connect?: boolean
      avoidExisting?: boolean
      title?: string
      items: LayoutItem[]
    }
  | { type: 'createText'; text: string; x?: number; y?: number; color?: string; size?: string }
  | { type: 'createFormula'; text: string; x?: number; y?: number; color?: string; size?: string }
  | { type: 'createAnimatedBall'; x?: number; y?: number; radius?: number; orbitRadius?: number; color?: string; duration?: number; label?: string }
  | {
      type: 'createPythonPlot'
      title?: string
      expression?: string
      xMin?: number
      xMax?: number
      samples?: number
      xLabel?: string
      yLabel?: string
      color?: string
      x?: number
      y?: number
      w?: number
      h?: number
      notes?: string
      markers?: Array<{ x: number; label?: string; color?: string }>
    }
  | { type: 'createNote'; text: string; x?: number; y?: number; color?: string }
  | { type: 'createGeo'; label?: string; x?: number; y?: number; w?: number; h?: number; color?: string; geo?: string }
  | { type: 'createLine'; points?: Array<{ x: number; y: number }>; x?: number; y?: number; endX?: number; endY?: number; color?: string; size?: string; dash?: string; spline?: 'line' | 'cubic' }
  | { type: 'createDraw'; points: Array<{ x: number; y: number; z?: number }>; color?: string; fill?: string; size?: string; dash?: string; closed?: boolean; pen?: boolean }
  | { type: 'createHighlight'; x?: number; y?: number; w?: number; h?: number; color?: string; opacity?: number }
  | { type: 'createArrow'; x?: number; y?: number; endX?: number; endY?: number; color?: string }
  | { type: 'createImage'; src: string; x?: number; y?: number; w?: number; h?: number; naturalW?: number; naturalH?: number; name?: string; mimeType?: string; altText?: string; background?: boolean }
  | { type: 'scene'; name: SceneName }
  | InsertTemplateAction

export type DrawerCommand = DrawerCommandBase & CommandMeta

export type SceneName = 'lesson' | 'brainstorm' | 'chess' | 'presentation'

const shapeId = () => createShapeId() as TLShapeId
const toShapeId = (id: string) => id as TLShapeId

const superscriptDigits: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
}

const subscriptDigits: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
}

function translateDigits(value: string, table: Record<string, string>) {
  const translated = Array.from(value).map((char) => table[char] ?? '').join('')
  return translated.length === value.length ? translated : value
}

function normalizeFormulaText(text: string) {
  return String(text ?? '')
    .replace(/sqrt\s*\(/gi, '√(')
    .replace(/\^([0-9+-]+)/g, (_, digits: string) => translateDigits(digits, superscriptDigits))
    .replace(/_([0-9+-]+)/g, (_, digits: string) => translateDigits(digits, subscriptDigits))
    .replace(/\bpi\b/gi, 'π')
    .replace(/\brho\b/gi, 'ρ')
    .replace(/\bPhi\b/g, 'Φ')
    .replace(/\bphi\b/g, 'φ')
    .replace(/->/g, '→')
    .replace(/\*/g, '×')
}

function ok(command: DrawerCommand, result: Omit<CommandResult, 'ok' | 'commandType'> = {}): CommandResult {
  return { ok: true, commandType: command.type, ...result }
}

function fail(command: DrawerCommand, error: string): CommandResult {
  console.warn(`[Command] ${command.type} failed: ${error}`)
  return { ok: false, commandType: command.type, error }
}

function withWarning(command: DrawerCommand, warning: string, result: Omit<CommandResult, 'ok' | 'commandType' | 'warnings'> = {}): CommandResult {
  console.warn(`[Command] ${command.type}: ${warning}`)
  return { ok: true, commandType: command.type, warnings: [warning], ...result }
}

function buildShapeUpdate(existing: any, command: Extract<DrawerCommand, { type: 'updateShape' }>) {
  return {
    id: existing.id,
    type: existing.type,
    x: command.x ?? existing.x,
    y: command.y ?? existing.y,
    rotation: command.rotation ?? existing.rotation,
    props: command.props ? { ...existing.props, ...command.props } : existing.props,
  }
}

function wrapLabel(text: string, maxLineLength = 12) {
  const raw = String(text ?? '').trim()
  if (raw.length <= maxLineLength) return raw
  const chunks: string[] = []
  for (let index = 0; index < raw.length; index += maxLineLength) {
    chunks.push(raw.slice(index, index + maxLineLength))
  }
  return chunks.slice(0, 3).join('\n')
}

function resolveLinePoints(command: Extract<DrawerCommand, { type: 'createLine' }>) {
  const absolutePoints = Array.isArray(command.points) && command.points.length >= 2
    ? command.points
    : [
        { x: command.x ?? 0, y: command.y ?? 0 },
        { x: command.endX ?? (command.x ?? 0) + 200, y: command.endY ?? (command.y ?? 0) },
      ]

  const origin = absolutePoints[0]
  const indexKeys = getIndices(absolutePoints.length)
  const points = Object.fromEntries(
    absolutePoints.map((point, index) => {
      const id = `p${index + 1}`
      return [id, {
        id,
        index: indexKeys[index],
        x: point.x - origin.x,
        y: point.y - origin.y,
      }]
    })
  )

  return { origin, points }
}

function resolveDrawSegment(command: Extract<DrawerCommand, { type: 'createDraw' }>) {
  const absolutePoints = Array.isArray(command.points) && command.points.length >= 2
    ? command.points
    : [{ x: 0, y: 0 }, { x: 200, y: 0 }]
  const minX = Math.min(...absolutePoints.map((point) => point.x))
  const minY = Math.min(...absolutePoints.map((point) => point.y))
  const path = b64Vecs.encodePoints(absolutePoints.map((point) => ({
    x: point.x - minX,
    y: point.y - minY,
    z: point.z ?? 0.5,
  })))
  return { x: minX, y: minY, path }
}

function getExistingBounds(editor: Editor) {
  const ids = Array.from(editor.getCurrentPageShapeIds()) as TLShapeId[]
  return ids.length > 0 ? editor.getShapesPageBounds(ids) : null
}

function resolveLayoutOrigin(editor: Editor, command: Extract<DrawerCommand, { type: 'layout' }>, width: number, height: number) {
  if (command.avoidExisting === false || command.x !== undefined || command.y !== undefined) {
    return { x: command.x ?? 80, y: command.y ?? 120 }
  }

  const existing = getExistingBounds(editor)
  if (!existing) return { x: 80, y: 120 }

  const gap = Math.max(command.gapX ?? 80, 110)
  return {
    x: Math.round((existing.maxX ?? existing.x + existing.w) + gap),
    y: Math.round(existing.y ?? 120),
    warning: `Placed layout to the right of existing bounds (${Math.round(width)}x${Math.round(height)}).`,
  }
}

function executeLayoutCommand(editor: Editor, command: Extract<DrawerCommand, { type: 'layout' }>): CommandResult {
  if (!Array.isArray(command.items) || command.items.length === 0) {
    return fail(command, 'layout.items must be a non-empty array')
  }

  const itemW = command.itemW ?? 250
  const itemH = command.itemH ?? 124
  const gapX = command.gapX ?? 86
  const gapY = command.gapY ?? 68
  const cols = command.mode === 'grid'
    ? Math.max(1, command.cols ?? Math.ceil(Math.sqrt(command.items.length)))
    : command.mode === 'horizontal'
      ? command.items.length
      : 1
  const rows = Math.ceil(command.items.length / cols)
  const titleH = command.title ? 62 : 0
  const totalW = cols * itemW + Math.max(0, cols - 1) * gapX
  const totalH = titleH + rows * itemH + Math.max(0, rows - 1) * gapY
  const origin = resolveLayoutOrigin(editor, command, totalW, totalH)
  const createdIds: string[] = []
  const sid = () => {
    const id = shapeId()
    createdIds.push(id)
    return id
  }

  if (command.title) {
    editor.createShape({
      id: sid(),
      type: 'text',
      x: origin.x,
      y: origin.y,
      props: { richText: toRichText(command.title), color: command.color ?? 'violet', size: 'xl', font: 'sans' },
    })
  }

  const nodeCenters: Array<{ x: number; y: number; w: number; h: number }> = []
  command.items.forEach((item, index) => {
    const col = command.mode === 'vertical' ? 0 : command.mode === 'horizontal' ? index : index % cols
    const row = command.mode === 'horizontal' ? 0 : command.mode === 'vertical' ? index : Math.floor(index / cols)
    const x = origin.x + col * (itemW + gapX)
    const y = origin.y + titleH + row * (itemH + gapY)
    const w = item.w ?? itemW
    const h = item.h ?? itemH
    nodeCenters.push({ x: x + w / 2, y: y + h / 2, w, h })

    editor.createShape({
      id: sid(),
      type: 'geo',
      x,
      y,
      props: {
        geo: (item.geo ?? 'rectangle') as TLGeoShapeGeoStyle,
        w,
        h,
        color: item.color ?? command.color ?? 'blue',
        fill: 'semi',
        dash: 'draw',
        font: 'sans',
        richText: toRichText(item.description ? `${wrapLabel(item.label, 12)}\n${wrapLabel(item.description, 16)}` : wrapLabel(item.label, 12)),
      },
    })
  })

  if (command.connect !== false && command.items.length > 1) {
    for (let index = 0; index < nodeCenters.length - 1; index++) {
      const start = nodeCenters[index]
      const end = nodeCenters[index + 1]
      const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
      const startX = horizontal ? start.x + start.w / 2 : start.x
      const startY = horizontal ? start.y : start.y + start.h / 2
      const endX = horizontal ? end.x - end.w / 2 : end.x
      const endY = horizontal ? end.y : end.y - end.h / 2
      editor.createShape({
        id: sid(),
        type: 'arrow',
        x: startX,
        y: startY,
        props: {
          color: command.color ?? 'violet',
          start: { x: 0, y: 0 },
          end: { x: endX - startX, y: endY - startY },
        },
      })
    }
  }

  return origin.warning ? withWarning(command, origin.warning, { createdIds }) : ok(command, { createdIds })
}

export function executeCommand(editor: Editor, command: DrawerCommand): CommandResult {
  const x = 'x' in command ? command.x ?? 0 : 0
  const y = 'y' in command ? command.y ?? 0 : 0

  switch (command.type) {
    case 'createSession':
      return withWarning(command, 'createSession is handled by the app shell, not the tldraw command adapter.')
    case 'createAnimatedBall':
      return withWarning(command, 'createAnimatedBall is handled by the app shell animation layer, not the tldraw command adapter.')
    case 'createPythonPlot':
      return withWarning(command, 'createPythonPlot is handled by the app shell and Python plot API, not the tldraw command adapter.')
    case 'clear':
      editor.deleteShapes(Array.from(editor.getCurrentPageShapeIds()))
      return ok(command)
    case 'zoomToFit':
      editor.zoomToFit({ animation: { duration: 300 } })
      return ok(command)
    case 'undo':
      editor.undo()
      return ok(command)
    case 'redo':
      editor.redo()
      return ok(command)
    case 'deleteShape':
      if (!editor.getShape(toShapeId(command.shapeId))) return fail(command, `Missing shape "${command.shapeId}"`)
      editor.deleteShapes([toShapeId(command.shapeId)])
      return ok(command, { deletedIds: [command.shapeId] })
    case 'updateShape': {
      const existing = editor.getShape(toShapeId(command.shapeId))
      if (!existing) return fail(command, `Missing shape "${command.shapeId}"`)
      editor.updateShape(buildShapeUpdate(existing, command))
      return ok(command, { updatedIds: [command.shapeId] })
    }
    case 'layout':
      return executeLayoutCommand(editor, command)
    case 'createText': {
      const id = shapeId()
      editor.createShape({
        id,
        type: 'text',
        x,
        y,
        props: { richText: toRichText(command.text), color: command.color ?? 'black', size: command.size ?? 'm', font: 'sans' },
      })
      return ok(command, { createdIds: [id] })
    }
    case 'createFormula': {
      const id = shapeId()
      editor.createShape({
        id,
        type: 'text',
        x,
        y,
        props: { richText: toRichText(normalizeFormulaText(command.text)), color: command.color ?? 'black', size: command.size ?? 'l', font: 'sans' },
      })
      return ok(command, { createdIds: [id] })
    }
    case 'createNote': {
      const id = shapeId()
      editor.createShape({
        id,
        type: 'note',
        x,
        y,
        props: { richText: toRichText(command.text), color: command.color ?? 'yellow', size: 'm', font: 'sans' },
      })
      return ok(command, { createdIds: [id] })
    }
    case 'createGeo': {
      const id = shapeId()
      editor.createShape({
        id,
        type: 'geo',
        x,
        y,
        props: {
          geo: (command.geo ?? 'rectangle') as TLGeoShapeGeoStyle,
          w: command.w ?? 240,
          h: command.h ?? 120,
          color: command.color ?? 'blue',
          fill: 'semi',
          dash: 'draw',
          font: 'sans',
          richText: toRichText(command.label ?? ''),
        },
      })
      return ok(command, { createdIds: [id] })
    }
    case 'createLine': {
      const id = shapeId()
      const line = resolveLinePoints(command)
      editor.createShape({
        id,
        type: 'line',
        x: line.origin.x,
        y: line.origin.y,
        props: {
          color: command.color ?? 'black',
          dash: command.dash ?? 'solid',
          size: command.size ?? 'm',
          spline: command.spline ?? 'line',
          points: line.points,
          scale: 1,
        },
      })
      return ok(command, { createdIds: [id] })
    }
    case 'createDraw': {
      const id = shapeId()
      const draw = resolveDrawSegment(command)
      editor.createShape({
        id,
        type: 'draw',
        x: draw.x,
        y: draw.y,
        props: {
          segments: [{ type: 'free', path: draw.path }],
          color: command.color ?? 'black',
          fill: command.fill ?? 'none',
          dash: command.dash ?? 'solid',
          size: command.size ?? 'm',
          isComplete: true,
          isClosed: command.closed ?? false,
          isPen: command.pen ?? false,
          scale: 1,
          scaleX: 1,
          scaleY: 1,
        },
      })
      return ok(command, { createdIds: [id] })
    }
    case 'createHighlight': {
      const id = shapeId()
      editor.createShape({
        id,
        type: 'geo',
        x,
        y,
        opacity: command.opacity ?? 0.28,
        props: {
          geo: 'rectangle',
          w: command.w ?? 220,
          h: command.h ?? 72,
          color: command.color ?? 'yellow',
          fill: 'solid',
          dash: 'solid',
          font: 'sans',
          richText: toRichText(''),
        },
      })
      return ok(command, { createdIds: [id] })
    }
    case 'createArrow': {
      const id = shapeId()
      editor.createShape({
        id,
        type: 'arrow',
        x,
        y,
        props: {
          color: command.color ?? 'black',
          start: { x: 0, y: 0 },
          end: { x: (command.endX ?? x + 200) - x, y: (command.endY ?? y + 100) - y },
        },
      })
      return ok(command, { createdIds: [id] })
    }
    case 'createImage': {
      const id = shapeId()
      const assetId = AssetRecordType.createId() as TLAssetId
      const w = command.w ?? command.naturalW ?? 640
      const h = command.h ?? command.naturalH ?? 360
      editor.createAssets([{
        id: assetId,
        typeName: 'asset',
        type: 'image',
        props: {
          src: command.src,
          w: command.naturalW ?? w,
          h: command.naturalH ?? h,
          mimeType: command.mimeType ?? 'image/png',
          name: command.name ?? 'image',
          isAnimated: false,
        },
        meta: {},
      }])
      editor.createShape({
        id,
        type: 'image',
        x,
        y,
        props: {
          assetId,
          w,
          h,
          playing: true,
          url: '',
          crop: null,
          flipX: false,
          flipY: false,
          altText: command.altText ?? '',
        },
      })
      if (command.background) editor.sendToBack([id])
      return ok(command, { createdIds: [id] })
    }
    case 'scene':
      createScene(editor, command.name)
      return ok(command)
    case 'insert_template': {
      const tmpl = getTemplate(command.templateId)
      if (!tmpl) return fail(command, `Unknown template "${command.templateId}"`)
      const errors = validateSlots(tmpl.def, command.slots)
      if (errors.length > 0) return fail(command, `Slot validation failed: ${errors.join('; ')}`)
      const ids = tmpl.render(editor, command)
      command._createdIds = ids
      console.log(`[Template] "${command.templateId}" -> ${ids.length} shapes`)
      return ok(command, { createdIds: ids })
    }
  }
}

export function createScene(editor: Editor, name: SceneName) {
  editor.deleteShapes(Array.from(editor.getCurrentPageShapeIds()))
  const run = (command: DrawerCommand) => executeCommand(editor, command)

  if (name === 'lesson') {
    run({ type: 'createText', x: 40, y: 20, text: '二次函数：从图像理解顶点', color: 'violet', size: 'xl' })
    run({ type: 'createGeo', x: 60, y: 120, w: 290, h: 180, label: 'y = (x - 2)^2 - 1', color: 'blue' })
    run({ type: 'createArrow', x: 350, y: 210, endX: 490, endY: 210, color: 'violet' })
    run({ type: 'createNote', x: 500, y: 110, text: '顶点：(2, -1)\n对称轴：x = 2', color: 'yellow' })
    run({ type: 'createNote', x: 500, y: 260, text: '试一试：\ny = (x + 3)^2 + 2\n顶点在哪里？', color: 'green' })
  } else if (name === 'brainstorm') {
    run({ type: 'createText', x: 250, y: 20, text: '产品创意：AI 学习画布', color: 'violet', size: 'xl' })
    run({ type: 'createGeo', x: 300, y: 150, w: 240, h: 120, label: 'GOTIM DRAWER', color: 'violet', geo: 'ellipse' })
    ;[
      ['讲题', 10, 80, 'blue'],
      ['绘画', 600, 80, 'orange'],
      ['下棋', 20, 300, 'green'],
      ['演示', 600, 300, 'red'],
    ].forEach(([label, px, py, color]) => {
      run({ type: 'createNote', x: Number(px), y: Number(py), text: String(label), color: String(color) })
      run({ type: 'createArrow', x: Number(px) + 170, y: Number(py) + 70, endX: 390, endY: 210, color: String(color) })
    })
  } else if (name === 'chess') {
    run({ type: 'createText', x: 60, y: 10, text: '棋局复盘：控制中心', color: 'green', size: 'xl' })
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        run({ type: 'createGeo', x: 70 + col * 48, y: 90 + row * 48, w: 48, h: 48, color: (row + col) % 2 ? 'grey' : 'white' })
      }
    }
    run({ type: 'createNote', x: 500, y: 110, text: '当前目标\n占领中心并完成王翼易位', color: 'green' })
    run({ type: 'createNote', x: 500, y: 270, text: 'Agent 建议\n1. Nf3\n2. Bc4\n3. O-O', color: 'yellow' })
  } else {
    run({ type: 'createText', x: 70, y: 40, text: '让想法在画布上发生', color: 'violet', size: 'xl' })
    run({ type: 'createText', x: 72, y: 120, text: '一个由 Coding Agent 实时控制的通用视觉工作台', color: 'grey', size: 'm' })
    run({
      type: 'layout',
      mode: 'horizontal',
      x: 70,
      y: 210,
      itemW: 230,
      itemH: 130,
      connect: true,
      items: [
        { label: '理解上下文', color: 'blue' },
        { label: '生成与编辑', color: 'violet' },
        { label: '讲解与协作', color: 'green' },
      ],
    })
  }

  window.setTimeout(() => editor.zoomToFit({ animation: { duration: 450 } }), 50)
}
