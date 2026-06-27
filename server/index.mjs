import cors from 'cors'
import express from 'express'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const port = Number(process.env.PORT || 8787)
const clients = new Set()
let commandId = 0
let batchId = 0
let planId = 0
const commandHistory = []
let lastBatchCommands = []
let canvasSnapshot = { pageId: null, shapeCount: 0, bounds: null, shapes: [], updatedAt: null }
let problemImage = null

const zh = (text) => text
const templates = ['math_explainer_card', 'coordinate_plot', 'flowchart', 'vertical_calculation', 'charged_ring_field_demo']

const capabilities = {
  name: 'GOTIM DRAWER',
  description: 'A browser canvas that coding agents control with JSON commands.',
  agentSkill: {
    firstRead: 'GET /agent.md',
    humanGuide: 'GET /help.html',
    firstUsePrompt: [
      'Use GOTIM DRAWER to complete this visual task.',
      'Before doing anything, read http://localhost:5173/agent.md.',
      'Then check http://localhost:8787/api/health, read /api/capabilities, and use /api/commands/batch.',
      'Do not manipulate DOM or tldraw store directly.',
      'Do not clear the canvas unless the user explicitly asks to replace it.',
    ].join(' '),
  },
  workflow: [
    'Open the canvas in a browser.',
    'GET /api/health and require clients >= 1.',
    'POST /api/plan for natural-language planning, or send commands directly.',
    'Use step-by-step commands with delay for teaching.',
    'For image-based questions, place the problem image on the canvas first, then annotate over it or below it.',
    'For drawing requests, create native tldraw shapes and draw strokes; do not paste a finished photo/SVG as the final artwork.',
    'Finish with zoomToFit.',
  ],
  endpoints: {
    humanHelp: 'GET /help.html',
    agentHelp: 'GET /agent.md',
    health: 'GET /api/health',
    capabilities: 'GET /api/capabilities',
    plan: 'POST /api/plan',
    command: 'POST /api/commands',
    batch: 'POST /api/commands/batch',
    commandAck: 'POST /api/commands/ack',
    commandHistory: 'GET /api/commands/history',
    events: 'GET /api/events',
    canvasSnapshot: 'POST /api/canvas/snapshot',
    canvasShapes: 'GET /api/canvas/shapes',
    canvasBounds: 'GET /api/canvas/bounds',
    problemImage: 'GET /api/problem-image',
  },
  commands: {
    createSession: {
      example: { type: 'createSession', mode: 'lesson', title: 'Triangle counting problem', prompt: 'Explain this problem' },
      note: 'Use this as the first command when starting a separate task window. It prevents new work from mixing with an old dinosaur drawing, game, or lesson session.',
    },
    clear: { example: { type: 'clear' }, destructive: true },
    zoomToFit: { example: { type: 'zoomToFit' } },
    undo: { example: { type: 'undo' } },
    redo: { example: { type: 'redo' } },
    deleteShape: { example: { type: 'deleteShape', shapeId: 'shape:abc123' }, destructive: true },
    updateShape: { example: { type: 'updateShape', shapeId: 'shape:abc123', x: 160, y: 220, props: { color: 'green' } } },
    createText: { example: { type: 'createText', text: 'Title', x: 80, y: 40, color: 'violet', size: 'xl' } },
    createFormula: {
      example: { type: 'createFormula', text: 'v_1 = sqrt(GM/R), M/R^3 same -> GM/R = G*(M/R^3)*R^2', x: 80, y: 120, color: 'black', size: 'l' },
      note: 'Use for math and physics expressions. It normalizes sqrt(), ^2, ^3, subscripts, arrows, and multiplication into readable canvas text.',
    },
    createAnimatedBall: {
      example: { type: 'createAnimatedBall', x: 420, y: 290, radius: 34, orbitRadius: 118, color: '#7f46e8', duration: 2400, label: 'Rotating ball' },
      note: 'Creates a live front-end animation layer above the canvas, plus editable orbit/title guide shapes.',
    },
    createPythonPlot: {
      example: {
        type: 'createPythonPlot',
        title: 'E(x) curve',
        expression: 'x/(x^2+1)^(3/2)',
        xMin: 0,
        xMax: 3.5,
        samples: 500,
        xLabel: 'x/R',
        yLabel: 'normalized E',
        x: 760,
        y: 140,
        w: 560,
        h: 380,
        notes: 'Use this for math/physics plots. The frontend inserts a separate Python plot panel.',
      },
      note: 'Generates a Matplotlib PNG through POST /api/python/plot and inserts it as an independent Python plot area on the canvas.',
    },
    createNote: { example: { type: 'createNote', text: 'Important note', x: 120, y: 160, color: 'yellow' } },
    createGeo: { example: { type: 'createGeo', label: 'Step 1', x: 80, y: 180, w: 240, h: 120, color: 'blue', geo: 'rectangle' } },
    createLine: { example: { type: 'createLine', points: [{ x: 120, y: 320 }, { x: 360, y: 320 }], color: 'blue', size: 'l' } },
    createDraw: { example: { type: 'createDraw', points: [{ x: 120, y: 300 }, { x: 180, y: 260 }, { x: 260, y: 300 }], color: 'green', fill: 'semi', size: 'l', closed: true } },
    createHighlight: { example: { type: 'createHighlight', x: 120, y: 420, w: 300, h: 64, color: 'yellow' } },
    createArrow: { example: { type: 'createArrow', x: 320, y: 240, endX: 440, endY: 240, color: 'violet' } },
    createImage: { example: { type: 'createImage', src: 'data:image/png;base64,...', x: 80, y: 120, w: 600, h: 180, background: true } },
    layout: { example: { type: 'layout', mode: 'horizontal', items: [{ label: 'A' }, { label: 'B' }] } },
    insert_template: { templates },
  },
  imageProblemWorkflow: {
    status: 'frontend_upload_and_paste_ready',
    note: 'Upload or paste an image in the UI. The image is placed as a background problem image. Vision/OCR analysis is a planned integration point.',
    annotationStyle: 'Use createHighlight/createArrow/createText/createNote above the problem image or in blank space below it.',
    visualTeachingLayout: {
      recommendedZones: ['original problem', 'known-condition highlights', 'clean reconstructed diagram', 'formula derivation', 'final answer and checks'],
      pythonRole: 'Use createPythonPlot for function/physics curves, or use Python/SymPy/NumPy to compute exact samples, extrema, intersections, or coordinates and convert results into editable canvas commands.',
      example: 'Charged ring: derive E(x), compute max at x=R/sqrt(2), draw ring/axis/P/formulas/curve/max marker with native shapes.',
    },
  },
  formulaTextRules: [
    'Use createFormula for formulas instead of raw createText.',
    'Prefer Unicode-readable math: √(...), R², R³, v₁, ρ, π, →.',
    'Do not put a long derivation into one text box. Split it into 2-4 short formula lines.',
    'Avoid raw sqrt(...), x^2, R^3, and -> in final visible text unless createFormula will normalize them.',
    'For complex plots or extrema, prefer createPythonPlot to make a dedicated Python plot panel; for editable geometry, compute points with Python/NumPy/SymPy, then draw canvas curves and labels.',
  ],
  waitingExperience: {
    status: 'temporary_working_ui_ready',
    states: ['reading problem', 'extracting known quantities', 'planning layout', 'computing plot points', 'checking overlap', 'applying commands'],
    rule: 'Temporary thinking drafts are product placeholders and should be removed before final drawing commands are applied.',
  },
  drawingWorkflow: {
    status: 'native_draw_ready',
    note: 'For artwork such as a dinosaur, use createDraw/createGeo/createLine in visible steps. Reference images may guide the shape, but the final canvas should remain editable native shapes.',
    playbackStyle: 'Group commands by step, add short delays, and finish with zoomToFit so replay shows the drawing process.',
    liveAnimation: 'For simple live motion demos, use createAnimatedBall. For complex animation, add a dedicated front-end animation layer command instead of trying to fake motion with many static tldraw shapes.',
  },
  boardGameWorkflow: {
    status: 'gomoku_ready_extension_path_defined',
    currentGame: {
      name: 'Gomoku',
      board: '15x15 intersections',
      rules: [
        'Human and AI take turns placing one stone on an empty intersection.',
        'Five connected stones horizontally, vertically, or diagonally wins.',
        'The front end handles legal moves, simple AI response, win detection, and canvas mirroring.',
      ],
    },
    extendToNewGame: [
      'Search or confirm the game rules if unsure.',
      'Define board state, pieces, legal moves, turn order, and win condition.',
      'Implement a minimal rule engine first.',
      'Add a visual board overlay or editable canvas board.',
      'Expose the new workflow in /agent.md and /api/capabilities.',
      'Use canvas commands for live explanation, legal move hints, and review.',
    ],
  },
  manualDrawingRoadmap: {
    status: 'canvas_snapshot_available',
    currentInput: 'GET /api/canvas/shapes returns shape summaries, text, bounds, and compact points.',
    futureFlow: [
      'User draws or selects a region.',
      'Frontend debounces updates or sends selected shapes only.',
      'Backend agent infers intent from strokes, text, arrows, highlights, and bounds.',
      'Agent responds with annotations, corrections, or new drawing commands.',
    ],
    performanceRule: 'Do not stream every pointer event to the backend. Prefer pause-based debounce, selected-shape analysis, or explicit analyze actions.',
    useCases: ['drawing contest', 'target-area tutoring', 'function sketch critique', 'collaborative drawing', 'board-game move annotation'],
  },
}

app.use(cors())
app.use(express.json({ limit: '2mb' }))

const now = () => new Date().toISOString()
const makeBatchId = () => `batch_${++batchId}`
const makePlanId = () => `plan_${++planId}`
const normalizeText = (value) => String(value ?? '').trim()
const contains = (text, words) => words.some((word) => text.includes(word))

function runPythonPlot(input) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', ['-c', `
import base64, io, json, math, sys

payload = json.loads(sys.stdin.read() or '{}')
expr = str(payload.get('expression') or 'x/(x**2+1)**1.5')
expr = expr.replace('^', '**')
x_min = float(payload.get('xMin', -5))
x_max = float(payload.get('xMax', 5))
samples = max(40, min(2000, int(payload.get('samples', 500))))
title = str(payload.get('title') or 'Python plot')
x_label = str(payload.get('xLabel') or 'x')
y_label = str(payload.get('yLabel') or 'y')
color = str(payload.get('color') or '#dc2626')
markers = payload.get('markers') or []

allowed = {name: getattr(math, name) for name in dir(math) if not name.startswith('_')}
allowed.update({'abs': abs, 'min': min, 'max': max, 'pow': pow})

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
except Exception as exc:
    print(json.dumps({'ok': False, 'error': 'matplotlib is required: ' + str(exc)}))
    sys.exit(0)

xs = [x_min + (x_max - x_min) * i / (samples - 1) for i in range(samples)]
ys = []
for x in xs:
    scope = dict(allowed)
    scope['x'] = x
    try:
        y = eval(expr, {'__builtins__': {}}, scope)
        y = float(y)
        if not math.isfinite(y):
            y = None
    except Exception:
        y = None
    ys.append(y)

fig, ax = plt.subplots(figsize=(7.2, 4.8), dpi=140)
ax.axhline(0, color='#777777', linewidth=0.8)
ax.axvline(0, color='#777777', linewidth=0.8)
current_x, current_y = [], []
for x, y in zip(xs, ys):
    if y is None:
        if current_x:
            ax.plot(current_x, current_y, color=color, linewidth=2.4)
            current_x, current_y = [], []
    else:
        current_x.append(x)
        current_y.append(y)
if current_x:
    ax.plot(current_x, current_y, color=color, linewidth=2.4)

finite = [(x, y) for x, y in zip(xs, ys) if y is not None]
if finite:
    max_point = max(finite, key=lambda item: item[1])
    ax.scatter([max_point[0]], [max_point[1]], s=32, color='#7c3aed', zorder=4)
    ax.annotate('max', xy=max_point, xytext=(10, 12), textcoords='offset points', color='#5b21b6')

for marker in markers:
    try:
        mx = float(marker.get('x'))
        scope = dict(allowed)
        scope['x'] = mx
        my = float(eval(expr, {'__builtins__': {}}, scope))
        label = str(marker.get('label') or f'x={mx:g}')
        marker_color = str(marker.get('color') or '#2563eb')
        ax.scatter([mx], [my], s=28, color=marker_color, zorder=5)
        ax.annotate(label, xy=(mx, my), xytext=(8, -16), textcoords='offset points', color=marker_color)
    except Exception:
        pass

ax.set_title(title)
ax.set_xlabel(x_label)
ax.set_ylabel(y_label)
ax.grid(True, alpha=0.28)
fig.tight_layout()
buf = io.BytesIO()
fig.savefig(buf, format='png', transparent=False, facecolor='white')
plt.close(fig)
encoded = base64.b64encode(buf.getvalue()).decode('ascii')
print(json.dumps({'ok': True, 'image': {'src': 'data:image/png;base64,' + encoded, 'w': 1008, 'h': 672, 'mimeType': 'image/png', 'title': title}}))
`], { stdio: ['pipe', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', () => {
      try {
        resolve(JSON.parse(stdout || '{}'))
      } catch (error) {
        reject(new Error(stderr || stdout || error.message))
      }
    })
    child.stdin.write(JSON.stringify(input ?? {}))
    child.stdin.end()
  })
}

function addHistory(command, deliveredTo) {
  const entry = {
    id: command.id,
    batchId: command.batchId ?? null,
    type: command.type,
    command: { ...command },
    deliveredTo,
    status: deliveredTo > 0 ? 'pending' : 'undelivered',
    createdAt: now(),
    deliveredAt: deliveredTo > 0 ? now() : null,
    acknowledgedAt: null,
    result: null,
  }
  commandHistory.unshift(entry)
  if (commandHistory.length > 300) commandHistory.pop()
  return entry
}

function findHistoryEntry(id) {
  return commandHistory.find((entry) => entry.id === Number(id))
}

function broadcast(command) {
  for (const client of clients) client.write(`data: ${JSON.stringify(command)}\n\n`)
  return clients.size
}

function placement(replaceCanvas) {
  if (replaceCanvas || !canvasSnapshot.bounds) return { x: 80, y: 70 }
  const bounds = canvasSnapshot.bounds
  const maxX = Number(bounds.maxX ?? (bounds.x ?? 80) + (bounds.w ?? 0))
  const y = Number(bounds.y ?? bounds.minY ?? 80)
  return { x: Math.round(maxX + 140), y: Math.round(y) }
}

function delayed(commands, start = 0, step = 650) {
  return commands.map((command, index) => ({ ...command, delay: index === 0 ? start : step }))
}

function resolveLinePoints(command) {
  if (Array.isArray(command.points) && command.points.length >= 2) return command.points
  const x = Number(command.x ?? 0)
  const y = Number(command.y ?? 0)
  const endX = Number(command.endX ?? x + 200)
  const endY = Number(command.endY ?? y)
  return [{ x, y }, { x: endX, y: endY }]
}

function enrichSnapshotShapes(shapes) {
  const lineCommands = lastBatchCommands.filter((command) => command.type === 'createLine')
  let lineIndex = 0
  return shapes.map((shape) => {
    if (shape?.type !== 'line') return shape
    const existingPoints = shape?.props?.points
    if (existingPoints && Object.keys(existingPoints).length > 0) return shape
    const command = lineCommands[lineIndex++]
    if (!command) return shape
    const points = resolveLinePoints(command)
    const origin = points[0]
    const mappedPoints = Object.fromEntries(points.map((point, index) => {
      const id = `p${index + 1}`
      return [id, { id, index: `a${index + 1}`, x: point.x - origin.x, y: point.y - origin.y }]
    }))
    return {
      ...shape,
      props: {
        ...(shape.props ?? {}),
        points: mappedPoints,
      },
    }
  })
}

function buildPythagoreanPlan(replaceCanvas) {
  const p = placement(replaceCanvas)
  const x = p.x
  const y = p.y
  const a = { x: x + 150, y: y + 340 }
  const b = { x: x + 510, y: y + 340 }
  const c = { x: x + 150, y: y + 120 }
  const commands = [
    { step: 0, stepTitle: zh('导入'), type: 'createText', x, y, text: zh('勾股定理：从一个真正的直角三角形开始'), color: 'violet', size: 'xl' },
    { step: 0, stepTitle: zh('导入'), type: 'createText', x, y: y + 62, text: zh('老师：先不背公式，我们先把直角、直角边、斜边找清楚。'), color: 'black', size: 'm' },

    { step: 1, stepTitle: zh('画直角边 a'), type: 'createLine', points: [a, c], color: 'blue', size: 'l' },
    { step: 1, stepTitle: zh('画直角边 a'), type: 'createText', x: x + 92, y: y + 210, text: zh('a 直角边'), color: 'blue', size: 'm' },
    { step: 1, stepTitle: zh('画直角边 a'), type: 'createNote', x: x + 610, y: y + 112, text: zh('第 1 步\n先画一条竖直边，叫 a。\n它贴着直角，是直角边。'), color: 'yellow' },

    { step: 2, stepTitle: zh('画直角边 b'), type: 'createLine', points: [a, b], color: 'green', size: 'l' },
    { step: 2, stepTitle: zh('画直角边 b'), type: 'createText', x: x + 300, y: y + 366, text: zh('b 直角边'), color: 'green', size: 'm' },
    { step: 2, stepTitle: zh('画直角边 b'), type: 'createHighlight', x: a.x - 8, y: a.y - 8, w: 56, h: 56, color: 'yellow', opacity: 0.18 },

    { step: 3, stepTitle: zh('画斜边 c'), type: 'createLine', points: [c, b], color: 'orange', size: 'l' },
    { step: 3, stepTitle: zh('画斜边 c'), type: 'createText', x: x + 356, y: y + 212, text: zh('c 斜边'), color: 'orange', size: 'm' },
    { step: 3, stepTitle: zh('画斜边 c'), type: 'createNote', x: x + 610, y: y + 280, text: zh('第 2 步\n对着直角的那条最长边，\n叫斜边 c。'), color: 'yellow' },

    { step: 4, stepTitle: zh('标直角'), type: 'createLine', points: [{ x: a.x, y: a.y - 42 }, { x: a.x + 42, y: a.y - 42 }, { x: a.x + 42, y: a.y }], color: 'red', size: 'l' },
    { step: 4, stepTitle: zh('标直角'), type: 'createText', x: a.x + 16, y: a.y - 78, text: zh('这里是 90°'), color: 'red', size: 'm' },

    { step: 5, stepTitle: zh('写公式'), type: 'createText', x, y: y + 500, text: zh('第 3 步：把关系写成公式'), color: 'violet', size: 'l' },
    { step: 5, stepTitle: zh('写公式'), type: 'createHighlight', x: x + 40, y: y + 558, w: 380, h: 72, color: 'yellow', opacity: 0.22 },
    { step: 5, stepTitle: zh('写公式'), type: 'createText', x: x + 64, y: y + 570, text: 'a² + b² = c²', color: 'black', size: 'xl' },
    { step: 5, stepTitle: zh('写公式'), type: 'createNote', x: x + 610, y: y + 500, text: zh('意思是：\n两条直角边的平方相加，\n等于斜边的平方。'), color: 'green' },

    { step: 6, stepTitle: zh('代入例子'), type: 'createText', x, y: y + 690, text: zh('第 4 步：代入 3、4、5 的例子'), color: 'violet', size: 'l' },
    { step: 6, stepTitle: zh('代入例子'), type: 'createText', x: x + 48, y: y + 752, text: 'a = 3,  b = 4', color: 'black', size: 'l' },
    { step: 6, stepTitle: zh('代入例子'), type: 'createText', x: x + 48, y: y + 810, text: '3² + 4² = 9 + 16 = 25', color: 'black', size: 'l' },
    { step: 6, stepTitle: zh('代入例子'), type: 'createText', x: x + 48, y: y + 868, text: 'c² = 25，所以 c = 5', color: 'green', size: 'l' },

    { step: 7, stepTitle: zh('总结'), type: 'createNote', x: x + 610, y: y + 740, text: zh('结论\n看到直角三角形，\n先找 a、b、c，\n再用 a² + b² = c²。'), color: 'yellow' },
    { step: 8, stepTitle: zh('全图'), type: 'zoomToFit' },
  ]
  return delayed(commands, 0, 600)
}

function buildFaradayPlan(replaceCanvas) {
  const p = placement(replaceCanvas)
  const x = p.x
  const y = p.y
  const magnetX = x + 40
  const coilX = x + 250
  const noteX = x + 600
  const magnetY = y + 128
  const coilY = y + 112
  const formulaY = y + 420
  const exampleY = y + 560
  const commands = [
    { step: 0, stepTitle: zh('引入'), type: 'createText', x, y, text: zh('法拉第电磁感应定律'), color: 'violet', size: 'xl' },
    { step: 0, stepTitle: zh('引入'), type: 'createText', x, y: y + 62, text: zh('老师：先看图，再看公式。磁场一变化，回路里就会出现感应电动势。'), color: 'black', size: 'm' },

    { step: 1, stepTitle: zh('看图'), type: 'createGeo', x: magnetX, y: magnetY, w: 96, h: 72, label: 'N', color: 'red', geo: 'rectangle' },
    { step: 1, stepTitle: zh('看图'), type: 'createGeo', x: magnetX, y: magnetY + 72, w: 96, h: 72, label: 'S', color: 'blue', geo: 'rectangle' },
    { step: 1, stepTitle: zh('看图'), type: 'createText', x: magnetX - 6, y: magnetY - 36, text: zh('磁铁'), color: 'red', size: 'm' },
    { step: 1, stepTitle: zh('看图'), type: 'createArrow', x: magnetX + 120, y: magnetY + 72, endX: coilX - 22, endY: magnetY + 72, color: 'orange' },
    { step: 1, stepTitle: zh('看图'), type: 'createText', x: magnetX + 126, y: magnetY + 38, text: zh('运动方向'), color: 'orange', size: 'm' },
    { step: 1, stepTitle: zh('看图'), type: 'createGeo', x: coilX, y: coilY, w: 260, h: 220, label: zh('线圈回路'), color: 'blue', geo: 'ellipse' },
    { step: 1, stepTitle: zh('看图'), type: 'createHighlight', x: coilX - 20, y: coilY - 14, w: 300, h: 250, color: 'yellow', opacity: 0.16 },
    { step: 1, stepTitle: zh('看图'), type: 'createArrow', x: magnetX + 140, y: magnetY + 108, endX: coilX + 20, endY: coilY + 120, color: 'green' },
    { step: 1, stepTitle: zh('看图'), type: 'createText', x: coilX + 44, y: coilY - 38, text: zh('磁通量 Φ 变化'), color: 'green', size: 'm' },
    { step: 1, stepTitle: zh('看图'), type: 'createNote', x: noteX, y: y + 118, text: zh('先抓住一个核心：\n穿过线圈的磁通量变了，\n线圈里就会“冒出”感应电动势。'), color: 'yellow' },

    { step: 2, stepTitle: zh('写公式'), type: 'createText', x, y: formulaY, text: zh('公式长这样：'), color: 'violet', size: 'l' },
    { step: 2, stepTitle: zh('写公式'), type: 'createHighlight', x: x + 42, y: formulaY + 44, w: 360, h: 82, color: 'yellow', opacity: 0.22 },
    { step: 2, stepTitle: zh('写公式'), type: 'createText', x: x + 60, y: formulaY + 58, text: 'ε = -ΔΦ / Δt', color: 'black', size: 'xl' },
    { step: 2, stepTitle: zh('写公式'), type: 'createText', x: x + 60, y: formulaY + 120, text: 'Φ = B·S·cosθ', color: 'black', size: 'l' },
    { step: 2, stepTitle: zh('写公式'), type: 'createNote', x: noteX, y: formulaY + 26, text: zh('ε 是感应电动势。\nΦ 是磁通量。\nΔΦ/Δt 表示磁通量变化得有多快。'), color: 'green' },

    { step: 3, stepTitle: zh('理解负号'), type: 'createText', x, y: exampleY, text: zh('为什么前面有一个负号？'), color: 'violet', size: 'l' },
    { step: 3, stepTitle: zh('理解负号'), type: 'createNote', x, y: exampleY + 60, text: zh('这是楞次定律的意思：\n感应出来的效果，总是阻碍“磁通量的变化”。'), color: 'blue' },
    { step: 3, stepTitle: zh('理解负号'), type: 'createArrow', x: x + 380, y: exampleY + 110, endX: x + 540, endY: exampleY + 110, color: 'violet' },
    { step: 3, stepTitle: zh('理解负号'), type: 'createText', x: x + 560, y: exampleY + 84, text: zh('变化越快，感应越强。'), color: 'violet', size: 'm' },

    { step: 4, stepTitle: zh('举例'), type: 'createText', x, y: exampleY + 190, text: zh('例子：磁铁靠近线圈'), color: 'violet', size: 'l' },
    { step: 4, stepTitle: zh('举例'), type: 'createArrow', x: magnetX + 150, y: magnetY + 76, endX: coilX - 40, endY: magnetY + 76, color: 'orange' },
    { step: 4, stepTitle: zh('举例'), type: 'createNote', x, y: exampleY + 250, text: zh('磁通量增大 -> 线圈中产生感应电流 ->\n感应磁场要“顶住”这种增加。'), color: 'yellow' },
    { step: 4, stepTitle: zh('举例'), type: 'createText', x: x + 46, y: exampleY + 360, text: zh('结论：先看“磁通量有没有变”，再判断方向。'), color: 'green', size: 'l' },

    { step: 5, stepTitle: zh('总结'), type: 'createNote', x: noteX, y: exampleY + 210, text: zh('三句话记住它：\n1. 磁通量变化 -> 有感应电动势。\n2. ε = -ΔΦ/Δt。\n3. 负号说明“阻碍变化”。'), color: 'yellow' },
    { step: 6, stepTitle: zh('全图'), type: 'zoomToFit' },
  ]
  return delayed(commands, 0, 560)
}

function buildSimplePlan(prompt, mode, replaceCanvas) {
  const p = placement(replaceCanvas)
  return delayed([
    { type: 'layout', mode: mode === 'presentation' ? 'grid' : 'horizontal', x: p.x, y: p.y, avoidExisting: false, title: prompt.slice(0, 28) || '画布计划', itemW: 250, itemH: 124, connect: mode !== 'presentation', items: [
      { label: '观察', description: '先看问题', color: 'blue' },
      { label: '分析', description: '拆成步骤', color: 'violet' },
      { label: '结论', description: '整理答案', color: 'green' },
    ] },
    { type: 'zoomToFit' },
  ], 0, 600)
}

function safeDrawingText(value, fallback) {
  const text = String(value ?? '')
  return /[�]{1,}|\?{3,}|[锛冩涓绗閮灞瑁鎻闃]{2,}/.test(text) ? fallback : text
}

function withStep(command, step, stepTitle, delay = 320) {
  const fallbackTitles = ['plan drawing stages', 'big shapes', 'parts', 'details', 'outline', 'shade and highlight', 'finish']
  return { ...command, step, stepTitle: safeDrawingText(stepTitle, fallbackTitles[step] ?? `step ${step}`), delay }
}

function drawShape(points, options = {}) {
  return {
    type: 'createDraw',
    points,
    color: options.color ?? 'green',
    fill: options.fill ?? 'none',
    size: options.size ?? 'm',
    dash: options.dash ?? 'solid',
    closed: Boolean(options.closed),
    pen: false,
  }
}

function lineShape(points, options = {}) {
  return {
    type: 'createLine',
    points,
    color: options.color ?? 'black',
    size: options.size ?? 'm',
    dash: options.dash ?? 'solid',
    spline: options.spline ?? 'cubic',
  }
}

function textShape(text, x, y, options = {}) {
  return {
    type: 'createText',
    text: safeDrawingText(text, options.fallbackText ?? 'Native drawing'),
    x,
    y,
    color: options.color ?? 'black',
    size: options.size ?? 'm',
  }
}

function shifted(points, dx, dy) {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy, z: point.z }))
}

function buildDinosaurDrawingPlan(prompt, replaceCanvas) {
  const p = placement(replaceCanvas)
  const x = p.x
  const y = p.y
  const title = prompt.includes('恐龙') || prompt.toLowerCase().includes('dinosaur') ? '卡通恐龙' : prompt.slice(0, 18) || '原生画板插画'
  const dx = x - 70
  const dy = y - 120
  const commands = [
    withStep(textShape(`${title}：结构化原生绘制`, x, y, { color: 'violet', size: 'xl' }), 0, '确定绘画流程', 180),
    withStep(textShape('流程：大形 -> 局部 -> 装饰 -> 描边 -> 阴影高光', x + 2, y + 58, { color: 'black', size: 'm' }), 0, '确定绘画流程', 180),

    withStep(drawShape(shifted([
      { x: 300, y: 455 }, { x: 330, y: 390 }, { x: 400, y: 338 }, { x: 520, y: 312 },
      { x: 665, y: 315 }, { x: 800, y: 350 }, { x: 890, y: 420 }, { x: 915, y: 502 },
      { x: 870, y: 585 }, { x: 748, y: 635 }, { x: 575, y: 644 }, { x: 430, y: 615 },
      { x: 330, y: 548 }, { x: 285, y: 490 },
    ], dx, dy), { color: 'green', fill: 'semi', size: 'xl', closed: true }), 1, '大形：身体', 520),
    withStep(drawShape(shifted([
      { x: 300, y: 462 }, { x: 205, y: 420 }, { x: 120, y: 375 }, { x: 68, y: 342 },
      { x: 100, y: 405 }, { x: 178, y: 468 }, { x: 264, y: 512 }, { x: 332, y: 520 },
    ], dx, dy), { color: 'green', fill: 'semi', size: 'xl', closed: true }), 1, '大形：尾巴', 420),
    withStep(drawShape(shifted([
      { x: 880, y: 416 }, { x: 942, y: 332 }, { x: 1038, y: 280 }, { x: 1132, y: 286 },
      { x: 1215, y: 342 }, { x: 1242, y: 438 }, { x: 1208, y: 515 }, { x: 1110, y: 554 },
      { x: 1000, y: 540 }, { x: 920, y: 490 },
    ], dx, dy), { color: 'green', fill: 'semi', size: 'xl', closed: true }), 1, '大形：头部', 460),

    withStep(drawShape(shifted([
      { x: 840, y: 372 }, { x: 895, y: 322 }, { x: 964, y: 318 }, { x: 1005, y: 358 },
      { x: 990, y: 432 }, { x: 930, y: 472 }, { x: 872, y: 440 },
    ], dx, dy), { color: 'green', fill: 'semi', size: 'xl', closed: true }), 2, '局部：脖子', 340),
    withStep(drawShape(shifted([
      { x: 438, y: 610 }, { x: 474, y: 598 }, { x: 505, y: 620 }, { x: 520, y: 705 },
      { x: 493, y: 774 }, { x: 438, y: 775 }, { x: 414, y: 708 },
    ], dx, dy), { color: 'green', fill: 'semi', size: 'xl', closed: true }), 2, '局部：腿脚', 300),
    withStep(drawShape(shifted([
      { x: 612, y: 628 }, { x: 650, y: 610 }, { x: 688, y: 638 }, { x: 697, y: 720 },
      { x: 670, y: 780 }, { x: 610, y: 780 }, { x: 592, y: 714 },
    ], dx, dy), { color: 'green', fill: 'semi', size: 'xl', closed: true }), 2, '局部：腿脚', 260),
    withStep(drawShape(shifted([
      { x: 776, y: 610 }, { x: 832, y: 608 }, { x: 850, y: 690 }, { x: 878, y: 744 },
      { x: 836, y: 776 }, { x: 770, y: 748 }, { x: 758, y: 666 },
    ], dx, dy), { color: 'green', fill: 'semi', size: 'xl', closed: true }), 2, '局部：腿脚', 260),
    withStep(drawShape(shifted([
      { x: 978, y: 560 }, { x: 1030, y: 552 }, { x: 1052, y: 622 }, { x: 1035, y: 694 },
      { x: 972, y: 700 }, { x: 948, y: 626 },
    ], dx, dy), { color: 'green', fill: 'semi', size: 'xl', closed: true }), 2, '局部：腿脚', 260),
    withStep(drawShape(shifted([
      { x: 400, y: 760 }, { x: 462, y: 738 }, { x: 545, y: 750 }, { x: 580, y: 778 },
      { x: 545, y: 804 }, { x: 430, y: 800 }, { x: 382, y: 782 },
    ], dx, dy), { color: 'green', fill: 'semi', size: 'xl', closed: true }), 2, '局部：脚掌', 240),
    withStep(drawShape(shifted([
      { x: 588, y: 774 }, { x: 666, y: 750 }, { x: 748, y: 765 }, { x: 778, y: 792 },
      { x: 730, y: 820 }, { x: 620, y: 812 }, { x: 566, y: 794 },
    ], dx, dy), { color: 'green', fill: 'semi', size: 'xl', closed: true }), 2, '局部：脚掌', 220),
    withStep(drawShape(shifted([
      { x: 762, y: 756 }, { x: 848, y: 736 }, { x: 934, y: 748 }, { x: 964, y: 776 },
      { x: 920, y: 805 }, { x: 800, y: 800 }, { x: 744, y: 780 },
    ], dx, dy), { color: 'green', fill: 'semi', size: 'xl', closed: true }), 2, '局部：脚掌', 220),
    withStep(drawShape(shifted([
      { x: 930, y: 706 }, { x: 1016, y: 688 }, { x: 1100, y: 710 }, { x: 1124, y: 744 },
      { x: 1068, y: 772 }, { x: 965, y: 762 }, { x: 914, y: 738 },
    ], dx, dy), { color: 'green', fill: 'semi', size: 'xl', closed: true }), 2, '局部：脚掌', 220),

    ...[
      [[398, 328], [432, 224], [478, 338]],
      [[508, 306], [560, 185], [612, 318]],
      [[632, 300], [692, 188], [742, 326]],
      [[752, 328], [825, 218], [852, 370]],
      [[862, 372], [936, 252], [960, 420]],
    ].map((triangle, index) => withStep(drawShape(
      shifted(triangle.map(([px, py]) => ({ x: px, y: py })), dx, dy),
      { color: 'orange', fill: 'semi', size: 'xl', closed: true }
    ), 3, '装饰：背刺', index === 0 ? 420 : 230)),
    withStep(drawShape(shifted([
      { x: 1072, y: 330 }, { x: 1094, y: 312 }, { x: 1123, y: 318 }, { x: 1138, y: 342 },
      { x: 1122, y: 368 }, { x: 1090, y: 366 },
    ], dx, dy), { color: 'black', fill: 'semi', size: 'l', closed: true }), 3, '装饰：表情', 300),
    withStep(drawShape(shifted([
      { x: 1088, y: 322 }, { x: 1106, y: 316 }, { x: 1120, y: 326 }, { x: 1112, y: 344 },
      { x: 1094, y: 344 },
    ], dx, dy), { color: 'grey', fill: 'semi', size: 'm', closed: true }), 3, '装饰：眼神', 220),
    withStep(lineShape(shifted([
      { x: 1040, y: 404 }, { x: 1108, y: 426 }, { x: 1188, y: 410 }, { x: 1228, y: 378 },
    ], dx, dy), { color: 'black', size: 'xl' }), 3, '装饰：嘴巴', 260),
    withStep(lineShape(shifted([
      { x: 1002, y: 508 }, { x: 1046, y: 552 }, { x: 1110, y: 566 }, { x: 1170, y: 548 },
    ], dx, dy), { color: 'black', size: 'l' }), 3, '装饰：笑纹', 220),

    withStep(lineShape(shifted([
      { x: 88, y: 354 }, { x: 174, y: 436 }, { x: 295, y: 506 }, { x: 392, y: 596 },
      { x: 560, y: 646 }, { x: 735, y: 625 }, { x: 876, y: 560 }, { x: 1010, y: 548 },
      { x: 1155, y: 562 }, { x: 1240, y: 472 },
    ], dx, dy), { color: 'black', size: 'l' }), 4, '描边：压轮廓', 500),
    withStep(lineShape(shifted([
      { x: 336, y: 470 }, { x: 430, y: 365 }, { x: 560, y: 328 }, { x: 704, y: 345 },
      { x: 834, y: 420 }, { x: 910, y: 515 },
    ], dx, dy), { color: 'black', size: 'l' }), 4, '描边：身体曲线', 320),
    withStep(lineShape(shifted([
      { x: 928, y: 408 }, { x: 958, y: 330 }, { x: 1050, y: 286 }, { x: 1138, y: 300 },
      { x: 1218, y: 360 }, { x: 1238, y: 438 },
    ], dx, dy), { color: 'black', size: 'l' }), 4, '描边：头部曲线', 320),

    withStep(drawShape(shifted([
      { x: 405, y: 498 }, { x: 500, y: 455 }, { x: 645, y: 448 }, { x: 772, y: 486 },
      { x: 824, y: 535 }, { x: 735, y: 590 }, { x: 570, y: 604 }, { x: 444, y: 570 },
    ], dx, dy), { color: 'yellow', fill: 'semi', size: 'l', closed: true }), 5, '阴影高光：腹部', 360),
    withStep(drawShape(shifted([
      { x: 1010, y: 385 }, { x: 1100, y: 356 }, { x: 1195, y: 392 }, { x: 1190, y: 447 },
      { x: 1112, y: 480 }, { x: 1025, y: 454 },
    ], dx, dy), { color: 'yellow', fill: 'semi', size: 'l', closed: true }), 5, '阴影高光：脸部', 280),
    withStep(lineShape(shifted([
      { x: 432, y: 516 }, { x: 552, y: 470 }, { x: 704, y: 470 }, { x: 816, y: 526 },
    ], dx, dy), { color: 'orange', size: 'l' }), 5, '阴影高光：暖色反光', 240),
    withStep(lineShape(shifted([
      { x: 1032, y: 430 }, { x: 1090, y: 398 }, { x: 1162, y: 402 },
    ], dx, dy), { color: 'orange', size: 'm' }), 5, '阴影高光：脸部反光', 220),
    withStep(drawShape(shifted([
      { x: 600, y: 512 }, { x: 608, y: 505 }, { x: 618, y: 512 }, { x: 612, y: 522 },
    ], dx, dy), { color: 'yellow', fill: 'semi', size: 'm', closed: true }), 5, '阴影高光：光点', 160),
    withStep(drawShape(shifted([
      { x: 724, y: 530 }, { x: 732, y: 522 }, { x: 742, y: 530 }, { x: 735, y: 540 },
    ], dx, dy), { color: 'yellow', fill: 'semi', size: 'm', closed: true }), 5, '阴影高光：光点', 160),
    withStep(drawShape(shifted([
      { x: 316, y: 844 }, { x: 468, y: 818 }, { x: 690, y: 810 }, { x: 910, y: 820 },
      { x: 1094, y: 846 }, { x: 1004, y: 888 }, { x: 710, y: 904 }, { x: 422, y: 888 },
    ], dx, dy), { color: 'grey', fill: 'semi', size: 'l', closed: true }), 5, 'shade: ground shadow', 280),
    withStep(drawShape(shifted([
      { x: 338, y: 548 }, { x: 456, y: 604 }, { x: 620, y: 634 }, { x: 782, y: 612 },
      { x: 876, y: 566 }, { x: 834, y: 628 }, { x: 716, y: 666 }, { x: 548, y: 664 },
      { x: 398, y: 620 },
    ], dx, dy), { color: 'green', fill: 'semi', size: 'l', closed: true }), 5, 'shade: lower body', 280),
    withStep(lineShape(shifted([
      { x: 410, y: 414 }, { x: 520, y: 374 }, { x: 666, y: 368 }, { x: 816, y: 420 },
    ], dx, dy), { color: 'yellow', size: 'xl' }), 5, 'highlight: back shine', 220),
    withStep(lineShape(shifted([
      { x: 1028, y: 414 }, { x: 1090, y: 390 }, { x: 1168, y: 396 },
    ], dx, dy), { color: 'yellow', size: 'l' }), 5, 'highlight: face shine', 220),
    withStep({ type: 'zoomToFit' }, 6, '完成：适配全图', 300),
  ]
  return commands
}

function buildNativeDrawingPlan(prompt, replaceCanvas) {
  return buildDinosaurDrawingPlan(prompt, replaceCanvas)
}

function buildProblemImagePlan(replaceCanvas) {
  const img = problemImage
  const x = img ? Math.round(img.x + img.displayW + 86) : 900
  const y = img ? Math.round(img.y + 24) : 120
  const belowY = img ? Math.round(img.y + img.displayH + 56) : 520
  const commands = [
    { step: 0, stepTitle: zh('读题'), type: 'createText', x: img?.x ?? 80, y: Math.max(28, (img?.y ?? 92) - 48), text: zh('先读题：圈出条件和要求'), color: 'violet', size: 'l' },
    { step: 1, stepTitle: zh('标注题干'), type: 'createHighlight', x: (img?.x ?? 80) + 24, y: (img?.y ?? 92) + 24, w: Math.min(280, Math.max(180, (img?.displayW ?? 520) - 48)), h: 70, color: 'yellow', opacity: 0.18 },
    { step: 1, stepTitle: zh('标注题干'), type: 'createArrow', x: (img?.x ?? 80) + Math.min(340, (img?.displayW ?? 520) * 0.55), y: (img?.y ?? 92) + 58, endX: x - 18, endY: y + 42, color: 'violet' },
    { step: 1, stepTitle: zh('标注题干'), type: 'createNote', x, y, text: zh('这里通常是题目给出的条件。\n接入 OCR/VLM 后，AI 会自动识别题干。'), color: 'yellow' },
    { step: 2, stepTitle: zh('写过程'), type: 'createText', x: img?.x ?? 80, y: belowY, text: zh('解题过程'), color: 'violet', size: 'l' },
    { step: 2, stepTitle: zh('写过程'), type: 'createNote', x: img?.x ?? 80, y: belowY + 62, text: zh('1. 把已知条件写出来\n2. 判断要用的知识点\n3. 代入计算或推理\n4. 写出答案并检查单位'), color: 'green' },
    { step: 3, stepTitle: zh('全图'), type: 'zoomToFit' },
  ]
  return delayed(replaceCanvas ? commands : commands, 0, 520)
}

function buildChargedRingFieldPlan(replaceCanvas) {
  const p = placement(replaceCanvas)
  const x = p.x
  const y = p.y
  const ringX = x + 90
  const ringY = y + 110
  const axisY = ringY + 120
  const formulaX = x + 690
  const plotX = x + 520
  const plotY = y + 430
  const plotW = 520
  const plotH = 250
  const curve = []
  for (let i = 0; i <= 72; i += 1) {
    const t = i / 72
    const xv = 3.2 * t
    const ev = xv / Math.pow(xv * xv + 1, 1.5)
    const normalized = ev / 0.3849
    curve.push({ x: plotX + 56 + t * (plotW - 92), y: plotY + plotH - 46 - normalized * (plotH - 96) })
  }
  const maxT = (1 / Math.sqrt(2)) / 3.2
  const maxPoint = { x: plotX + 56 + maxT * (plotW - 92), y: plotY + plotH - 46 - (0.3849 / 0.3849) * (plotH - 96) }
  const commands = [
    { step: 0, stepTitle: 'Read problem', type: 'createText', x, y, text: 'Charged ring field: teacher-style visual solution', color: 'violet', size: 'xl' },
    { step: 0, stepTitle: 'Read problem', type: 'createNote', x, y: y + 62, text: 'Goal: explain field E(x) and potential V(x) on the axis of a uniformly charged ring.', color: 'yellow' },

    { step: 1, stepTitle: 'Draw charged ring', type: 'createGeo', x: ringX, y: ringY, w: 300, h: 230, geo: 'ellipse', color: 'blue' },
    { step: 1, stepTitle: 'Draw charged ring', type: 'createText', x: ringX + 105, y: ringY + 244, text: 'charged ring: Q, R', color: 'black', size: 'm' },
    { step: 1, stepTitle: 'Draw charged ring', type: 'createLine', points: [{ x: ringX + 150, y: axisY }, { x: ringX + 980, y: axisY }], color: 'black', size: 'm' },
    { step: 1, stepTitle: 'Draw charged ring', type: 'createText', x: ringX + 760, y: axisY - 38, text: 'axis x', color: 'black', size: 'm' },
    { step: 1, stepTitle: 'Draw charged ring', type: 'createLine', points: [{ x: ringX + 150, y: axisY }, { x: ringX + 255, y: ringY + 54 }], color: 'black', size: 'm' },
    { step: 1, stepTitle: 'Draw charged ring', type: 'createText', x: ringX + 250, y: ringY + 70, text: 'R', color: 'black', size: 'm' },
    { step: 1, stepTitle: 'Draw charged ring', type: 'createGeo', x: ringX + 622, y: axisY - 11, w: 22, h: 22, geo: 'ellipse', color: 'black' },
    { step: 1, stepTitle: 'Draw charged ring', type: 'createText', x: ringX + 602, y: axisY - 52, text: 'P(x)', color: 'black', size: 'l' },
    { step: 1, stepTitle: 'Draw charged ring', type: 'createArrow', x: ringX + 650, y: axisY, endX: ringX + 970, endY: axisY, color: 'red' },

    { step: 2, stepTitle: 'Write formulas', type: 'createFormula', x: formulaX, y: y + 96, text: 'E(x) = kQx / (x^2 + R^2)^(3/2)', color: 'red', size: 'l' },
    { step: 2, stepTitle: 'Write formulas', type: 'createFormula', x: formulaX, y: y + 168, text: 'V(x) = kQ / sqrt(x^2 + R^2)', color: 'black', size: 'l' },
    { step: 2, stepTitle: 'Write formulas', type: 'createNote', x: formulaX, y: y + 242, text: 'Reason: horizontal components add on the axis; transverse components cancel by symmetry.', color: 'green' },

    {
      step: 3,
      stepTitle: 'Python plot',
      type: 'createPythonPlot',
      title: 'E(x) = x / (x^2 + 1)^(3/2)',
      expression: 'x/(x^2+1)^(3/2)',
      xMin: 0,
      xMax: 3.5,
      samples: 600,
      xLabel: 'x/R',
      yLabel: 'normalized E',
      color: '#dc2626',
      x: plotX,
      y: plotY,
      w: 560,
      h: 360,
      markers: [{ x: 0.70710678, label: 'x=R/sqrt(2)', color: '#7c3aed' }],
      notes: '这块是独立 Python 绘图区：用 Matplotlib 计算并绘制曲线，用来说明 E(x) 先增大后减小，最大值在 x=R/sqrt(2)。',
    },
    { step: 4, stepTitle: 'Editable sketch', type: 'createGeo', x: plotX, y: plotY + 500, w: plotW, h: plotH, geo: 'rectangle', color: 'grey' },
    { step: 4, stepTitle: 'Editable sketch', type: 'createLine', points: [{ x: plotX + 56, y: plotY + 500 + plotH - 46 }, { x: plotX + plotW - 28, y: plotY + 500 + plotH - 46 }], color: 'black', size: 'm' },
    { step: 4, stepTitle: 'Editable sketch', type: 'createLine', points: [{ x: plotX + 56, y: plotY + 500 + plotH - 46 }, { x: plotX + 56, y: plotY + 500 + 26 }], color: 'black', size: 'm' },
    { step: 4, stepTitle: 'Editable sketch', type: 'createText', x: plotX + 72, y: plotY + 500 + 18, text: 'editable sketch of E(x)', color: 'black', size: 'm' },
    { step: 4, stepTitle: 'Editable sketch', type: 'createDraw', points: curve.map((point) => ({ x: point.x, y: point.y + 500 })), color: 'red', size: 'l' },
    { step: 4, stepTitle: 'Editable sketch', type: 'createLine', points: [{ x: maxPoint.x, y: maxPoint.y + 500 }, { x: maxPoint.x, y: plotY + 500 + plotH - 46 }], color: 'grey', size: 's', dash: 'dashed' },
    { step: 4, stepTitle: 'Editable sketch', type: 'createGeo', x: maxPoint.x - 8, y: maxPoint.y + 500 - 8, w: 16, h: 16, geo: 'ellipse', color: 'red' },
    { step: 4, stepTitle: 'Editable sketch', type: 'createFormula', x: maxPoint.x + 18, y: maxPoint.y + 500 - 28, text: 'max at x = R / sqrt(2)', color: 'black', size: 'm' },

    { step: 5, stepTitle: 'Conclusion', type: 'createNote', x: x + 40, y: y + 1030, text: 'Takeaway: E starts at 0, rises to a maximum at R/sqrt(2), then decays toward 0 as x grows.', color: 'yellow' },
    { step: 6, stepTitle: 'Fit', type: 'zoomToFit' },
  ]
  return delayed(commands, 0, 520)
}

function buildWheelDistancePlan(replaceCanvas) {
  const p = placement(replaceCanvas)
  const x = p.x
  const y = p.y
  const imgX = x
  const imgY = y + 36
  const noteX = x + 610
  const workY = y + 430
  const commands = [
    { step: 0, stepTitle: zh('读题'), type: 'createText', x, y, text: zh('题目：圆沿直线无滑动滚动'), color: 'violet', size: 'xl' },
    { step: 0, stepTitle: zh('读题'), type: 'createText', x, y: y + 58, text: zh('先抓两个条件：直径 10 cm，正好滚了 2 圈。'), color: 'black', size: 'm' },
    {
      step: 1,
      stepTitle: zh('放题图'),
      type: 'createImage',
      src: 'file:///C:/Users/23108/Pictures/Screenshots/%E5%B1%8F%E5%B9%95%E6%88%AA%E5%9B%BE%202026-06-15%20235150.png',
      x: imgX,
      y: imgY,
      w: 560,
      h: 180,
      naturalW: 560,
      naturalH: 180,
      name: 'screen-shot-2026-06-15-235150.png',
      mimeType: 'image/png',
      altText: '滚动距离题目截图',
      background: true,
    },
    { step: 1, stepTitle: zh('放题图'), type: 'createHighlight', x: imgX + 8, y: imgY + 26, w: 150, h: 56, color: 'yellow', opacity: 0.18 },
    { step: 1, stepTitle: zh('放题图'), type: 'createArrow', x: imgX + 110, y: imgY + 84, endX: noteX - 26, endY: imgY + 86, color: 'violet' },
    { step: 1, stepTitle: zh('放题图'), type: 'createNote', x: noteX, y: imgY + 28, text: zh('这个图里最重要的是：\n圆从 1 到 2，滚动了 2 圈。'), color: 'yellow' },
    { step: 2, stepTitle: zh('找关系'), type: 'createText', x, y: workY, text: zh('第 1 步：先求一圈滚多远'), color: 'violet', size: 'l' },
    { step: 2, stepTitle: zh('找关系'), type: 'createHighlight', x: x + 42, y: workY + 44, w: 420, h: 78, color: 'yellow', opacity: 0.22 },
    { step: 2, stepTitle: zh('找关系'), type: 'createText', x: x + 60, y: workY + 58, text: '一圈距离 = 圆周长 = πd', color: 'black', size: 'xl' },
    { step: 2, stepTitle: zh('找关系'), type: 'createText', x: x + 60, y: workY + 122, text: 'd = 10 cm', color: 'black', size: 'l' },
    { step: 3, stepTitle: zh('计算'), type: 'createText', x, y: workY + 200, text: zh('第 2 步：2 圈就是两倍'), color: 'violet', size: 'l' },
    { step: 3, stepTitle: zh('计算'), type: 'createText', x: x + 60, y: workY + 262, text: '一圈 = 3.14 × 10 = 31.4 cm', color: 'black', size: 'l' },
    { step: 3, stepTitle: zh('计算'), type: 'createText', x: x + 60, y: workY + 322, text: '2 圈 = 31.4 × 2 = 62.8 cm', color: 'green', size: 'xl' },
    { step: 3, stepTitle: zh('计算'), type: 'createArrow', x: x + 430, y: workY + 300, endX: x + 560, endY: workY + 300, color: 'green' },
    { step: 3, stepTitle: zh('计算'), type: 'createNote', x: noteX, y: workY + 190, text: zh('答案很短，但思路要清楚：\n先求一圈，再乘 2。'), color: 'green' },
    { step: 4, stepTitle: zh('结论'), type: 'createNote', x: noteX, y: workY + 340, text: zh('A、B 的距离 = 62.8 cm\n因为滚动没有打滑，所以路程 = 圈数 × 圆周长。'), color: 'yellow' },
    { step: 5, stepTitle: zh('全图'), type: 'zoomToFit' },
  ]
  return delayed(commands, 0, 520)
}

function planCommands({ prompt, mode, replaceCanvas }) {
  const text = normalizeText(prompt)
  const lower = text.toLowerCase()
  const isWheelDistance = contains(lower, ['屏幕截图', '滚了 2 圈', '滚了2圈', 'a、b', '圆周长', '无滑动滚动', '直径10', '10cm'])
  const isFaraday = contains(lower, ['faraday', 'electromagnetic induction', '法拉第', '电磁感应', '感应电动势'])
  const isPythagorean = contains(lower, ['\u52fe\u80a1', 'pythagorean'])
  const isChargedRing = contains(lower, ['charged ring', 'electric field ring', 'ring field', '带电环', '电场', 'e(x)', 'r/sqrt(2)'])
  const imagePromptHints = ['image', 'picture', 'photo', '题图', '题目图', '图片', '截图', '批注', '讲解', '解题', '分析', '标注', '作业', '题目', '这道题']
  const isProblemImage = Boolean(problemImage && contains(lower, imagePromptHints))
  const commands = isChargedRing ? buildChargedRingFieldPlan(replaceCanvas) : isWheelDistance ? buildWheelDistancePlan(replaceCanvas) : isFaraday ? buildFaradayPlan(replaceCanvas) : isPythagorean ? buildPythagoreanPlan(replaceCanvas) : isProblemImage ? buildProblemImagePlan(replaceCanvas) : buildSimplePlan(text, mode, replaceCanvas)
  const effectiveReplaceCanvas = isProblemImage ? false : replaceCanvas
  const finalCommands = effectiveReplaceCanvas ? [{ type: 'clear' }, ...commands] : commands
  return {
    id: makePlanId(),
    mode: isChargedRing || isWheelDistance || isFaraday || isPythagorean ? 'lesson' : (mode || 'diagram'),
    replaceCanvas: effectiveReplaceCanvas,
    summary: `${effectiveReplaceCanvas ? '\u66ff\u6362' : '\u8ffd\u52a0'}\u751f\u6210\u9010\u6b65\u8bb2\u89e3\uff0c\u5171 ${finalCommands.length} \u6761\u547d\u4ee4\u3002`,
    qualityChecks: [
      '\u4f7f\u7528\u9010\u6761 delay\uff0c\u6a21\u62df\u8001\u5e08\u677f\u4e66',
      '\u4f18\u5148\u753b\u56fe\u548c\u6807\u6ce8\uff0c\u51cf\u5c11\u6846\u67b6\u56fe',
      '\u6700\u540e zoomToFit\uff0c\u4fdd\u8bc1\u6574\u4f53\u53ef\u89c1',
    ],
    commands: finalCommands,
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'gotim-drawer-control', clients: clients.size }))
app.get('/api/capabilities', (_req, res) => res.json(capabilities))

app.post('/api/plan', (req, res) => {
  const prompt = normalizeText(req.body?.prompt)
  if (!prompt) return res.status(400).json({ ok: false, error: 'Missing prompt' })
  const replaceCanvas = Boolean(req.body?.replaceCanvas)
  const mode = req.body?.mode ? String(req.body.mode) : undefined
  const lower = prompt.toLowerCase()
  const drawingHints = ['画', '绘', '画画', '绘画', '绘制', '插画', '卡通', '恐龙', 'dinosaur', 'sketch', 'draw']
  const lessonHints = ['讲解', '解题', '题目', '法拉第', '勾股', 'pythagorean', 'faraday']
  const isNativeDrawingRequest = (mode === 'brainstorm' || contains(lower, drawingHints)) && !contains(lower, lessonHints)
  if (isNativeDrawingRequest) {
    const commands = buildNativeDrawingPlan(prompt, replaceCanvas)
    const finalCommands = replaceCanvas ? [{ type: 'clear' }, ...commands] : commands
    return res.json({
      ok: true,
      plan: {
        id: makePlanId(),
        mode: 'brainstorm',
        replaceCanvas,
        summary: `${replaceCanvas ? '替换' : '追加'}生成结构化原生绘画，共 ${finalCommands.length} 条命令。`,
        qualityChecks: [
          '分为大形、局部、装饰、描边、阴影/高光五个绘画阶段',
          '最终使用 createDraw/createLine/createText 等原生对象，不贴成品图片',
          '每个阶段带 delay，支持播放、重播、前进和后退',
          '最后 zoomToFit，保证整体可见',
        ],
        commands: finalCommands,
      },
    })
  }
  res.json({ ok: true, plan: planCommands({ prompt, mode, replaceCanvas }) })
})

app.post('/api/canvas/snapshot', (req, res) => {
  const input = req.body
  if (!input || !Array.isArray(input.shapes)) return res.status(400).json({ ok: false, error: 'Body must include a shapes array' })
  canvasSnapshot = {
    pageId: input.pageId ?? null,
    shapeCount: Number(input.shapeCount ?? input.shapes.length),
    bounds: input.bounds ?? null,
    shapes: enrichSnapshotShapes(input.shapes),
    updatedAt: input.updatedAt ?? now(),
  }
  res.json({ ok: true, shapeCount: canvasSnapshot.shapeCount, updatedAt: canvasSnapshot.updatedAt })
})

app.get('/api/canvas/shapes', (_req, res) => res.json({ ok: true, pageId: canvasSnapshot.pageId, shapeCount: canvasSnapshot.shapeCount, updatedAt: canvasSnapshot.updatedAt, shapes: canvasSnapshot.shapes }))
app.get('/api/canvas/bounds', (_req, res) => res.json({ ok: true, pageId: canvasSnapshot.pageId, shapeCount: canvasSnapshot.shapeCount, updatedAt: canvasSnapshot.updatedAt, bounds: canvasSnapshot.bounds }))

app.post('/api/problem-image', (req, res) => {
  const input = req.body
  if (!input || !input.shapeId) return res.status(400).json({ ok: false, error: 'Body must include problem image metadata' })
  problemImage = {
    id: input.id ?? `problem_${Date.now()}`,
    shapeId: input.shapeId,
    assetId: input.assetId ?? null,
    name: input.name ?? 'problem-image',
    mimeType: input.mimeType ?? 'image/png',
    w: Number(input.w ?? 0),
    h: Number(input.h ?? 0),
    x: Number(input.x ?? 0),
    y: Number(input.y ?? 0),
    displayW: Number(input.displayW ?? input.w ?? 0),
    displayH: Number(input.displayH ?? input.h ?? 0),
    src: input.src ?? null,
    createdAt: input.createdAt ?? now(),
    updatedAt: now(),
    analysis: {
      status: 'pending_vision_integration',
      note: 'Image is available as a canvas background. OCR/VLM understanding is the next integration point.',
    },
  }
  res.json({ ok: true, problemImage })
})

app.get('/api/problem-image', (_req, res) => {
  res.json({ ok: true, problemImage })
})

app.post('/api/python/plot', async (req, res) => {
  const expression = normalizeText(req.body?.expression)
  if (!expression) return res.status(400).json({ ok: false, error: 'Missing expression' })
  try {
    const result = await runPythonPlot({
      expression,
      title: normalizeText(req.body?.title) || 'Python plot',
      xMin: req.body?.xMin,
      xMax: req.body?.xMax,
      samples: req.body?.samples,
      xLabel: req.body?.xLabel,
      yLabel: req.body?.yLabel,
      color: req.body?.color,
      markers: req.body?.markers,
    })
    res.json(result)
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
  clients.add(res)
  req.on('close', () => clients.delete(res))
})

app.post('/api/commands', (req, res) => {
  const command = { id: ++commandId, batchId: req.body?.batchId ?? makeBatchId(), ...req.body }
  if (!command.type) return res.status(400).json({ ok: false, error: 'Missing command.type' })
  const deliveredTo = broadcast(command)
  addHistory(command, deliveredTo)
  res.json({ ok: true, command, deliveredTo })
})

app.post('/api/commands/batch', (req, res) => {
  const input = Array.isArray(req.body) ? req.body : req.body?.commands
  if (!Array.isArray(input) || input.length === 0) return res.status(400).json({ ok: false, error: 'Body must be a non-empty command array or {"commands":[...]}' })
  if (input.some((command) => !command?.type)) return res.status(400).json({ ok: false, error: 'Every command must include type' })
  const nextBatchId = req.body?.batchId ?? makeBatchId()
  const batchName = req.body?.batchName ?? null
  const commands = input.map((command, index) => ({ id: ++commandId, batchId: nextBatchId, batchName, batchIndex: index, ...command }))
  lastBatchCommands = commands
  for (const command of commands) addHistory(command, broadcast(command))
  res.json({ ok: true, batchId: nextBatchId, batchName, count: commands.length, commands, deliveredTo: clients.size })
})

app.post('/api/commands/ack', (req, res) => {
  const entry = findHistoryEntry(req.body?.id)
  if (!entry) return res.status(404).json({ ok: false, error: 'Unknown command id' })
  entry.status = req.body?.ok === false ? 'failed' : 'executed'
  entry.acknowledgedAt = now()
  entry.result = req.body?.result ?? null
  if (req.body?.error) entry.result = { ...(entry.result ?? {}), error: req.body.error }
  res.json({ ok: true, entry })
})

app.get('/api/commands/history', (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 80)))
  const batch = req.query.batchId ? String(req.query.batchId) : null
  const entries = commandHistory.filter((entry) => !batch || entry.batchId === batch).slice(0, limit)
  res.json({ ok: true, count: entries.length, entries })
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(__dirname, '../public')
const dist = path.resolve(__dirname, '../dist')
app.use(express.static(publicDir))
app.use(express.static(dist))
app.get('*path', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
app.listen(port, () => console.log(`GOTIM control API: http://localhost:${port}/api/capabilities`))
