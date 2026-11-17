import {
  AnalysisAborted,
  explainReviewMove,
  gameFacts,
  isoDate,
  sideOf,
  type GameFacts,
  type PuzzlePerspective,
} from '@chessreview/core'
import type { StoredReview } from './services'

// Facts per review and player, kept for the session: explaining every error is the slow part.
const cache = new Map<string, GameFacts | null>()
const tacticCache = new Map<string, { kind: string; perspective: PuzzlePerspective } | null>()

function tacticFor(stored: StoredReview, player: string, moveIndex: number) {
  const key = `${stored.id}|${stored.review.schemaVersion}|${player.toLowerCase()}|${moveIndex}`
  if (tacticCache.has(key)) return tacticCache.get(key) ?? null
  const explanation = explainReviewMove(stored.review, moveIndex)
  const tag =
    explanation && explanation.perspective !== 'played'
      ? { kind: explanation.kind, perspective: explanation.perspective }
      : null
  tacticCache.set(key, tag)
  return tag
}

export interface MistakePosition {
  stored: StoredReview
  moveIndex: number
  ply: number
  date: string | null
  tactic: { kind: string; perspective: PuzzlePerspective } | null
}

/**
 * The player's side of every stored game they played, with their errors tagged by the tactic behind
 * them. Explaining errors takes milliseconds each, so the work yields to the page every 20 ms and
 * reports progress; it can be cancelled.
 */
export async function factsFor(
  stored: readonly StoredReview[],
  player: string,
  onProgress: (done: number, total: number) => void = () => undefined,
  signal?: AbortSignal,
): Promise<GameFacts[]> {
  const out: GameFacts[] = []
  let slice = performance.now()
  for (const [i, s] of stored.entries()) {
    if (signal?.aborted) throw new AnalysisAborted()
    const key = `${s.id}|${player.toLowerCase()}`
    if (!cache.has(key)) {
      cache.set(
        key,
        gameFacts(s.id, s.review, player, s.createdAt, (m) => {
          return tacticFor(s, player, m)
        }),
      )
    }
    const facts = cache.get(key)
    if (facts) out.push(facts)
    if (performance.now() - slice > 20) {
      onProgress(i + 1, stored.length)
      await new Promise((r) => setTimeout(r, 0))
      slice = performance.now()
    }
  }
  return out
}

/** The player's recent mistake positions, optionally narrowed to an Insights tactic. */
export async function mistakePositionsFor(
  stored: readonly StoredReview[],
  player: string,
  tactic: string | null,
  perspective: PuzzlePerspective | null,
  onProgress: (done: number, total: number) => void = () => undefined,
  signal?: AbortSignal,
): Promise<MistakePosition[]> {
  const out: MistakePosition[] = []
  let slice = performance.now()
  for (const [i, s] of stored.entries()) {
    if (signal?.aborted) throw new AnalysisAborted()
    const side = sideOf(s.review, player)
    if (side) {
      const color = side === 'white' ? 'w' : 'b'
      for (const [moveIndex, move] of s.review.moves.entries()) {
        if (signal?.aborted) throw new AnalysisAborted()
        if (
          move.color === color &&
          (move.label === 'Mistake' || move.label === 'Miss' || move.label === 'Blunder')
        ) {
          const tag = tacticFor(s, player, moveIndex)
          if (
            tactic === null ||
            (tag?.kind === tactic && (perspective === null || tag.perspective === perspective))
          ) {
            out.push({
              stored: s,
              moveIndex,
              ply: move.ply,
              date: isoDate(s.review.headers),
              tactic: tag,
            })
          }
        }
        if (performance.now() - slice > 20) {
          onProgress(i, stored.length)
          await new Promise((resolve) => setTimeout(resolve, 0))
          slice = performance.now()
        }
      }
    }
    onProgress(i + 1, stored.length)
  }
  const recentDay = (position: MistakePosition) =>
    position.date ?? new Date(position.stored.createdAt).toISOString().slice(0, 10)
  return out.sort(
    (a, b) =>
      recentDay(b).localeCompare(recentDay(a)) ||
      b.stored.createdAt - a.stored.createdAt ||
      b.ply - a.ply ||
      a.stored.id.localeCompare(b.stored.id),
  )
}

/** Words for a tactic tag, as a row label: what happened to the player. */
export function tacticName(kind: string, perspective: 'allowed' | 'missed' | 'played'): string {
  const allowed: Record<string, string> = {
    hanging: 'Left a piece hanging',
    fork: 'Allowed a fork',
    pin: 'Allowed a pin',
    skewer: 'Allowed a skewer',
    discoveredAttack: 'Allowed a discovered attack',
    trappedPiece: 'Let a piece get trapped',
    overloadedDefender: 'Left a defender overloaded',
    mate: 'Allowed a forced mate',
    backRankMate: 'Allowed a back-rank mate',
    material: 'Lost material',
  }
  const missed: Record<string, string> = {
    hanging: 'Missed a free piece',
    fork: 'Missed a fork',
    pin: 'Missed a pin',
    skewer: 'Missed a skewer',
    discoveredAttack: 'Missed a discovered attack',
    trappedPiece: 'Missed trapping a piece',
    overloadedDefender: 'Missed an overloaded defender',
    mate: 'Missed a forced mate',
    backRankMate: 'Missed a back-rank mate',
    material: 'Missed winning material',
    recapture: 'Missed a recapture',
  }
  const table = perspective === 'missed' ? missed : allowed
  return Object.hasOwn(table, kind)
    ? table[kind]!
    : `${perspective === 'missed' ? 'Missed' : 'Allowed'}: ${kind}`
}

/** A tactic on its own, as a heading for the puzzles that practise it. */
export function tacticTopic(kind: string): string {
  const topics: Record<string, string> = {
    hanging: 'Hanging pieces',
    fork: 'Forks',
    pin: 'Pins',
    skewer: 'Skewers',
    discoveredAttack: 'Discovered attacks',
    trappedPiece: 'Trapped pieces',
    overloadedDefender: 'Overloaded defenders',
    mate: 'Forced mates',
    backRankMate: 'Back-rank mates',
    material: 'Lost material',
    recapture: 'Recaptures',
  }
  if (Object.hasOwn(topics, kind)) return topics[kind]!
  // A kind with no entry yet still reads as words, not an identifier.
  const words = kind
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
