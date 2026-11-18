import { describe, expect, it } from 'vitest'
import { curatedOpenings } from '../src/curated-openings'
import {
  curatedOpeningIds,
  firstOpeningPiece,
  groupLinesByName,
  openingGame,
  openingGroups,
  openingLines,
  openingLineSlug,
  openingSlug,
  recommendedGroups,
} from '../src/opening-lines'

describe('curated opening lines', () => {
  it('keeps every recommendation playable, sufficiently long and in its opening family', () => {
    for (const curated of curatedOpenings) {
      const group = openingGroups.find((item) => item.name === curated.group)
      const first = group?.lines[0]
      expect(first?.name).toBe(curated.name)
      expect(first && curatedOpeningIds.has(first.id)).toBe(true)
      expect(first && openingGame(first).moves.length, curated.name).toBeGreaterThanOrEqual(15)
    }
  })

  it('offers eight distinct existing families for each side', () => {
    expect(new Set(curatedOpenings.map((item) => item.group))).toEqual(
      new Set([...recommendedGroups.w, ...recommendedGroups.b]),
    )
    for (const names of Object.values(recommendedGroups)) {
      expect(new Set(names).size).toBe(8)
      for (const name of names) expect(openingGroups.some((group) => group.name === name)).toBe(true)
    }
    expect(recommendedGroups.w).toContain('Ponziani Opening')
    expect(recommendedGroups.b).toContain('Scandinavian Defense')
    expect(recommendedGroups.b).toContain('Caro-Kann Defense')
  })

  it('creates distinct, stable URLs for opening families and their lines', () => {
    expect(new Set(openingGroups.map((group) => openingSlug(group.name))).size).toBe(openingGroups.length)
    for (const group of openingGroups) {
      expect(new Set(group.lines.map(openingLineSlug)).size).toBe(group.lines.length)
    }
  })

  it('groups same-named continuations without discarding any playable lines', () => {
    for (const names of Object.values(recommendedGroups)) {
      for (const name of names) {
        const lines = openingGroups.find((group) => group.name === name)!.lines
        const grouped = groupLinesByName(lines)
        expect(
          grouped
            .flat()
            .map((line) => line.id)
            .sort(),
        ).toEqual(lines.map((line) => line.id).sort())
        expect(new Set(grouped.map((group) => group[0]!.name)).size).toBe(grouped.length)
        expect(grouped[0]![0]).toBe(lines[0])
        for (const group of grouped) expect(group.every((line) => line.name === group[0]!.name)).toBe(true)
      }
    }
    const italian = openingGroups.find((group) => group.name === 'Italian Game')!
    const pianissimo = groupLinesByName(italian.lines).find(
      (group) => group[0]!.name === 'Italian Game: Giuoco Pianissimo',
    )!
    expect(pianissimo.length).toBeGreaterThan(1)
    expect(new Set(pianissimo.map((line) => line.pgn)).size).toBe(pianissimo.length)
  })

  it('retains unclassified lines and groups comma variants in the underlying catalogue', () => {
    expect(openingLines.find((line) => line.name === 'Amar Opening' && line.pgn === '1. Nh3')?.types).toEqual(
      [],
    )
    expect(
      openingGroups
        .find((group) => group.name === "King's Indian Attack")
        ?.lines.some((line) => line.name === "King's Indian Attack, with Bf5"),
    ).toBe(true)
  })

  it('uses the selected side’s first non-pawn move of a playable example for each suggestion', () => {
    for (const side of ['w', 'b'] as const) {
      for (const name of recommendedGroups[side]) {
        const { line, move } = firstOpeningPiece(name, side)
        const first = openingGame(line).moves.find((item) => item.color === side && /^[KQRBN]/.test(item.san))
        expect(move).toEqual(first)
        const group = openingGroups.find((item) => item.name === name)!
        expect(
          line.pgn === group.lines[0]!.pgn ||
            line.pgn.startsWith(`${group.lines[0]!.pgn} `) ||
            group.lines.includes(line),
        ).toBe(true)
      }
    }
    expect(firstOpeningPiece('Scandinavian Defense', 'b').move.san).toBe('Qxd5')
    expect(firstOpeningPiece('Caro-Kann Defense', 'b').move.san).toBe('Nd7')
    expect(firstOpeningPiece('London System', 'w').move.san).toBe('Nf3')
    expect(firstOpeningPiece("Queen's Gambit", 'w').move.san).toBe('Nc3')
  })
})
