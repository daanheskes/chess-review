import { describe, expect, it, vi } from 'vitest'
import { fetchSharedGame, gameIdFromUrl } from '../src/services/shared-game'

describe('shared game links', () => {
  it('extracts provider game ids only from supported game URLs', () => {
    expect(gameIdFromUrl('chesscom', 'https://www.chess.com/game/live/123456')).toBe('123456')
    expect(gameIdFromUrl('lichess', 'https://lichess.org/AbCd1234')).toBe('AbCd1234')
    expect(gameIdFromUrl('lichess', 'https://example.org/AbCd1234')).toBeNull()
  })

  it('loads a chess.com game from the specified player archive month', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          games: [
            {
              url: 'https://www.chess.com/game/live/123456',
              pgn: '[Event "Shared game"]\n\n1. e4 e5 *',
              rules: 'chess',
              time_class: 'rapid',
              end_time: 1,
              white: { username: 'Player', result: 'win' },
              black: { username: 'Opponent', result: 'checkmated' },
            },
          ],
        }),
        { status: 200 },
      ),
    )

    await expect(fetchSharedGame('chesscom', '123456', 'Player', '2025/03', fetchImpl)).resolves.toContain(
      '1. e4 e5',
    )
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('/player/player/games/2025/03')
  })

  it('loads a Lichess game by its game id', async () => {
    const pgn = '[Event "Shared game"]\n\n1. d4 d5 *'
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(pgn, { status: 200 }))

    await expect(fetchSharedGame('lichess', 'AbCd1234', 'Player', null, fetchImpl)).resolves.toBe(pgn)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://lichess.org/game/export/AbCd1234')
  })
})
