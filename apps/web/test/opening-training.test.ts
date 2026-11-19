import { describe, expect, it } from 'vitest'
import { emptyBook, parseGame, settingsFor } from '@chessreview/core'
import {
  advanceOpeningLevel,
  openingAttemptLabel,
  openingMoveDecision,
  openingMoveLoss,
  requiredOpeningMoves,
} from '../src/opening-training'

describe('opening training progression', () => {
  it('distinguishes good moves from inaccuracies and mistakes', () => {
    expect(openingMoveDecision(5, false)).toBe('accept')
    expect(openingMoveDecision(6, false)).toBe('inaccuracy')
    expect(openingMoveDecision(11, false)).toBe('reject')
  })

  it('requires the requested number of good moves after the variation', () => {
    expect(([4, 5, 6, 7, 8, 9, 10, 11, 12] as const).map(requiredOpeningMoves)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
  })

  it('uses white-perspective engine scores consistently for both sides', () => {
    expect(openingMoveLoss(150, -150, 'w')).toBeGreaterThan(10)
    expect(openingMoveLoss(-150, 150, 'b')).toBeGreaterThan(10)
    expect(openingMoveLoss(150, 150, 'w')).toBe(0)
    expect(openingMoveLoss(-150, -150, 'b')).toBe(0)
  })

  it('uses game-review labels, including Miss after an opponent error', () => {
    const game = parseGame('1. e4 e5 2. Nf3')
    const move = game.moves[2]!
    const live = (cp: number, best: string) => ({ eval: { cp, mate: null }, line: [best], depth: 14 })
    const classify = (before: number, after: number) =>
      openingAttemptLabel(
        move,
        live(before, 'b1c3'),
        live(after, 'b8c6'),
        emptyBook,
        settingsFor('quick', 'test'),
      )
    expect(classify(0, -80)).toBe('Inaccuracy')
    expect(classify(0, -150)).toBe('Mistake')
    expect(classify(0, -300)).toBe('Blunder')
    expect(
      openingAttemptLabel(
        move,
        live(100, 'b1c3'),
        live(-100, 'b8c6'),
        emptyBook,
        settingsFor('quick', 'test'),
        { move: game.moves[1]!, evaluation: live(-300, 'b8c6') },
      ),
    ).toBe('Miss')
  })

  it('moves from the variation to rating-based levels and drops one level after an inaccuracy', () => {
    expect(advanceOpeningLevel(3, false)).toEqual({ level: 4, mastered: false })
    expect(advanceOpeningLevel(4, false)).toEqual({ level: 5, mastered: false })
    expect(advanceOpeningLevel(4, true)).toEqual({ level: 3, mastered: false })
    expect(advanceOpeningLevel(12, true)).toEqual({ level: 11, mastered: false })
  })

  it('keeps a clean GM result mastered at the top level', () => {
    expect(advanceOpeningLevel(12, false)).toEqual({ level: 12, mastered: true })
  })
})
