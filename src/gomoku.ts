export type GomokuStone = 'human' | 'ai'
export type GomokuCell = GomokuStone | null
export type GomokuBoard = GomokuCell[][]

export type GomokuPoint = {
  row: number
  col: number
}

export type GomokuWin = {
  winner: GomokuStone
  line: GomokuPoint[]
}

export const GOMOKU_SIZE = 15

const directions = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: 1, dc: -1 },
]

export function createEmptyGomokuBoard(): GomokuBoard {
  return Array.from({ length: GOMOKU_SIZE }, () => Array.from({ length: GOMOKU_SIZE }, () => null))
}

export function cloneGomokuBoard(board: GomokuBoard): GomokuBoard {
  return board.map((row) => [...row])
}

export function isInsideGomoku(row: number, col: number) {
  return row >= 0 && row < GOMOKU_SIZE && col >= 0 && col < GOMOKU_SIZE
}

export function findGomokuWin(board: GomokuBoard): GomokuWin | null {
  for (let row = 0; row < GOMOKU_SIZE; row++) {
    for (let col = 0; col < GOMOKU_SIZE; col++) {
      const stone = board[row][col]
      if (!stone) continue
      for (const direction of directions) {
        const line: GomokuPoint[] = []
        for (let index = 0; index < 5; index++) {
          const nextRow = row + direction.dr * index
          const nextCol = col + direction.dc * index
          if (!isInsideGomoku(nextRow, nextCol) || board[nextRow][nextCol] !== stone) break
          line.push({ row: nextRow, col: nextCol })
        }
        if (line.length === 5) return { winner: stone, line }
      }
    }
  }
  return null
}

export function isGomokuFull(board: GomokuBoard) {
  return board.every((row) => row.every(Boolean))
}

function runLength(board: GomokuBoard, row: number, col: number, stone: GomokuStone, dr: number, dc: number) {
  let total = 1
  let openEnds = 0

  for (const sign of [-1, 1]) {
    let nextRow = row + dr * sign
    let nextCol = col + dc * sign
    while (isInsideGomoku(nextRow, nextCol) && board[nextRow][nextCol] === stone) {
      total += 1
      nextRow += dr * sign
      nextCol += dc * sign
    }
    if (isInsideGomoku(nextRow, nextCol) && board[nextRow][nextCol] === null) openEnds += 1
  }

  return { total, openEnds }
}

function scoreMove(board: GomokuBoard, row: number, col: number, stone: GomokuStone) {
  if (board[row][col]) return -Infinity

  let score = 0
  for (const direction of directions) {
    const { total, openEnds } = runLength(board, row, col, stone, direction.dr, direction.dc)
    if (total >= 5) score += 1_000_000
    else if (total === 4 && openEnds > 0) score += 80_000
    else if (total === 3 && openEnds === 2) score += 14_000
    else if (total === 3 && openEnds === 1) score += 4_000
    else if (total === 2 && openEnds === 2) score += 900
    else if (total === 2 && openEnds === 1) score += 240
    else score += openEnds * 24
  }

  const center = Math.floor(GOMOKU_SIZE / 2)
  score += Math.max(0, 16 - (Math.abs(row - center) + Math.abs(col - center)))
  return score
}

export function chooseGomokuAiMove(board: GomokuBoard): GomokuPoint | null {
  let best: GomokuPoint | null = null
  let bestScore = -Infinity

  for (let row = 0; row < GOMOKU_SIZE; row++) {
    for (let col = 0; col < GOMOKU_SIZE; col++) {
      if (board[row][col]) continue
      const attack = scoreMove(board, row, col, 'ai')
      const defense = scoreMove(board, row, col, 'human') * 0.92
      const score = Math.max(attack, defense)
      if (score > bestScore) {
        bestScore = score
        best = { row, col }
      }
    }
  }

  return best
}
