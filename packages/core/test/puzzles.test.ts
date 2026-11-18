import { describe, expect, it } from 'vitest'
import { puzzleCandidates, type Review } from '../src'

const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

const review: Review = {
  schemaVersion: 1,
  settings: { depth: 12, nodes: 100_000, hashMb: 16, engine: 'test' },
  white: 'Opponent',
  black: 'Player',
  result: '*',
  headers: {},
  opening: '',
  eco: '',
  fens: [start, afterE4],
  evals: [
    { cp: 0, mate: null },
    { cp: 0, mate: null },
  ],
  lines: [[], []],
  winSeries: [],
  moves: [
    {
      ply: 1,
      color: 'w',
      number: 1,
      san: 'e4',
      uci: 'e2e4',
      bestSan: 'e4',
      bestUci: 'e2e4',
      winBefore: 50,
      winAfter: 50,
      loss: 0,
      cpLoss: 0,
      accuracy: 100,
      label: 'Best',
      phase: 'opening',
      gap: null,
      clockMs: null,
    },
    {
      ply: 2,
      color: 'b',
      number: 1,
      san: 'Nf6',
      uci: 'g8f6',
      bestSan: 'e5',
      bestUci: 'e7e5',
      winBefore: 60,
      winAfter: 30,
      loss: 30,
      cpLoss: 200,
      accuracy: 50,
      label: 'Mistake',
      phase: 'middlegame',
      gap: null,
      clockMs: null,
    },
  ],
  accuracy: { white: 100, black: 50 },
  counts: { white: {}, black: {} },
  phases: {
    white: { opening: null, middlegame: null, endgame: null },
    black: { opening: null, middlegame: null, endgame: null },
  },
  acpl: { white: 0, black: 200 },
  ratingEstimate: { white: 1000, black: 1000 },
}

describe('puzzle candidates', () => {
  it("keeps the opponent's last move as puzzle context", () => {
    const [candidate] = puzzleCandidates(review, 'black')

    expect(candidate).toMatchObject({ context: { fen: start, uci: 'e2e4', san: 'e4' } })
  })
})
