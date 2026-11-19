import { ChessComError, fetchMonth } from './chesscom'
import { LichessError } from './lichess'

export type ReviewPlatform = 'chesscom' | 'lichess'

export function gameIdFromUrl(platform: ReviewPlatform, value: string): string | null {
  try {
    const url = new URL(value)
    if (platform === 'chesscom') {
      if (url.hostname !== 'www.chess.com' && url.hostname !== 'chess.com') return null
      return url.pathname.match(/^\/game\/(?:live|daily)\/(\d+)\/?$/)?.[1] ?? null
    }
    if (url.hostname !== 'lichess.org') return null
    return url.pathname.match(/^\/([A-Za-z0-9]{8,12})\/?$/)?.[1] ?? null
  } catch {
    return null
  }
}

export async function fetchSharedGame(
  platform: ReviewPlatform,
  game: string,
  user: string,
  month: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (platform === 'chesscom') {
    if (!/^\d+$/.test(game) || !month || !/^\d{4}\/(0[1-9]|1[0-2])$/.test(month))
      throw new ChessComError('not-found', 'This shared chess.com game link is invalid.')
    const games = await fetchMonth(user, month, fetchImpl)
    const match = games.find((candidate) => gameIdFromUrl('chesscom', candidate.url) === game)
    if (!match)
      throw new ChessComError('not-found', `Couldn’t find that game in ${user}’s chess.com archive.`)
    return match.pgn
  }

  if (!/^[A-Za-z0-9]{8,12}$/.test(game))
    throw new LichessError('not-found', 'This shared Lichess game link is invalid.')
  let response: Response
  try {
    response = await fetchImpl(`https://lichess.org/game/export/${encodeURIComponent(game)}`, {
      headers: { Accept: 'application/x-chess-pgn' },
      cache: 'no-cache',
    })
  } catch {
    throw new LichessError('network', 'Couldn’t reach Lichess. Check your connection.')
  }
  if (response.status === 404) throw new LichessError('not-found', 'Lichess could not find that game.')
  if (response.status === 429)
    throw new LichessError('rate-limited', 'Lichess asked us to slow down. Try again in a minute.')
  if (!response.ok) throw new LichessError('unavailable', 'Lichess isn’t responding. Try again in a moment.')
  const pgn = await response.text()
  if (!pgn.trim()) throw new LichessError('unavailable', 'Lichess returned an empty game.')
  return pgn
}
