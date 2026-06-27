import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BrainCircuit,
  Brush,
  Check,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Gamepad2,
  GraduationCap,
  History,
  ImagePlus,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Tldraw } from 'tldraw'
import { createCanvasSnapshot, postCanvasSnapshot } from './canvasSnapshot'
import { createScene, DrawerCommand, executeCommand, SceneName } from './commands'
import {
  chooseGomokuAiMove,
  cloneGomokuBoard,
  createEmptyGomokuBoard,
  findGomokuWin,
  GOMOKU_SIZE,
  GomokuBoard,
  GomokuPoint,
  GomokuStone,
  GomokuWin,
  isGomokuFull,
} from './gomoku'
import { createProblemImage, postProblemImage, ProblemImageInfo } from './problemImage'
import {
  createTaskSession,
  loadTaskWorkspace,
  makeSessionTitle,
  saveTaskWorkspace,
  TaskSession,
  TaskWorkspace,
} from './taskSessions'

type Editor = any
type StepCommand = DrawerCommand & { id?: number; delay?: number; step?: number; stepTitle?: string }

type CommandHistoryEntry = {
  id: number
  batchId?: string | null
  batchName?: string | null
  type: string
  command?: StepCommand
  status: 'pending' | 'executed' | 'failed' | 'undelivered'
  deliveredTo: number
  createdAt: string
  acknowledgedAt?: string | null
}

type CanvasPlan = {
  id: string
  mode: string
  replaceCanvas: boolean
  summary: string
  qualityChecks: string[]
  commands: StepCommand[]
}

type WorkingStage = {
  label: string
  detail: string
}

type AnimatedBall = {
  id: string
  sessionId: string
  x: number
  y: number
  radius: number
  orbitRadius: number
  color: string
  duration: number
  label?: string
}

type PythonPlotResponse = {
  ok: boolean
  image?: {
    src: string
    w: number
    h: number
    mimeType: string
    title?: string
  }
  error?: string
}

const workingStages: Record<SceneName, WorkingStage[]> = {
  lesson: [
    { label: 'Reading problem', detail: 'Finding known values, target, and hidden constraints.' },
    { label: 'Planning board', detail: 'Splitting original question, clean diagram, formulas, and answer.' },
    { label: 'Computing visuals', detail: 'Preparing exact points, curves, labels, and highlights.' },
    { label: 'Checking clarity', detail: 'Looking for overlap, missing labels, and crowded formulas.' },
  ],
  brainstorm: [
    { label: 'Blocking silhouette', detail: 'Choosing the big readable shape first.' },
    { label: 'Arranging parts', detail: 'Placing local parts, decoration, and focus points.' },
    { label: 'Planning strokes', detail: 'Preparing editable draw paths and outlines.' },
    { label: 'Polishing', detail: 'Adding shadows, highlights, and final framing.' },
  ],
  chess: [
    { label: 'Reading board', detail: 'Checking current pieces, turn order, and legal moves.' },
    { label: 'Searching tactics', detail: 'Looking for attack, defense, and forcing moves.' },
    { label: 'Explaining choice', detail: 'Preparing arrows, candidate points, and review notes.' },
    { label: 'Updating board', detail: 'Applying the move and syncing canvas explanation.' },
  ],
  presentation: [
    { label: 'Structuring story', detail: 'Turning the topic into a clear visual sequence.' },
    { label: 'Planning sections', detail: 'Balancing title, diagram, evidence, and conclusion.' },
    { label: 'Preparing playback', detail: 'Grouping commands into clean replayable steps.' },
    { label: 'Final check', detail: 'Making sure the full slide fits the viewport.' },
  ],
}

const modes: Array<{ id: SceneName; label: string; description: string; icon: typeof GraduationCap }> = [
  { id: 'lesson', label: '讲题', description: '一步一步讲解', icon: GraduationCap },
  { id: 'brainstorm', label: '绘画', description: '画图、描边和信息图', icon: Brush },
  { id: 'chess', label: '下棋', description: '棋盘、复盘和分析', icon: Gamepad2 },
  { id: 'presentation', label: '演示', description: '像课件一样播放', icon: GraduationCap },
]

const prompts: Record<SceneName, string[]> = {
  lesson: [
    '讲解勾股定理，先画真正的直角三角形，再一步一步写公式',
    '讲解法拉第电磁感应定律，像老师一样一边画图一边讲',
    '上传题目图后，在图上批注并在下方写解题过程',
  ],
  brainstorm: [
    '画一只精美恐龙，并且能一步一步播放绘制过程',
    '画一个 AI 学习产品的信息图',
    '把一个想法整理成视觉草图',
  ],
  chess: ['创建棋盘并分析中心控制', '演示一个三步战术', '把当前局面整理成复盘笔记'],
  presentation: ['生成一个产品介绍页面', '做一页项目路线图', '把想法整理成演示结构'],
}

const GOMOKU_ORIGIN = { x: 86, y: 118 }
const GOMOKU_CELL = 34
const GOMOKU_STONE = 25
const GOMOKU_STAR_POINTS: GomokuPoint[] = [
  { row: 3, col: 3 },
  { row: 3, col: 11 },
  { row: 7, col: 7 },
  { row: 11, col: 3 },
  { row: 11, col: 11 },
]

declare global {
  interface Window {
    gotimDrawer?: { execute: (command: DrawerCommand) => void; capabilities: () => string[] }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function commandStep(command: StepCommand) {
  return typeof command.step === 'number' ? command.step : null
}

function uniqueSteps(commands: StepCommand[]) {
  return Array.from(new Set(commands.map(commandStep).filter((step): step is number => step !== null))).sort((a, b) => a - b)
}

function stepTitle(commands: StepCommand[], step: number) {
  return commands.find((command) => command.step === step)?.stepTitle ?? `第 ${step + 1} 步`
}

function loadWorkspaceSafe(): TaskWorkspace {
  try {
    return loadTaskWorkspace()
  } catch {
    const first = createTaskSession('lesson')
    return { sessions: [first], activeSessionId: first.id }
  }
}

async function acknowledgeCommand(id: number | undefined, result: unknown) {
  if (typeof id !== 'number') return
  await fetch('/api/commands/ack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ok: (result as any)?.ok !== false, result }),
  })
}

async function fetchCommandHistory(limit = 10): Promise<CommandHistoryEntry[]> {
  const response = await fetch(`/api/commands/history?limit=${limit}`)
  const data = await response.json()
  return Array.isArray(data.entries) ? data.entries : []
}

async function requestPlan(prompt: string, mode: SceneName, replaceCanvas: boolean): Promise<CanvasPlan> {
  const response = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, mode, replaceCanvas }),
  })
  const data = await response.json()
  if (!data.ok) throw new Error(data.error ?? 'Plan request failed')
  return data.plan
}

async function sendCommandBatch(plan: CanvasPlan) {
  const response = await fetch('/api/commands/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchName: plan.summary, commands: plan.commands }),
  })
  const data = await response.json()
  if (!data.ok) throw new Error(data.error ?? 'Command batch failed')
  return data
}

async function requestPythonPlot(command: Extract<StepCommand, { type: 'createPythonPlot' }>): Promise<PythonPlotResponse> {
  const response = await fetch('/api/python/plot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  return response.json()
}

function commandsFromLatestBatch(entries: CommandHistoryEntry[]): StepCommand[] {
  const latestBatchId = entries.find((entry) => entry.batchId)?.batchId
  if (!latestBatchId) return []
  return entries
    .filter((entry) => entry.batchId === latestBatchId)
    .map((entry) => entry.command)
    .filter((command): command is StepCommand => Boolean(command && commandStep(command) !== null))
    .sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0))
}

export function App() {
  const editorRef = useRef<Editor | null>(null)
  const snapshotTimerRef = useRef<number | null>(null)
  const historyTimerRef = useRef<number | null>(null)
  const disposeSnapshotListenerRef = useRef<(() => void) | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const queueRef = useRef(Promise.resolve())
  const playbackTokenRef = useRef(0)
  const thinkingShapeIdsRef = useRef<string[]>([])
  const initialWorkspaceRef = useRef<TaskWorkspace>(loadWorkspaceSafe())

  const [sessions, setSessions] = useState<TaskSession[]>(initialWorkspaceRef.current.sessions)
  const [activeSessionId, setActiveSessionId] = useState(initialWorkspaceRef.current.activeSessionId)
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0]

  const [mode, setMode] = useState<SceneName>(activeSession?.mode ?? 'lesson')
  const [prompt, setPrompt] = useState(activeSession?.prompt ?? '')
  const [panelOpen, setPanelOpen] = useState(true)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [workingStep, setWorkingStep] = useState(0)
  const [replaceCanvas, setReplaceCanvas] = useState(true)
  const [activity, setActivity] = useState('等待命令')
  const [history, setHistory] = useState<CommandHistoryEntry[]>([])
  const [plan, setPlan] = useState<CanvasPlan | null>(null)
  const [lessonCommands, setLessonCommands] = useState<StepCommand[]>(activeSession?.commands ?? [])
  const [lessonStep, setLessonStep] = useState(activeSession?.lessonStep ?? -1)
  const [playing, setPlaying] = useState(false)
  const [problemImage, setProblemImage] = useState<ProblemImageInfo | null>(activeSession?.problemImage ?? null)
  const [animatedBalls, setAnimatedBalls] = useState<AnimatedBall[]>([])
  const [gomokuBoard, setGomokuBoard] = useState<GomokuBoard>(() => createEmptyGomokuBoard())
  const [gomokuPending, setGomokuPending] = useState<GomokuPoint | null>(null)
  const [gomokuTurn, setGomokuTurn] = useState<GomokuStone>('human')
  const [gomokuStatus, setGomokuStatus] = useState('选择交叉点后点击“确定落子”。')
  const [gomokuWin, setGomokuWin] = useState<GomokuWin | null>(null)

  const sessionsRef = useRef(sessions)
  const activeSessionIdRef = useRef(activeSessionId)
  const editorSessionIdRef = useRef(activeSessionId)
  const modeRef = useRef(mode)

  const steps = useMemo(() => uniqueSteps(lessonCommands), [lessonCommands])
  const currentStepIndex = lessonStep < 0 ? -1 : steps.indexOf(lessonStep)
  const currentStepTitle = lessonStep >= 0 ? stepTitle(lessonCommands, lessonStep) : '尚未开始'
  const canControlLesson = lessonCommands.length > 0 && steps.length > 0
  const gomokuWinCells = useMemo(() => new Set((gomokuWin?.line ?? []).map((point) => `${point.row}:${point.col}`)), [gomokuWin])
  const activeWorkingStages = workingStages[mode]
  const activeWorkingStep = activeWorkingStages[workingStep % activeWorkingStages.length]
  const visibleAnimatedBalls = animatedBalls.filter((ball) => ball.sessionId === activeSessionId)

  const updateSession = (sessionId: string, patch: Partial<TaskSession>) => {
    setSessions((current) => current.map((session) => (
      session.id === sessionId
        ? { ...session, ...patch, updatedAt: new Date().toISOString() }
        : session
    )))
  }

  const updateActiveSession = (patch: Partial<TaskSession>) => {
    updateSession(activeSessionIdRef.current, patch)
  }

  const refreshHistory = () => {
    void fetchCommandHistory()
      .then(setHistory)
      .catch((error) => console.warn('[CommandHistory] Failed to fetch', error))
  }

  const hydrateLatestBatch = async () => {
    const entries = await fetchCommandHistory(80)
    setHistory(entries.slice(0, 10))
    const commands = commandsFromLatestBatch(entries)
    if (commands.length === 0) return
    const latestBatchId = commands[0]?.batchId
    const alreadyLoaded = lessonCommands.some((command) => command.batchId === latestBatchId)
    if (alreadyLoaded) return
    const editor = editorRef.current
    const emptyCanvas = !editor || editor.getCurrentPageShapeIds().size === 0
    if (lessonCommands.length > 0 && !emptyCanvas) return
    setLessonCommands(commands)
    setLessonStep(-1)
    const title = commands[0]?.batchName ?? commands[0]?.stepTitle ?? '历史画板任务'
    updateActiveSession({
      commands,
      prompt: title,
      title: makeSessionTitle(mode, title),
      lessonStep: -1,
    })
    if (editor && emptyCanvas) await renderCommands(commands, -1)
    setActivity(`已恢复最近任务：${title}`)
  }

  const scheduleHistoryRefresh = (delay = 300) => {
    if (historyTimerRef.current) window.clearTimeout(historyTimerRef.current)
    historyTimerRef.current = window.setTimeout(refreshHistory, delay)
  }

  const syncCanvasSnapshot = (delay = 160) => {
    if (snapshotTimerRef.current) window.clearTimeout(snapshotTimerRef.current)
    snapshotTimerRef.current = window.setTimeout(() => {
      if (!editorRef.current) return
      void postCanvasSnapshot(createCanvasSnapshot(editorRef.current)).catch((error) => {
        console.warn('[CanvasSnapshot] Failed to sync', error)
      })
    }, delay)
  }

  const waitForEditorSession = async (sessionId: string) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (editorRef.current && editorSessionIdRef.current === sessionId) return editorRef.current
      await sleep(40)
    }
    return editorRef.current
  }

  const runCommand = async (command: StepCommand, acknowledge = true) => {
    if (!editorRef.current) return
    const result = executeCommand(editorRef.current, command)
    if (acknowledge) await acknowledgeCommand(command.id, result)
    syncCanvasSnapshot()
    scheduleHistoryRefresh()
  }

  const runCanvasOnlyCommand = (command: StepCommand) => {
    if (!editorRef.current) return
    executeCommand(editorRef.current, command)
    syncCanvasSnapshot()
  }

  const createAnimatedBall = (command: Extract<StepCommand, { type: 'createAnimatedBall' }>) => {
    const sessionId = activeSessionIdRef.current
    const x = command.x ?? 360
    const y = command.y ?? 260
    const orbitRadius = command.orbitRadius ?? 105
    const radius = command.radius ?? 22
    const color = command.color ?? '#7f46e8'
    const duration = command.duration ?? 2600
    const label = command.label ?? 'Rotating ball'

    if (editorRef.current) {
      executeCommand(editorRef.current, { type: 'createText', x: x - 140, y: y - orbitRadius - 92, text: label, color: 'violet', size: 'xl' })
      executeCommand(editorRef.current, { type: 'createGeo', x: x - orbitRadius, y: y - orbitRadius, w: orbitRadius * 2, h: orbitRadius * 2, color: 'grey', geo: 'ellipse' })
      executeCommand(editorRef.current, { type: 'createText', x: x - 174, y: y + orbitRadius + 34, text: '动画层在轨道上持续旋转，画板对象仍可编辑。', color: 'grey', size: 'm' })
      syncCanvasSnapshot(0)
    }

    setAnimatedBalls((current) => [
      ...current.filter((ball) => ball.sessionId !== sessionId),
      { id: `ball_${Date.now()}`, sessionId, x, y, radius, orbitRadius, color, duration, label },
    ])
    setActivity(`已创建旋转小球：${label}`)
  }

  const createPythonPlot = async (command: Extract<StepCommand, { type: 'createPythonPlot' }>) => {
    const title = command.title ?? 'Python plot'
    const x = command.x ?? 760
    const y = command.y ?? 140
    const w = command.w ?? 560
    const h = command.h ?? 380
    setActivity(`Python 正在绘制：${title}`)

    const plot = await requestPythonPlot(command)
    if (!plot.ok || !plot.image?.src) {
      throw new Error(plot.error ?? 'Python plot failed')
    }

    const editor = editorRef.current
    if (!editor) return

    executeCommand(editor, { type: 'createGeo', x: x - 22, y: y - 56, w: w + 44, h: h + 142, color: 'violet', geo: 'rectangle' })
    executeCommand(editor, { type: 'createText', x, y: y - 42, text: `Python 绘图区：${title}`, color: 'violet', size: 'l' })
    executeCommand(editor, {
      type: 'createImage',
      src: plot.image.src,
      x,
      y,
      w,
      h,
      naturalW: plot.image.w,
      naturalH: plot.image.h,
      name: `${title}.png`,
      mimeType: plot.image.mimeType,
      altText: title,
    })
    if (command.notes) {
      executeCommand(editor, { type: 'createNote', x, y: y + h + 24, text: command.notes, color: 'green' })
    } else {
      executeCommand(editor, { type: 'createText', x, y: y + h + 26, text: '由后端 Python/Matplotlib 生成，用于函数图、物理曲线、极值和对比图。', color: 'grey', size: 's' })
    }
    syncCanvasSnapshot(0)
    setActivity(`已生成 Python 绘图区：${title}`)
  }

  const clearThinkingDraft = () => {
    const editor = editorRef.current
    if (!editor || thinkingShapeIdsRef.current.length === 0) return
    const existingIds = thinkingShapeIdsRef.current.filter((id) => editor.getShape(id as any))
    if (existingIds.length > 0) editor.deleteShapes(existingIds as any[])
    thinkingShapeIdsRef.current = []
    syncCanvasSnapshot(0)
  }

  const showThinkingDraft = (text: string) => {
    const editor = editorRef.current
    if (!editor) return
    clearThinkingDraft()

    const modeLabel = mode === 'lesson' ? 'Lesson' : mode === 'brainstorm' ? 'Drawing' : mode === 'chess' ? 'Board' : 'Presentation'
    const lines = mode === 'lesson'
      ? ['Read problem and target', 'Plan diagram and labels', 'Split replayable steps', 'Check text/shape overlap']
      : mode === 'brainstorm'
        ? ['Block big silhouette', 'Arrange parts and decoration', 'Plan outlines and shadows', 'Prepare drawing order']
        : mode === 'chess'
          ? ['Read board state', 'Search attack points', 'Check forced defenses', 'Prepare next move']
          : ['Structure topic', 'Plan page rhythm', 'Arrange visual hierarchy', 'Prepare presentation steps']

    const commands: StepCommand[] = [
      { type: 'createGeo', x: 88, y: 76, w: 430, h: 240, color: 'violet', geo: 'rectangle' },
      { type: 'createText', x: 116, y: 100, text: `${modeLabel} planning draft`, color: 'violet', size: 'l' },
      { type: 'createText', x: 116, y: 142, text: text.slice(0, 42), color: 'grey', size: 's' },
      ...lines.map((line, index) => ({
        type: 'createText' as const,
        x: 126,
        y: 184 + index * 30,
        text: `${index + 1}. ${line}`,
        color: index === 0 ? 'green' : 'black',
        size: 's',
      })),
    ]

    const createdIds: string[] = []
    for (const command of commands) {
      const result = executeCommand(editor, command)
      if (result.createdIds) createdIds.push(...result.createdIds)
    }
    thinkingShapeIdsRef.current = createdIds
    syncCanvasSnapshot(0)
  }

  const gomokuCanvasPoint = (point: GomokuPoint) => ({
    x: GOMOKU_ORIGIN.x + point.col * GOMOKU_CELL,
    y: GOMOKU_ORIGIN.y + point.row * GOMOKU_CELL,
  })

  const drawGomokuBoardOnCanvas = () => {
    if (!editorRef.current) return
    executeCommand(editorRef.current, { type: 'clear' })
    runCanvasOnlyCommand({ type: 'createText', x: 64, y: 42, text: '五子棋：点击棋盘落子，连成五子即胜', color: 'green', size: 'l' })

    const end = GOMOKU_ORIGIN.x + (GOMOKU_SIZE - 1) * GOMOKU_CELL
    for (let index = 0; index < GOMOKU_SIZE; index++) {
      const offset = index * GOMOKU_CELL
      runCanvasOnlyCommand({
        type: 'createLine',
        x: GOMOKU_ORIGIN.x,
        y: GOMOKU_ORIGIN.y + offset,
        endX: end,
        endY: GOMOKU_ORIGIN.y + offset,
        color: 'black',
        size: index === 0 || index === GOMOKU_SIZE - 1 ? 'm' : 's',
      })
      runCanvasOnlyCommand({
        type: 'createLine',
        x: GOMOKU_ORIGIN.x + offset,
        y: GOMOKU_ORIGIN.y,
        endX: GOMOKU_ORIGIN.x + offset,
        endY: end,
        color: 'black',
        size: index === 0 || index === GOMOKU_SIZE - 1 ? 'm' : 's',
      })
    }

    for (const star of GOMOKU_STAR_POINTS) {
      const point = gomokuCanvasPoint(star)
      runCanvasOnlyCommand({ type: 'createGeo', geo: 'ellipse', x: point.x - 4, y: point.y - 4, w: 8, h: 8, color: 'black' })
    }
    runCanvasOnlyCommand({ type: 'createText', x: 64, y: end + 44, text: '黑子：你    红子：AI', color: 'grey', size: 'm' })
    syncCanvasSnapshot(0)
  }

  const drawGomokuStoneOnCanvas = (point: GomokuPoint, stone: GomokuStone) => {
    const center = gomokuCanvasPoint(point)
    const radius = GOMOKU_STONE / 2
    runCanvasOnlyCommand({
      type: 'createGeo',
      geo: 'ellipse',
      x: center.x - radius,
      y: center.y - radius,
      w: GOMOKU_STONE,
      h: GOMOKU_STONE,
      color: stone === 'human' ? 'black' : 'red',
    })
  }

  const drawGomokuWinOnCanvas = (win: GomokuWin) => {
    const first = gomokuCanvasPoint(win.line[0])
    const last = gomokuCanvasPoint(win.line[win.line.length - 1])
    runCanvasOnlyCommand({ type: 'createLine', x: first.x, y: first.y, endX: last.x, endY: last.y, color: 'violet', size: 'xl' })
  }

  const resetGomokuGame = () => {
    setGomokuBoard(createEmptyGomokuBoard())
    setGomokuPending(null)
    setGomokuTurn('human')
    setGomokuWin(null)
    setGomokuStatus('选择交叉点后点击“确定落子”。')
    setLessonCommands([])
    setLessonStep(-1)
    stopPlayback()
    drawGomokuBoardOnCanvas()
  }

  const chooseGomokuCell = (row: number, col: number) => {
    if (gomokuTurn !== 'human' || gomokuWin || gomokuBoard[row][col]) return
    setGomokuPending({ row, col })
    setGomokuStatus(`已选择第 ${row + 1} 行，第 ${col + 1} 列。点击“确定落子”。`)
  }

  const finishGomokuTurn = (board: GomokuBoard) => {
    const win = findGomokuWin(board)
    if (win) {
      setGomokuWin(win)
      setGomokuTurn('human')
      setGomokuStatus(win.winner === 'human' ? '你连成五子，获胜！' : 'AI 连成五子，获胜。')
      drawGomokuWinOnCanvas(win)
      return true
    }
    if (isGomokuFull(board)) {
      setGomokuTurn('human')
      setGomokuStatus('棋盘已满，平局。')
      return true
    }
    return false
  }

  const confirmGomokuMove = async () => {
    if (!gomokuPending || gomokuTurn !== 'human' || gomokuWin || gomokuBoard[gomokuPending.row][gomokuPending.col]) return

    const next = cloneGomokuBoard(gomokuBoard)
    next[gomokuPending.row][gomokuPending.col] = 'human'
    setGomokuBoard(next)
    drawGomokuStoneOnCanvas(gomokuPending, 'human')
    setGomokuPending(null)
    if (finishGomokuTurn(next)) return

    setGomokuTurn('ai')
    setGomokuStatus('AI 正在思考下一步...')
    await sleep(260)

    const aiMove = chooseGomokuAiMove(next)
    if (!aiMove) {
      setGomokuTurn('human')
      setGomokuStatus('棋盘已满，平局。')
      return
    }

    const replied = cloneGomokuBoard(next)
    replied[aiMove.row][aiMove.col] = 'ai'
    setGomokuBoard(replied)
    drawGomokuStoneOnCanvas(aiMove, 'ai')
    if (!finishGomokuTurn(replied)) {
      setGomokuTurn('human')
      setGomokuStatus(`AI 已落在第 ${aiMove.row + 1} 行，第 ${aiMove.col + 1} 列。轮到你。`)
    }
  }

  const renderCommands = async (commands: StepCommand[], targetStep = -1) => {
    if (!editorRef.current) return
    const clear = commands.find((command) => command.type === 'clear')
    if (clear) await runCommand(clear, false)
    else executeCommand(editorRef.current, { type: 'clear' })

    const commandSteps = uniqueSteps(commands)
    const stepLimit = targetStep < 0 ? Math.max(...commandSteps, -1) : targetStep
    const drawable = commands.filter((command) => {
      const step = commandStep(command)
      return step !== null && step <= stepLimit && command.type !== 'clear'
    })
    for (const command of drawable) await runCommand(command, false)
    setLessonStep(stepLimit)
  }

  const enqueueCommand = (command: StepCommand) => {
    queueRef.current = queueRef.current.then(async () => {
      if (typeof command.delay === 'number' && command.delay > 0) await sleep(command.delay)
      if (command.type === 'createSession') {
        const requestedMode = command.mode && ['lesson', 'brainstorm', 'chess', 'presentation'].includes(command.mode)
          ? command.mode
          : modeRef.current
        const next = createNewSession(requestedMode as SceneName, { title: command.title, prompt: command.prompt })
        const editor = await waitForEditorSession(next.id)
        if (editor) {
          if (next.mode === 'chess') resetGomokuGame()
          else executeCommand(editor, { type: 'clear' })
          syncCanvasSnapshot(0)
        }
        await acknowledgeCommand(command.id, { ok: true, commandType: command.type, sessionId: next.id, title: next.title })
        return
      }
      if (command.type === 'createAnimatedBall') {
        createAnimatedBall(command)
        await acknowledgeCommand(command.id, { ok: true, commandType: command.type })
        scheduleHistoryRefresh()
        return
      }
      if (command.type === 'createPythonPlot') {
        try {
          await createPythonPlot(command)
          await acknowledgeCommand(command.id, { ok: true, commandType: command.type })
        } catch (error) {
          await acknowledgeCommand(command.id, { ok: false, commandType: command.type, error: error instanceof Error ? error.message : String(error) })
          throw error
        }
        scheduleHistoryRefresh()
        return
      }
      rememberExternalLessonCommand(command, activeSessionIdRef.current)
      await runCommand(command, true)
    })
    return queueRef.current
  }

  const rememberExternalLessonCommand = (command: StepCommand, sessionId = activeSessionIdRef.current) => {
    if (!command.batchId || commandStep(command) === null) return
    setLessonCommands((current) => {
      const sameBatch = current.length === 0 || current.some((item) => item.batchId === command.batchId)
      const next = sameBatch ? [...current, command] : [command]
      const sorted = next.sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0))
      updateSession(sessionId, {
        commands: sorted,
        mode: modeRef.current,
        prompt: command.batchName ?? sessionsRef.current.find((session) => session.id === sessionId)?.prompt ?? '',
        title: makeSessionTitle(modeRef.current, command.batchName ?? command.stepTitle ?? sessionsRef.current.find((session) => session.id === sessionId)?.title ?? ''),
        lessonStep: -1,
      })
      return sorted
    })
  }

  const stopPlayback = () => {
    playbackTokenRef.current += 1
    setPlaying(false)
  }

  const renderToStep = async (targetStep: number) => {
    if (!editorRef.current || !canControlLesson) return
    stopPlayback()
    await renderCommands(lessonCommands, targetStep)
    updateActiveSession({ lessonStep: targetStep })
    setActivity(`已定位到：${stepTitle(lessonCommands, targetStep)}`)
  }

  const playLesson = async (fromBeginning = false) => {
    if (!editorRef.current || !canControlLesson) return
    const token = playbackTokenRef.current + 1
    playbackTokenRef.current = token
    setPlaying(true)

    const nextStepIndex = steps.findIndex((step) => step > lessonStep)
    const shouldRestart = fromBeginning || lessonStep < 0 || nextStepIndex === -1
    const startIndex = shouldRestart ? 0 : nextStepIndex
    if (shouldRestart) {
      const clear = lessonCommands.find((command) => command.type === 'clear')
      if (clear) await runCommand(clear, false)
      else executeCommand(editorRef.current, { type: 'clear' })
      setLessonStep(-1)
    }

    for (let index = startIndex; index < steps.length; index++) {
      if (playbackTokenRef.current !== token) return
      const step = steps[index]
      setLessonStep(step)
      updateActiveSession({ lessonStep: step })
      setActivity(`正在播放：${stepTitle(lessonCommands, step)}`)
      const commands = lessonCommands.filter((command) => command.step === step && command.type !== 'clear')
      for (const command of commands) {
        if (playbackTokenRef.current !== token) return
        await sleep(typeof command.delay === 'number' && command.delay > 0 ? command.delay : 280)
        await runCommand(command, false)
      }
      await sleep(520)
    }

    setPlaying(false)
    setActivity('播放完成，可以重播或前后切换步骤')
  }

  const createNewSession = (nextMode = mode, options: { title?: string; prompt?: string } = {}) => {
    const requestedPrompt = options.prompt ?? options.title ?? ''
    const next = {
      ...createTaskSession(nextMode, requestedPrompt),
      title: options.title?.trim() || makeSessionTitle(nextMode, requestedPrompt),
    }
    setSessions((current) => [next, ...current])
    setActiveSessionId(next.id)
    setMode(next.mode)
    setPrompt(options.prompt ?? '')
    setPlan(null)
    setLessonCommands([])
    setLessonStep(-1)
    setProblemImage(null)
    setActivity(`New session: ${next.title}`)
    return next
  }

  const switchSession = async (sessionId: string) => {
    const next = sessionsRef.current.find((session) => session.id === sessionId)
    if (!next) return
    stopPlayback()
    setActiveSessionId(next.id)
    setMode(next.mode)
    setPrompt(next.prompt)
    setPlan(null)
    setLessonCommands(next.commands)
    setLessonStep(next.lessonStep)
    setProblemImage(next.problemImage)
    setActivity(`已切换到：${next.title}`)
    await waitForEditorSession(next.id)
    if (next.mode === 'chess' && next.commands.length === 0) resetGomokuGame()
    else if (next.commands.length > 0) await renderCommands(next.commands, next.lessonStep)
    else if (editorRef.current) {
      executeCommand(editorRef.current, { type: 'clear' })
      if (next.mode !== 'chess') createScene(editorRef.current, next.mode)
      syncCanvasSnapshot(0)
    }
  }

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    saveTaskWorkspace({ sessions, activeSessionId })
  }, [sessions, activeSessionId])

  useEffect(() => {
    if (!busy) {
      setWorkingStep(0)
      return
    }
    const timer = window.setInterval(() => {
      setWorkingStep((value) => value + 1)
    }, 1150)
    return () => window.clearInterval(timer)
  }, [busy, mode])

  useEffect(() => {
    const events = new EventSource('/api/events')
    events.onopen = () => setConnected(true)
    events.onerror = () => setConnected(false)
    events.onmessage = (event) => {
      const command = JSON.parse(event.data) as StepCommand | { type: 'connected' }
      if (command.type === 'connected') return
      void enqueueCommand(command as StepCommand)
      setActivity(`外部 Agent 执行：${command.type}`)
    }
    void hydrateLatestBatch().catch((error) => {
      console.warn('[CommandHistory] Failed to hydrate latest batch', error)
      refreshHistory()
    })
    return () => {
      events.close()
      if (snapshotTimerRef.current) window.clearTimeout(snapshotTimerRef.current)
      if (historyTimerRef.current) window.clearTimeout(historyTimerRef.current)
      disposeSnapshotListenerRef.current?.()
    }
  }, [])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'))
      if (!file) return
      event.preventDefault()
      void handleProblemImageFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  useEffect(() => {
    if (problemImage) return
    void fetch('/api/problem-image')
      .then((response) => response.json())
      .then((data) => {
        if (data?.problemImage) {
          setProblemImage(data.problemImage)
          updateActiveSession({ problemImage: data.problemImage })
        }
      })
      .catch((error) => console.warn('[ProblemImage] Failed to hydrate', error))
  }, [])

  const generatePlan = async (text = prompt) => {
    if (!text.trim()) return
    setBusy(true)
    showThinkingDraft(text)
    setActivity(`正在生成计划：${text}`)
    try {
      const nextPlan = await requestPlan(text, mode, replaceCanvas)
      setPlan(nextPlan)
      setLessonCommands(nextPlan.commands)
      setLessonStep(-1)
      setPrompt(text)
      updateActiveSession({
        mode,
        prompt: text,
        title: makeSessionTitle(mode, text),
        commands: nextPlan.commands,
        lessonStep: -1,
      })
      setActivity(`计划已生成：${nextPlan.commands.length} 条命令`)
    } catch (error) {
      setActivity(error instanceof Error ? error.message : '计划生成失败')
    } finally {
      clearThinkingDraft()
      setBusy(false)
    }
  }

  const buildDirectCommands = (text: string): StepCommand[] | null => {
    const normalized = text.trim().toLowerCase()
    if (!normalized) return null
    const cnWantsPythonPlot = normalized.includes('python')
      && (normalized.includes('\u753b') || normalized.includes('\u51fd\u6570') || normalized.includes('\u66f2\u7ebf'))
    if (cnWantsPythonPlot) {
      const equationMatch = text.match(/=\s*([0-9a-zA-Z_+\-*/^().\s]+?)(?:[\u3002\uff0c,]|\u7684|\u5e76|$)/)
      const expressionMatch = text.match(/([0-9a-zA-Z_+\-*/^().\s]*x[0-9a-zA-Z_+\-*/^().\s]*)/)
      const expression = (equationMatch?.[1] ?? expressionMatch?.[1])?.trim()
      const safeExpression = expression && /[xX]/.test(expression) ? expression.replace(/^.*=/, '').trim() : 'x / (x^2 + 1)^(3/2)'
      return [
        { type: 'createSession', mode: 'lesson', title: 'Python \u51fd\u6570\u7ed8\u56fe', prompt: text },
        {
          type: 'createPythonPlot',
          title: '\u51fd\u6570\u56fe\u50cf',
          expression: safeExpression,
          xMin: 0,
          xMax: 3.5,
          samples: 420,
          xLabel: 'x',
          yLabel: 'y',
          color: '#dc2626',
          x: 120,
          y: 120,
          w: 620,
          h: 420,
          notes: `\u8868\u8fbe\u5f0f\uff1a${safeExpression}\n\u8fd9\u662f\u72ec\u7acb Python \u7ed8\u56fe\u533a\uff0c\u9002\u5408\u7269\u7406\u9898\u91cc\u7684\u51fd\u6570\u56fe\u3001\u6781\u503c\u3001\u8d8b\u52bf\u548c\u5bf9\u6bd4\u56fe\u3002`,
        },
        { type: 'zoomToFit' },
      ]
    }
    const cnWantsBall = (normalized.includes('\u65cb\u8f6c') || normalized.includes('\u8f6c\u52a8'))
      && normalized.includes('\u7403')
    if (cnWantsBall) {
      return [
        { type: 'createSession', mode: 'brainstorm', title: '\u65cb\u8f6c\u5c0f\u7403', prompt: text },
        { type: 'createAnimatedBall', x: 420, y: 290, radius: 34, orbitRadius: 118, color: '#7f46e8', duration: 2400, label: '\u65cb\u8f6c\u7684\u5c0f\u7403' },
        { type: 'zoomToFit' },
      ]
    }
    const wantsPythonPlot = (normalized.includes('python') && (normalized.includes('画') || normalized.includes('plot') || normalized.includes('函数') || normalized.includes('曲线')))
      || normalized.includes('函数图')
      || normalized.includes('物理曲线')
    if (wantsPythonPlot) {
      const equationMatch = text.match(/=\s*([0-9a-zA-Z_+\-*/^().\s]+?)(?:[，。,]|的|并|$)/)
      const expressionMatch = text.match(/([0-9a-zA-Z_+\-*/^().\s]*x[0-9a-zA-Z_+\-*/^().\s]*)/)
      const expression = (equationMatch?.[1] ?? expressionMatch?.[1])?.trim()
      const safeExpression = expression && /[xX]/.test(expression) ? expression.replace(/^.*=/, '').trim() : 'x / (x^2 + 1)^(3/2)'
      return [
        { type: 'createSession', mode: 'lesson', title: 'Python 函数绘图', prompt: text },
        {
          type: 'createPythonPlot',
          title: '函数图像',
          expression: safeExpression,
          xMin: 0,
          xMax: 3.5,
          samples: 420,
          xLabel: 'x',
          yLabel: 'y',
          color: '#dc2626',
          x: 120,
          y: 120,
          w: 620,
          h: 420,
          notes: `表达式：${safeExpression}\n这是独立 Python 绘图区，适合物理题里的函数图、极值、趋势和对比图。`,
        },
        { type: 'zoomToFit' },
      ]
    }
    const wantsBall = normalized.includes('旋转') && normalized.includes('球')
      || normalized.includes('转动') && normalized.includes('球')
      || normalized.includes('spinning ball')
      || normalized.includes('rotating ball')
    if (!wantsBall) return null
    return [
      { type: 'createSession', mode: 'brainstorm', title: '旋转小球', prompt: text },
      { type: 'createAnimatedBall', x: 420, y: 290, radius: 34, orbitRadius: 118, color: '#7f46e8', duration: 2400, label: '旋转的小球' },
      { type: 'zoomToFit' },
    ]
  }

  const executeCanvasPrompt = async (text = prompt) => {
    const directCommands = buildDirectCommands(text)
    if (!directCommands) {
      await generatePlan(text)
      return
    }
    setBusy(true)
    setActivity(`正在执行画布命令：${text}`)
    try {
      for (const command of directCommands) await enqueueCommand(command)
      setPrompt('')
      setPlan(null)
      setActivity('已完成：旋转小球正在画布中运动')
    } catch (error) {
      setActivity(error instanceof Error ? error.message : '画布命令执行失败')
    } finally {
      setBusy(false)
    }
  }

  const applyPlan = async () => {
    if (!plan) return
    setBusy(true)
    clearThinkingDraft()
    setActivity('正在应用计划到画布')
    try {
      setLessonCommands(plan.commands)
      setLessonStep(-1)
      updateActiveSession({
        mode,
        prompt,
        title: makeSessionTitle(mode, prompt || plan.summary),
        commands: plan.commands,
        lessonStep: -1,
      })
      await sendCommandBatch(plan)
      setPlan(null)
      setPrompt('')
      setActivity('计划已发送，画布会逐步出现，也可以用演示控制重播')
      scheduleHistoryRefresh(500)
    } catch (error) {
      setActivity(error instanceof Error ? error.message : '应用计划失败')
    } finally {
      setBusy(false)
    }
  }

  const selectMode = (next: SceneName) => {
    setMode(next)
    updateActiveSession({ mode: next, title: makeSessionTitle(next, prompt, activeSession?.title) })
    if (editorRef.current) {
      if (next === 'chess') resetGomokuGame()
      else {
        createScene(editorRef.current, next)
        syncCanvasSnapshot()
      }
    }
    setPlan(null)
    setActivity(`已切换到${modes.find((item) => item.id === next)?.label}模式`)
  }

  const fillSuggestion = (text: string) => {
    setPrompt(text)
    setPlan(null)
    void generatePlan(text)
  }

  const handleProblemImageFile = async (file: File | undefined) => {
    if (!file || !editorRef.current) return
    if (!file.type.startsWith('image/')) {
      setActivity('请选择图片文件')
      return
    }
    setBusy(true)
    setActivity('正在把题目图片放到底层')
    try {
      const info = await createProblemImage(editorRef.current, file)
      setProblemImage(info)
      updateActiveSession({ problemImage: info })
      await postProblemImage(info)
      syncCanvasSnapshot(0)
      setActivity('题目图片已放入底层，可以在题目上批注或在下方讲解')
    } catch (error) {
      setActivity(error instanceof Error ? error.message : '题目图片导入失败')
    } finally {
      setBusy(false)
    }
  }

  const createProblemScaffold = () => {
    if (!problemImage || !editorRef.current) return
    const highlightW = Math.max(160, Math.min(360, problemImage.displayW - 48))
    const noteX = problemImage.x + problemImage.displayW + 86
    const noteY = problemImage.y + 38
    const belowY = problemImage.y + problemImage.displayH + 62
    const commands: StepCommand[] = [
      { type: 'createText', x: problemImage.x, y: Math.max(24, problemImage.y - 52), text: '老师批注：先读题，再讲解', color: 'violet', size: 'l', step: 0, stepTitle: '读题' },
      { type: 'createHighlight', x: problemImage.x + 24, y: problemImage.y + 24, w: highlightW, h: 72, color: 'yellow', opacity: 0.2, step: 1, stepTitle: '圈题干' },
      { type: 'createArrow', x: problemImage.x + 24 + highlightW, y: problemImage.y + 60, endX: noteX - 18, endY: noteY + 45, color: 'violet', step: 1, stepTitle: '圈题干' },
      { type: 'createNote', x: noteX, y: noteY, text: '这里写题目条件：\n1. 已知什么？\n2. 要求什么？', color: 'yellow', step: 1, stepTitle: '圈题干' },
      { type: 'createText', x: problemImage.x, y: belowY, text: '解题过程', color: 'violet', size: 'l', step: 2, stepTitle: '写过程' },
      { type: 'createNote', x: problemImage.x, y: belowY + 62, text: '第 1 步：把已知条件抄清楚。\n第 2 步：选公式或方法。\n第 3 步：一行一行计算。\n第 4 步：写答案并检查。', color: 'green', step: 2, stepTitle: '写过程' },
      { type: 'createArrow', x: problemImage.x + 310, y: belowY + 95, endX: problemImage.x + 470, endY: belowY + 95, color: 'green', step: 3, stepTitle: '连接题目和过程' },
      { type: 'createNote', x: problemImage.x + 500, y: belowY + 42, text: '接入视觉模型后，AI 会先读图，再把每一步写到这里。', color: 'blue', step: 3, stepTitle: '连接题目和过程' },
      { type: 'zoomToFit', step: 4, stepTitle: '全图' },
    ]
    setLessonCommands(commands)
    setLessonStep(-1)
    updateActiveSession({
      commands,
      lessonStep: -1,
      title: makeSessionTitle(mode, '题目批注讲解'),
    })
    void commands.reduce((chain, command) => chain.then(() => runCommand(command, false)), Promise.resolve())
    setActivity('已生成题目批注脚手架，可以继续让 Agent 根据题目细化讲解')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">G</span><span>GOTIM DRAWER</span><span className="beta">LAB</span></div>
        <div className="topbar-center"><BrainCircuit size={16} /><span>{activity}</span></div>
        <div className="topbar-actions">
          <span className={`connection ${connected ? 'online' : ''}`}>{connected ? <Wifi size={14} /> : <WifiOff size={14} />}{connected ? 'Agent API 已连接' : 'Agent API 离线'}</span>
          <button className="icon-button" aria-label="帮助" onClick={() => window.open('/help.html', '_blank')}><CircleHelp size={18} /></button>
          <button className="icon-button" aria-label="切换侧栏" onClick={() => setPanelOpen(!panelOpen)}>{panelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</button>
        </div>
      </header>

      <nav className="mode-rail" aria-label="工作模式">
        <span className="rail-label">工作模式</span>
        {modes.map((item) => <button key={item.id} className={mode === item.id ? 'active' : ''} onClick={() => selectMode(item.id)} title={item.description}><item.icon size={20} /><span>{item.label}</span></button>)}
      </nav>

      <section className="canvas-stage">
        <Tldraw
          key={activeSessionId}
          persistenceKey={`gotim-drawer-${activeSessionId}`}
          onMount={(editor: Editor) => {
            disposeSnapshotListenerRef.current?.()
            editorRef.current = editor
            editorSessionIdRef.current = activeSessionId
            disposeSnapshotListenerRef.current = editor.store.listen(() => syncCanvasSnapshot(450), {
              source: 'user',
              scope: 'document',
            })
            window.gotimDrawer = {
              execute: (command) => {
                void enqueueCommand(command as StepCommand)
              },
              capabilities: () => ['createSession', 'clear', 'zoomToFit', 'undo', 'redo', 'deleteShape', 'updateShape', 'layout', 'createText', 'createFormula', 'createAnimatedBall', 'createPythonPlot', 'createNote', 'createGeo', 'createLine', 'createDraw', 'createHighlight', 'createArrow', 'createImage', 'scene'],
            }
            if (editor.getCurrentPageShapeIds().size === 0 && lessonCommands.length === 0) {
              if (mode === 'chess') resetGomokuGame()
              else createScene(editor, mode)
            }
            if (lessonCommands.length > 0 && editor.getCurrentPageShapeIds().size === 0) void renderCommands(lessonCommands, lessonStep)
            syncCanvasSnapshot(0)
          }}
        />
        {busy && (
          <div className="work-overlay" role="status" aria-live="polite">
            <div className="work-card">
              <div className="work-card-head">
                <span className="work-pulse" />
                <div>
                  <strong>{activeWorkingStep.label}</strong>
                  <span>{activeWorkingStep.detail}</span>
                </div>
              </div>
              <div className="work-steps">
                {activeWorkingStages.map((stage, index) => (
                  <span key={stage.label} className={index === workingStep % activeWorkingStages.length ? 'active' : ''} />
                ))}
              </div>
              <p>{activity}</p>
            </div>
          </div>
        )}
        {mode === 'chess' && (
          <div className="gomoku-overlay" aria-label="五子棋棋盘">
            <div className="gomoku-panel">
              <div className="gomoku-panel-head">
                <div>
                  <strong>五子棋</strong>
                  <span>{gomokuStatus}</span>
                </div>
                <button className="secondary-action" onClick={resetGomokuGame}>
                  <RefreshCw size={14} />
                  重开
                </button>
              </div>
              <div className="gomoku-board-wrap">
                <div className="gomoku-board">
                  {gomokuBoard.map((row, rowIndex) => row.map((cell, colIndex) => {
                    const selected = gomokuPending?.row === rowIndex && gomokuPending?.col === colIndex
                    const inWin = gomokuWinCells.has(`${rowIndex}:${colIndex}`)
                    return (
                      <button
                        key={`${rowIndex}-${colIndex}`}
                        className={`gomoku-cell ${cell ?? ''} ${selected ? 'pending' : ''} ${inWin ? 'win' : ''}`}
                        disabled={gomokuTurn !== 'human' || Boolean(cell) || Boolean(gomokuWin)}
                        onClick={() => chooseGomokuCell(rowIndex, colIndex)}
                        aria-label={`第 ${rowIndex + 1} 行第 ${colIndex + 1} 列`}
                      />
                    )
                  }))}
                </div>
              </div>
              <div className="gomoku-actions">
                <button className="primary-action" disabled={!gomokuPending || gomokuTurn !== 'human' || Boolean(gomokuWin)} onClick={() => void confirmGomokuMove()}>
                  <Check size={14} />
                  确定落子
                </button>
                <button className="secondary-action" disabled={gomokuTurn !== 'human'} onClick={resetGomokuGame}>
                  <RotateCcw size={14} />
                  重新开始
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="canvas-hint"><Sparkles size={14} /> 画布会按步骤出现，可以重播、前进或后退</div>
        <div className="canvas-command-bar" role="search" aria-label="画布命令输入">
          <textarea
            value={prompt}
            onChange={(event) => { setPrompt(event.target.value); setPlan(null); updateActiveSession({ prompt: event.target.value }) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void executeCanvasPrompt()
              }
            }}
            placeholder="直接给画板下命令，例如：用 Python 画 E(x)=x/(x^2+1)^(3/2) 的函数图，并标出最大值"
          />
          <button disabled={!prompt.trim() || busy} onClick={() => void executeCanvasPrompt()} aria-label="发送画布命令">
            <Send size={17} />
          </button>
        </div>
        {visibleAnimatedBalls.map((ball) => (
          <div
            key={ball.id}
            className="animated-ball-orbit"
            style={{
              left: ball.x - ball.orbitRadius,
              top: ball.y - ball.orbitRadius,
              width: ball.orbitRadius * 2,
              height: ball.orbitRadius * 2,
              ['--ball-radius' as string]: `${ball.radius}px`,
              ['--ball-color' as string]: ball.color,
              ['--orbit-duration' as string]: `${ball.duration}ms`,
            }}
            aria-label={ball.label ?? 'rotating ball'}
          >
            <span />
          </div>
        ))}
      </section>

      {panelOpen && <aside className="agent-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">CANVAS AGENT</span><h1>让画布替你表达</h1></div>
          <span className="agent-orb"><Sparkles size={18} /></span>
        </div>

        <div className="composer composer-primary">
          <textarea value={prompt} onChange={(e) => { setPrompt(e.target.value); setPlan(null); updateActiveSession({ prompt: e.target.value }) }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void executeCanvasPrompt() } }} placeholder="直接给画布下命令，例如：在canvas画一个旋转的小球" />
          <div className="composer-footer"><span>{busy ? '正在处理...' : 'Enter 直接执行或生成计划 · Shift+Enter 换行'}</span><button disabled={!prompt.trim() || busy} onClick={() => void executeCanvasPrompt()} aria-label="执行画布命令"><Send size={17} /></button></div>
        </div>

        <section className="sessions-card">
          <div className="sessions-title"><History size={15} /><strong>任务窗口</strong><button onClick={() => createNewSession(mode)}><Plus size={12} />新建</button></div>
          <div className="session-list">
            {sessions.map((session) => {
              const Icon = modes.find((item) => item.id === session.mode)?.icon ?? GraduationCap
              const stepCount = uniqueSteps(session.commands).length
              return (
                <button key={session.id} className={session.id === activeSessionId ? 'active' : ''} onClick={() => switchSession(session.id)}>
                  <Icon size={14} />
                  <span><strong>{session.title}</strong><em>{modes.find((item) => item.id === session.mode)?.label} · {stepCount > 0 ? `${stepCount} 步` : '空白'}</em></span>
                </button>
              )
            })}
          </div>
        </section>

        <div className="mode-summary">
          {(() => { const item = modes.find((entry) => entry.id === mode)!; return <><item.icon size={18} /><div><strong>{item.label}模式</strong><span>{item.description}</span></div></> })()}
        </div>

        <section className="playback-card">
          <div className="playback-title"><Play size={15} /><strong>步骤回放</strong><span>{canControlLesson ? `${Math.max(currentStepIndex + 1, 0)} / ${steps.length}` : '无脚本'}</span></div>
          <div className="step-meter" aria-label="演示进度"><span style={{ width: canControlLesson ? `${Math.max(0, ((currentStepIndex + 1) / steps.length) * 100)}%` : '0%' }} /></div>
          <p>{currentStepTitle}</p>
          <div className="playback-actions">
            <button title="重播" disabled={!canControlLesson || playing} onClick={() => void playLesson(true)}><RotateCcw size={15} /></button>
            <button title="上一步" disabled={!canControlLesson || playing || currentStepIndex <= 0} onClick={() => void renderToStep(steps[currentStepIndex - 1])}><SkipBack size={15} /></button>
            <button className="primary-action" disabled={!canControlLesson || playing} onClick={() => void playLesson(false)}><Play size={15} />播放</button>
            <button title="下一步" disabled={!canControlLesson || playing || currentStepIndex >= steps.length - 1} onClick={() => void renderToStep(steps[Math.max(0, currentStepIndex + 1)])}><SkipForward size={15} /></button>
          </div>
        </section>

        <section className="problem-card">
          <div className="problem-title"><ImagePlus size={15} /><strong>题目图片</strong><span>{problemImage ? '已放入底层' : '未上传'}</span></div>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => void handleProblemImageFile(event.target.files?.[0])} />
          <button className="problem-upload" disabled={busy} onClick={() => fileInputRef.current?.click()}><ImagePlus size={15} />上传题目图</button>
          <button className="secondary-action" disabled={!problemImage || busy} onClick={createProblemScaffold}>生成批注讲解区</button>
          <p>{problemImage ? `${problemImage.name} · ${problemImage.displayW}x${problemImage.displayH}` : '支持截图、扫描题、拍照题。图片会作为底层题目，讲解写在题目上或空白处。'}</p>
        </section>

        <section className="suggestions">
          <span className="section-title">试着这样说</span>
          {prompts[mode].map((item) => <button key={item} onClick={() => fillSuggestion(item)}><span>{item}</span><ChevronRight size={15} /></button>)}
        </section>

        <section className="planner-card">
          <div className="planner-title"><Sparkles size={15} /><strong>计划预览</strong></div>
          <label className="replace-toggle">
            <input type="checkbox" checked={replaceCanvas} onChange={(event) => { setReplaceCanvas(event.target.checked); setPlan(null) }} />
            <span>{replaceCanvas ? '替换当前画布' : '追加到现有画布'}</span>
          </label>
          {plan ? (
            <div className="plan-preview">
              <strong>{plan.summary}</strong>
              <span>{plan.qualityChecks.join(' · ')}</span>
              <pre>{JSON.stringify(plan.commands.slice(0, 4), null, 2)}</pre>
              <div className="plan-actions">
                <button className="secondary-action" onClick={() => setPlan(null)}><Trash2 size={14} />丢弃</button>
                <button className="primary-action" disabled={busy || !connected} onClick={applyPlan}><Check size={14} />应用计划</button>
              </div>
            </div>
          ) : <span className="plan-empty">输入需求后先生成计划，确认后再应用到画布。</span>}
        </section>

        <section className="api-card">
          <div className="api-title"><ExternalLink size={15} /><strong>连接 Coding Agent</strong></div>
          <code>POST /api/plan</code>
          <pre>{`{"prompt":"讲解勾股定理","replaceCanvas":true}`}</pre>
          <span>规划器会优先使用板书式步骤、真实几何线段、图片底图和低重叠布局。</span>
        </section>

        <section className="history-card">
          <div className="history-title"><History size={15} /><strong>最近命令</strong><button onClick={refreshHistory}><RefreshCw size={11} />刷新</button></div>
          {history.length === 0 ? <span className="history-empty">暂无外部命令</span> : history.map((entry) => (
            <div className={`history-row ${entry.status}`} key={entry.id}>
              <div><strong>#{entry.id} {entry.type}</strong><span>{entry.batchId ?? 'single'} · delivered {entry.deliveredTo}</span></div>
              <em>{entry.status}</em>
            </div>
          ))}
        </section>

      </aside>}
    </main>
  )
}
