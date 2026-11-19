import { describe, expect, it } from 'vitest'
import { curatedOpenings } from '../src/curated-openings'
import {
  curatedOpeningIds,
  displayOpeningLines,
  firstOpeningPiece,
  groupLinesByName,
  openingGame,
  openingGroups,
  openingLines,
  openingLineSlug,
  openingSlug,
  recommendedGroups,
  type OpeningLine,
} from '../src/opening-lines'

describe('curated opening lines', () => {
  it('preserves opening moves and distinct short variations while hiding same-name prefixes', () => {
    const make = (name: string, pgn: string): OpeningLine => ({
      id: `${name}\t${pgn}`,
      eco: 'B01',
      name,
      pgn,
      types: [],
    })
    const base = make('Opening', '1. e4 d5')
    const sameNameContinuation = make('Opening', '1. e4 d5 2. exd5')
    const short = make('Opening: Variation', '1. e4 d5 2. exd5')
    const longer = make('Opening: Variation', '1. e4 d5 2. exd5 Qxd5')
    const branch = make('Opening: Variation', '1. e4 d5 2. exd5 Nf6')
    const other = make('Opening: Other', '1. e4 d5 2. exd5')
    expect(
      displayOpeningLines([longer, short, base, other, branch, sameNameContinuation], 'Opening'),
    ).toEqual([base, longer, other, branch, sameNameContinuation])
    expect(displayOpeningLines([short], 'Opening')).toEqual([short])
  })

  it('filters same-name prefixes across the catalogue without hiding the opening moves', () => {
    for (const group of openingGroups) {
      const moves = new Map(
        group.lines.map((line) => [line.id, openingGame(line).moves.map((move) => move.san)]),
      )
      const base = group.lines
        .filter((line) => line.name === group.name)
        .reduce<OpeningLine | undefined>(
          (shortest, line) =>
            !shortest || moves.get(line.id)!.length < moves.get(shortest.id)!.length ? line : shortest,
          undefined,
        )
      const variations = group.lines.filter((line) => {
        const sequence = moves.get(line.id)!
        return (
          line !== base &&
          !group.lines.some((other) => {
            const continuation = moves.get(other.id)!
            return (
              other !== base &&
              other.name === line.name &&
              continuation.length > sequence.length &&
              sequence.every((move, index) => move === continuation[index])
            )
          })
        )
      })
      expect(
        group.displayLines.map((line) => line.id),
        group.name,
      ).toEqual([...(base ? [base] : []), ...variations].map((line) => line.id))
    }
  })

  it('shows Ponziani opening moves and distinct named variations', () => {
    const group = openingGroups.find((item) => item.name === 'Ponziani Opening')!
    expect(group.displayLines[0]!.pgn).toBe('1. e4 e5 2. Nf3 Nc6 3. c3')
    expect(group.displayLines.map((line) => line.name)).toContain('Ponziani Opening: Romanishin Variation')
    expect(group.displayLines.map((line) => line.name)).toContain('Ponziani Opening: Réti Variation')
    expect(group.displayLines.some((line) => line.pgn === '1. e4 e5 2. Nf3 Nc6 3. c3 Nf6')).toBe(false)
    expect(group.lines.some((line) => line.pgn === '1. e4 e5 2. Nf3 Nc6 3. c3 Nf6')).toBe(true)
  })

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
