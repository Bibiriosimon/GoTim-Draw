import type { DrawerCommand, SceneName } from './commands'
import type { ProblemImageInfo } from './problemImage'

export type SessionCommand = DrawerCommand & { id?: number; delay?: number; step?: number; stepTitle?: string }

export type TaskSession = {
  id: string
  title: string
  mode: SceneName
  prompt: string
  commands: SessionCommand[]
  lessonStep: number
  problemImage: ProblemImageInfo | null
  createdAt: string
  updatedAt: string
}

export type TaskWorkspace = {
  sessions: TaskSession[]
  activeSessionId: string
}

const SESSION_STORAGE_KEY = 'gotim.drawer.sessions.v2'
const ACTIVE_SESSION_KEY = 'gotim.drawer.activeSessionId.v2'

const modeLabels: Record<SceneName, string> = {
  lesson: '讲题',
  brainstorm: '绘画',
  chess: '下棋',
  presentation: '演示',
}

function now() {
  return new Date().toISOString()
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `session_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function safeParse<T>(value: string | null, fallback: T) {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function makeSessionTitle(mode: SceneName, prompt = '', fallback = '') {
  const raw = prompt.trim()
  if (raw) return raw.slice(0, 24)
  return fallback || `${modeLabels[mode]} 会话`
}

export function createTaskSession(mode: SceneName = 'lesson', prompt = '', commands: SessionCommand[] = []): TaskSession {
  const timestamp = now()
  return {
    id: makeId(),
    title: makeSessionTitle(mode, prompt),
    mode,
    prompt,
    commands,
    lessonStep: -1,
    problemImage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function loadTaskWorkspace(): TaskWorkspace {
  const sessions = safeParse<TaskSession[]>(globalThis.localStorage?.getItem(SESSION_STORAGE_KEY), [])
  const normalizedSessions = sessions.length > 0 ? sessions : [createTaskSession()]
  const activeSessionId = globalThis.localStorage?.getItem(ACTIVE_SESSION_KEY)
  const active = normalizedSessions.find((session) => session.id === activeSessionId) ?? normalizedSessions[0]
  return {
    sessions: normalizedSessions,
    activeSessionId: active.id,
  }
}

export function saveTaskWorkspace(workspace: TaskWorkspace) {
  try {
    globalThis.localStorage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(workspace.sessions))
    globalThis.localStorage?.setItem(ACTIVE_SESSION_KEY, workspace.activeSessionId)
  } catch {
    // Ignore storage errors.
  }
}
