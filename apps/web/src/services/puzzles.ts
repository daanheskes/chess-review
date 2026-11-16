import {
  AnalysisAborted,
  answer,
  dedupeByPosition,
  explainReviewMove,
  freshProgress,
  isoDate,
  positionKey,
  puzzleCandidates,
  puzzleTactic,
  sideOf,
  verifyPuzzle,
  type Engine,
  type Puzzle,
  type PuzzleCandidate,
  type PuzzlePerspective,
  type PuzzleLimits,
  type PuzzleRecord,
} from '@chessreview/core'
import type { ReviewStore } from './storage'

/** How hard each candidate is searched to prove its best move is the only good one. */
export const PUZZLE_LIMITS: PuzzleLimits = { depth: 18, nodes: 3_000_000 }
/** A puzzle with a tactic whose side was not kept when it was made. */
const needsSide = (r: PuzzleRecord) => r.tactic !== null && r.perspective === undefined
const needsMetadata = (r: PuzzleRecord) =>
  r.puzzle !== null && (typeof r.puzzle.cpLoss !== 'number' || typeof r.puzzle.gambit !== 'boolean')
const needsBackfill = (r: PuzzleRecord) => needsSide(r) || needsMetadata(r)

export interface PuzzleDeps {
  store: ReviewStore
  /** Runs `work` with the engine pool. */
  engine: <T>(work: (engine: Engine) => Promise<T>) => Promise<T>
  now?: () => number
  limits?: PuzzleLimits
}

export interface SyncProgress {
  done: number
  total: number
  /** A verified puzzle, reported only after it has been saved. */
  record?: PuzzleRecord
}

/** Makes puzzles from the stored reviews of one player, and keeps how they were answered. */
export class PuzzleService {
  constructor(private deps: PuzzleDeps) {}

  private get limits() {
    return this.deps.limits ?? PUZZLE_LIMITS
  }

  private now() {
    return (this.deps.now ?? Date.now)()
  }

  private async all(player: string): Promise<PuzzleRecord[]> {
    const mine = player.toLowerCase()
    return (await this.deps.store.allPuzzles()).filter((r) => r.player === mine)
  }

  async list(player: string): Promise<PuzzleRecord[]> {
    const records = await this.all(player)
    const todo = records.filter(needsBackfill)
    if (todo.length === 0) return records
    try {
      await this.backfill(todo)
    } catch (e) {
      // Only the focus on a side is affected, so the puzzles still load.
      console.warn('Could not backfill details for puzzles from their games', e)
      return records
    }
    return this.all(player)
  }

  /**
   * Puzzles made before tactic sides and opening-loss details were kept get them from their game's review.
   * A game whose review cannot be read is skipped and the rest are still filled in.
   */
  private async backfill(todo: readonly PuzzleRecord[]): Promise<void> {
    const sides = new Map<string, PuzzlePerspective | null>()
    const metadata = new Map<string, { cpLoss: number; gambit: boolean }>()
    const byGame = new Map<string, PuzzleRecord[]>()
    for (const r of todo) {
      if (!r.puzzle) {
        if (needsSide(r)) sides.set(r.id, null) // its position was not kept as a puzzle
        continue
      }
      byGame.set(r.gameId, [...(byGame.get(r.gameId) ?? []), r])
    }
    // One game at a time in parallel, each review dropped as soon as its puzzles are done.
    await Promise.all(
      [...byGame].map(async ([gameId, records]) => {
        try {
          const stored = await this.deps.store.getReview(gameId)
          if (!stored) return
          for (const r of records) {
            const move = stored.review.moves[r.puzzle!.moveIndex]
            if (needsSide(r)) {
              const found = puzzleTactic(explainReviewMove(stored.review, r.puzzle!.moveIndex))
              sides.set(r.id, found.tactic === r.tactic ? found.perspective : null)
            }
            if (move)
              metadata.set(r.id, { cpLoss: move.cpLoss, gambit: /gambit\b/i.test(stored.review.opening) })
          }
        } catch (e) {
          console.warn(`Could not backfill puzzle details from game ${gameId}`, e)
        }
      }),
    )
    // Written onto the records as they are now, so an answer given while the reviews were read is kept.
    const ids = new Set(todo.map((r) => r.id))
    const current = (await this.deps.store.allPuzzles()).filter((r) => ids.has(r.id))
    if (current.length > 0)
      await this.deps.store.putPuzzles(
        current.map((r) => ({
          ...r,
          ...(sides.has(r.id) ? { perspective: sides.get(r.id) ?? null } : {}),
          ...(r.puzzle && metadata.has(r.id) ? { puzzle: { ...r.puzzle, ...metadata.get(r.id)! } } : {}),
        })),
      )
  }

  /** Moves in the player's reviewed games that have not been checked yet. */
  async pending(player: string): Promise<{ record: PuzzleRecord; candidate: PuzzleCandidate }[]> {
    const mine = player.toLowerCase()
    const known = new Set((await this.all(player)).map((r) => r.id))
    const found: {
      candidate: PuzzleCandidate
      gameId: string
      opponent: string
      date: string | null
      tactic: string | null
      perspective: PuzzleRecord['perspective']
    }[] = []
    for (const s of await this.deps.store.allReviews()) {
      const side = sideOf(s.review, player)
      if (!side) continue
      for (const candidate of puzzleCandidates(s.review, side)) {
        const e = explainReviewMove(s.review, candidate.moveIndex)
        found.push({
          candidate,
          gameId: s.id,
          opponent: side === 'white' ? s.review.black : s.review.white,
          date: isoDate(s.review.headers),
          ...puzzleTactic(e),
        })
      }
    }
    return dedupeByPosition(found.map((f) => ({ ...f, fen: f.candidate.fen })))
      .map((f) => ({
        candidate: f.candidate,
        record: {
          id: `${mine}|${positionKey(f.fen)}`,
          player: mine,
          gameId: f.gameId,
          opponent: f.opponent,
          date: f.date,
          tactic: f.tactic,
          perspective: f.perspective,
          kind: 'miss',
          checkedWith: this.limits,
          puzzle: null,
          progress: freshProgress(),
        } satisfies PuzzleRecord,
      }))
      .filter((p) => !known.has(p.record.id))
  }

  /**
   * Checks every new candidate of the player and saves the result, puzzle or not, so a position is
   * searched once. Stops quietly when cancelled, keeping what is done.
   */
  async sync(
    player: string,
    onProgress: (p: SyncProgress) => void = () => undefined,
    signal?: AbortSignal,
  ): Promise<void> {
    const todo = await this.pending(player)
    const total = todo.length
    if (total === 0) return
    let done = 0
    onProgress({ done, total })
    await this.deps.engine((engine) =>
      Promise.all(
        todo.map(async ({ record, candidate }) => {
          if (signal?.aborted) return
          let puzzle: Puzzle | null
          try {
            puzzle = await verifyPuzzle(candidate, engine, this.limits, signal)
          } catch (e) {
            if (e instanceof AnalysisAborted || signal?.aborted) return
            throw e
          }
          const checked: PuzzleRecord = { ...record, puzzle }
          await this.deps.store.putPuzzles([checked])
          onProgress({ done: ++done, total, ...(puzzle ? { record: checked } : {}) })
        }),
      ),
    )
  }

  /** Records an answer and returns the updated record. */
  async answer(record: PuzzleRecord, correct: boolean): Promise<PuzzleRecord> {
    const next = { ...record, progress: answer(record.progress, correct, this.now()) }
    await this.deps.store.putPuzzles([next])
    return next
  }
}
