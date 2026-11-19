import {
  buildReview,
  classifyByLoss,
  winPercent,
  type EngineRecord,
  type Label,
  type OpeningBook,
  type ParsedMove,
  type ReviewSettings,
} from '@chessreview/core'
import type { LiveEval } from './services'

export type OpeningTrainingLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export type OpeningMoveDecision = 'accept' | 'inaccuracy' | 'reject'

export function openingMoveDecision(loss: number, best: boolean): OpeningMoveDecision {
  const label = classifyByLoss(loss, best)
  if (label === 'Mistake' || label === 'Blunder') return 'reject'
  return label === 'Inaccuracy' ? 'inaccuracy' : 'accept'
}

export function openingMoveLoss(beforeCp: number, afterCp: number, side: 'w' | 'b'): number {
  const sign = side === 'w' ? 1 : -1
  return Math.max(0, winPercent(sign * beforeCp) - winPercent(sign * afterCp))
}

export function openingAttemptLabel(
  move: ParsedMove,
  before: LiveEval,
  after: LiveEval,
  book: OpeningBook,
  settings: ReviewSettings,
  previous?: { move: ParsedMove; evaluation: LiveEval },
): Label {
  const moves = [...(previous ? [previous.move] : []), move].map((item, index) => ({
    ...item,
    ply: index + 1,
  }))
  const evaluations = [...(previous ? [previous.evaluation] : []), before, after]
  const records: EngineRecord[] = evaluations.map((item) => ({
    ...item.eval,
    best: item.line[0] ?? null,
    pv: item.line,
    secondCp: null,
  }))
  const startFen = moves[0]!.fenBefore
  const game = { headers: {}, startFen, moves, fens: [startFen, ...moves.map((item) => item.fenAfter)] }
  return buildReview(game, records, book, settings).moves.at(-1)!.label
}

export function requiredOpeningMoves(level: 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12): number {
  return level - 2
}

export function advanceOpeningLevel(
  level: OpeningTrainingLevel,
  hadError: boolean,
): { level: OpeningTrainingLevel; mastered: boolean } {
  if (hadError) return { level: Math.max(0, level - 1) as OpeningTrainingLevel, mastered: false }
  if (level === 12) return { level, mastered: true }
  return { level: (level + 1) as OpeningTrainingLevel, mastered: false }
}
