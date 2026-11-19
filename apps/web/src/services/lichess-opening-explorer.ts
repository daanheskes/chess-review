export const OPENING_RATING_GROUPS = {
  4: 0,
  5: 1000,
  6: 1200,
  7: 1400,
  8: 1600,
  9: 1800,
  10: 2000,
  11: 2200,
  12: 2500,
} as const

export type ExplorerLevel = keyof typeof OPENING_RATING_GROUPS

export interface ExplorerMove {
  uci: string
  san: string
}

interface ExplorerResponse {
  moves?: unknown
}

export class LichessExplorerError extends Error {
  override name = 'LichessExplorerError'
  constructor(
    readonly kind: 'network' | 'unauthorized' | 'rate-limited' | 'unavailable' | 'invalid-response',
    message: string,
  ) {
    super(message)
  }
}

export function ratingGroupForLevel(level: ExplorerLevel): number {
  return OPENING_RATING_GROUPS[level]
}

export async function fetchOpeningMove(
  fen: string,
  rating: number,
  token: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  random: () => number = Math.random,
): Promise<ExplorerMove | null> {
  const query = new URLSearchParams({
    variant: 'standard',
    speeds: 'rapid',
    ratings: String(rating),
    fen,
    moves: '256',
    topGames: '0',
    recentGames: '0',
  })
  let response: Response
  try {
    response = await fetchImpl(`https://explorer.lichess.org/lichess?${query}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new LichessExplorerError('network', 'Could not reach Lichess Opening Explorer.')
  }
  if (response.status === 401)
    throw new LichessExplorerError(
      'unauthorized',
      'Lichess disconnected this session. Connect again to continue.',
    )
  if (response.status === 429)
    throw new LichessExplorerError('rate-limited', 'Lichess asked us to slow down. Try again in a minute.')
  if (!response.ok)
    throw new LichessExplorerError(
      'unavailable',
      `Lichess Opening Explorer returned HTTP ${response.status}.`,
    )

  let raw: unknown
  try {
    raw = await response.json()
  } catch {
    throw new LichessExplorerError(
      'invalid-response',
      'Lichess returned an invalid Opening Explorer response.',
    )
  }
  const moves =
    typeof raw === 'object' && raw !== null && 'moves' in raw ? (raw as ExplorerResponse).moves : undefined
  if (!Array.isArray(moves))
    throw new LichessExplorerError(
      'invalid-response',
      'Lichess returned an invalid Opening Explorer response.',
    )
  if (moves.length === 0) return null

  const counted = moves.map((move: unknown) => {
    if (
      typeof move !== 'object' ||
      move === null ||
      !('uci' in move) ||
      typeof move.uci !== 'string' ||
      !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move.uci) ||
      !('san' in move) ||
      typeof move.san !== 'string' ||
      !('white' in move) ||
      !('draws' in move) ||
      !('black' in move) ||
      ![move.white, move.draws, move.black].every(
        (count) => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0,
      )
    )
      throw new LichessExplorerError('invalid-response', 'Lichess returned an invalid opening move.')
    return {
      uci: move.uci,
      san: move.san,
      count: Number(move.white) + Number(move.draws) + Number(move.black),
    }
  })
  const total = counted.reduce((sum, move) => sum + move.count, 0)
  if (!Number.isSafeInteger(total) || total === 0)
    throw new LichessExplorerError('invalid-response', 'Lichess returned invalid opening move counts.')
  const eligible = counted.filter((move) => move.count * 20 >= total)
  const eligibleTotal = eligible.reduce((sum, move) => sum + move.count, 0)
  let choice = random() * eligibleTotal
  for (const move of eligible) {
    if (choice < move.count) return { uci: move.uci, san: move.san }
    choice -= move.count
  }
  throw new LichessExplorerError('invalid-response', 'Could not select a Lichess opening move.')
}
