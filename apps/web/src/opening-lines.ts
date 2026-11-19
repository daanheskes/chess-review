import { parseGame, type Color } from '@chessreview/core'
import source from '../../../data/openings.tsv?raw'
import { curatedOpenings } from './curated-openings'

export type OpeningLine = { id: string; eco: string; name: string; pgn: string; types: string[] }

function openingTypes(name: string, pgn: string): string[] {
  const types: string[] = []
  if (/\bgambit\b/i.test(name)) types.push('Gambit')
  if (/\battack\b/i.test(name)) types.push('Aggressive')
  if (
    /\bsolid\b/i.test(name) ||
    /^(Caro-Kann Defense|Slav Defense|Queen's Gambit Declined|London System)$/.test(name)
  )
    types.push('Solid')
  if (/\bpositional\b/i.test(name) || /^(English Opening|Catalan Opening|London System)$/.test(name))
    types.push('Positional')
  if (/\b(trap|tactical)\b/i.test(name)) types.push('Tactical')
  if (/\b(hypermodern|réti|reti|grünfeld|grunfeld|nimzo-indian|king's indian)\b/i.test(name))
    types.push('Hypermodern')
  if (/^1\. e4 e5(?:\s|$)/.test(pgn)) types.push('Open')
  if (/^1\. d4 d5(?:\s|$)/.test(pgn)) types.push('Closed')
  return types
}

export const openingLines: OpeningLine[] = source
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((row) => {
    const [eco, name, pgn] = row.split('\t')
    if (!eco || !name || !pgn) throw new Error('Invalid opening data')
    return { id: `${eco}\t${name}\t${pgn}`, eco, name, pgn, types: openingTypes(name, pgn) }
  })

export const curatedOpeningIds = new Set<string>()
export const curatedOpeningDescriptions = new Map<string, string>()
for (const item of curatedOpenings) {
  const id = `${item.eco}\t${item.name}\t${item.pgn}`
  if ('added' in item && item.added) {
    if (openingLines.some((line) => line.id === id)) throw new Error(`Duplicate curated line: ${item.name}`)
    openingLines.push({
      id,
      eco: item.eco,
      name: item.name,
      pgn: item.pgn,
      types: openingTypes(item.name, item.pgn),
    })
  } else if (!openingLines.some((line) => line.id === id)) {
    throw new Error(`Curated opening not found in the opening data: ${item.name}`)
  }
  if (item.name.split(/[:,]/, 1)[0] !== item.group) throw new Error(`Incorrect opening group: ${item.name}`)
  curatedOpeningIds.add(id)
  curatedOpeningDescriptions.set(id, item.description)
}

const groups = new Map<string, OpeningLine[]>()
for (const line of openingLines) {
  const name = line.name.split(/[:,]/, 1)[0]!.trim()
  const lines = groups.get(name)
  if (lines) lines.push(line)
  else groups.set(name, [line])
}

export function displayOpeningLines(lines: OpeningLine[], groupName: string): OpeningLine[] {
  const moveCount = (line: OpeningLine) =>
    line.pgn.split(/\s+/).filter((token) => !/^\d+\.$/.test(token)).length
  const base = lines
    .filter((line) => line.name === groupName)
    .reduce<OpeningLine | undefined>(
      (shortest, line) => (!shortest || moveCount(line) < moveCount(shortest) ? line : shortest),
      undefined,
    )
  const variations = lines.filter(
    (line) =>
      line !== base &&
      !lines.some(
        (other) =>
          other !== base &&
          other.id !== line.id &&
          other.name === line.name &&
          other.pgn.startsWith(`${line.pgn} `),
      ),
  )
  return base ? [base, ...variations] : variations
}

export const openingGroups = [...groups]
  .map(([name, lines]) => {
    lines.sort((a, b) => Number(curatedOpeningIds.has(b.id)) - Number(curatedOpeningIds.has(a.id)))
    return { name, lines, displayLines: displayOpeningLines(lines, name) }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

export function groupLinesByName(lines: OpeningLine[]): OpeningLine[][] {
  const grouped = new Map<string, OpeningLine[]>()
  for (const line of lines) {
    const sameName = grouped.get(line.name)
    if (sameName) sameName.push(line)
    else grouped.set(line.name, [line])
  }
  return [...grouped.values()]
}

export function openingSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function openingLineSlug(line: OpeningLine): string {
  let hash = 2166136261
  for (const character of line.id) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  return `${openingSlug(line.name)}-${(hash >>> 0).toString(36)}`
}

for (const group of openingGroups) {
  if (new Set(group.lines.map(openingLineSlug)).size !== group.lines.length)
    throw new Error(`Opening line URL collision in ${group.name}`)
}
if (new Set(openingGroups.map((group) => openingSlug(group.name))).size !== openingGroups.length)
  throw new Error('Opening group URL collision')

export const recommendedGroups = {
  w: [
    'Italian Game',
    'Ruy Lopez',
    'Ponziani Opening',
    'Scotch Game',
    'English Opening',
    'London System',
    "Queen's Gambit",
    'Réti Opening',
  ],
  b: [
    'Scandinavian Defense',
    'Caro-Kann Defense',
    'Sicilian Defense',
    'French Defense',
    "King's Indian Defense",
    "Queen's Gambit Declined",
    'Slav Defense',
    'Nimzo-Indian Defense',
  ],
} as const

type OpeningProfile = {
  level: 'Beginner' | 'Club' | 'Expert'
  style: 'Solid' | 'Aggressive'
  description: string
}

export const openingProfiles: Record<string, OpeningProfile> = {
  'Italian Game': {
    level: 'Beginner',
    style: 'Aggressive',
    description: 'Develop the bishop towards f7 and look for chances in the centre.',
  },
  'Ruy Lopez': {
    level: 'Club',
    style: 'Solid',
    description: 'Put pressure on the knight defending e5 and develop with long-term plans.',
  },
  'Ponziani Opening': {
    level: 'Club',
    style: 'Aggressive',
    description: 'Prepare an early d4 and challenge Black for the centre.',
  },
  'Scotch Game': {
    level: 'Beginner',
    style: 'Aggressive',
    description: 'Open the centre early with d4 and develop actively.',
  },
  'English Opening': {
    level: 'Expert',
    style: 'Solid',
    description: 'Influence the centre from the flank with an early c4.',
  },
  'London System': {
    level: 'Beginner',
    style: 'Solid',
    description: 'Develop the bishop outside the pawn chain and build a dependable setup.',
  },
  "Queen's Gambit": {
    level: 'Club',
    style: 'Solid',
    description: 'Challenge the d5 pawn with c4 and fight for central space.',
  },
  'Réti Opening': {
    level: 'Expert',
    style: 'Solid',
    description: 'Start with Nf3 and keep the central pawn structure flexible.',
  },
  'Scandinavian Defense': {
    level: 'Beginner',
    style: 'Solid',
    description: 'Challenge the e4 pawn immediately with d5.',
  },
  'Caro-Kann Defense': {
    level: 'Beginner',
    style: 'Solid',
    description: 'Prepare d5 with c6 while keeping the light-squared bishop available.',
  },
  'Sicilian Defense': {
    level: 'Expert',
    style: 'Aggressive',
    description: 'Answer e4 with c5 and create an unbalanced fight for the centre.',
  },
  'French Defense': {
    level: 'Club',
    style: 'Solid',
    description: 'Build a central pawn chain and challenge White’s centre with c5.',
  },
  "King's Indian Defense": {
    level: 'Expert',
    style: 'Aggressive',
    description: 'Allow White central space and prepare a counterattack.',
  },
  "Queen's Gambit Declined": {
    level: 'Club',
    style: 'Solid',
    description: 'Support d5 with e6 and develop behind a strong centre.',
  },
  'Slav Defense': {
    level: 'Club',
    style: 'Solid',
    description: 'Defend d5 with c6 without blocking the light-squared bishop.',
  },
  'Nimzo-Indian Defense': {
    level: 'Expert',
    style: 'Solid',
    description: 'Pin the c3 knight and contest control of e4.',
  },
}

for (const names of Object.values(recommendedGroups)) {
  for (const name of names) {
    if (!groups.has(name)) throw new Error(`Recommended opening not found: ${name}`)
    if (!openingProfiles[name]) throw new Error(`Recommended opening profile not found: ${name}`)
  }
}

export function openingGame(line: OpeningLine) {
  return parseGame(line.pgn)
}

export function firstOpeningPiece(name: string, side: Color) {
  const group = openingGroups.find((item) => item.name === name)
  if (!group) throw new Error(`Opening not found: ${name}`)
  const prefix = `${group.lines[0]!.pgn} `
  const continuations = openingLines.filter((line) => line.pgn.startsWith(prefix))
  const candidates = [
    ...group.lines,
    ...continuations.filter((line) => curatedOpeningIds.has(line.id)),
    ...continuations,
  ]
  for (const line of candidates) {
    if (!/(?:^|\s)[KQRBN][a-h1-8x]/.test(line.pgn)) continue
    const move = openingGame(line).moves.find((item) => item.color === side && /^[KQRBN]/.test(item.san))
    if (move) return { line, move }
  }
  throw new Error(`No example ${side === 'w' ? 'white' : 'black'} piece move found for opening: ${name}`)
}
