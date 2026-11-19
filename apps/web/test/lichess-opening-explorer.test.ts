import { describe, expect, it, vi } from 'vitest'
import { sanOf } from '@chessreview/core'
import { explore, fenOf, play } from '../src/explore'
import {
  fetchOpeningMove,
  LichessExplorerError,
  ratingGroupForLevel,
  type ExplorerLevel,
} from '../src/services/lichess-opening-explorer'

describe('Lichess opening explorer', () => {
  it('maps training levels to documented rating groups', () => {
    expect(([4, 5, 6, 7, 8, 9, 10, 11, 12] as ExplorerLevel[]).map(ratingGroupForLevel)).toEqual([
      0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500,
    ])
  })

  it('requests all rapid moves for the selected rating group', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ moves: [{ uci: 'e7e5', san: 'e5', white: 4, draws: 2, black: 4 }] }), {
        status: 200,
      }),
    )
    await expect(
      fetchOpeningMove(
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        1400,
        'token',
        undefined,
        fetchImpl,
      ),
    ).resolves.toEqual({ uci: 'e7e5', san: 'e5' })

    const [request, options] = fetchImpl.mock.calls[0]!
    const url = request instanceof Request ? request.url : String(request)
    const query = new URL(url).searchParams
    expect(query.get('speeds')).toBe('rapid')
    expect(query.get('ratings')).toBe('1400')
    expect(query.get('moves')).toBe('256')
    expect(query.get('topGames')).toBe('0')
    expect(query.get('recentGames')).toBe('0')
    expect(options?.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer token' })
  })

  it('returns no move when Lichess has no games in the selected group', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"moves":[]}', { status: 200 }))
    await expect(fetchOpeningMove('fen', 0, 'token', undefined, fetchImpl)).resolves.toBeNull()
  })

  it.each([
    ['w', 'e1h1', 'e1g1', 'O-O'],
    ['w', 'e1a1', 'e1c1', 'O-O-O'],
    ['b', 'e8h8', 'e8g8', 'O-O'],
    ['b', 'e8a8', 'e8c8', 'O-O-O'],
  ])('converts and plays %s castling from Explorer UCI %s', async (turn, explorerUci, uci, san) => {
    const fen = `r3k2r/8/8/8/8/8/8/R3K2R ${turn} KQkq - 0 1`
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ moves: [{ uci: explorerUci, san, white: 1, draws: 0, black: 0 }] })),
      )
    const move = await fetchOpeningMove(fen, 0, 'token', undefined, fetchImpl)
    expect(move).toEqual({ uci, san })
    const next = play(explore(fen), uci.slice(0, 2), uci.slice(2, 4))
    expect(next).not.toBeNull()
    expect(sanOf(fen, uci)).toBe(san)
    expect(fenOf(next!)).not.toBe(fen)
  })

  it('does not convert an unrelated king-to-rook move', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ moves: [{ uci: 'e1h1', san: 'Kh1', white: 1, draws: 0, black: 0 }] })),
      )
    await expect(fetchOpeningMove('fen', 0, 'token', undefined, fetchImpl)).resolves.toEqual({
      uci: 'e1h1',
      san: 'Kh1',
    })
  })

  it('excludes moves below 5%, includes exactly 5%, and weights the remainder by frequency', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            moves: [
              { uci: 'e7e5', san: 'e5', white: 60, draws: 10, black: 21 },
              { uci: 'c7c5', san: 'c5', white: 3, draws: 1, black: 1 },
              { uci: 'e7e6', san: 'e6', white: 2, draws: 1, black: 1 },
            ],
          }),
        ),
    )
    const select = (sample: number) => fetchOpeningMove('fen', 0, 'token', undefined, fetchImpl, () => sample)
    await expect(select(0)).resolves.toEqual({ uci: 'e7e5', san: 'e5' })
    await expect(select(90.99 / 96)).resolves.toEqual({ uci: 'e7e5', san: 'e5' })
    await expect(select(91 / 96)).resolves.toEqual({ uci: 'c7c5', san: 'c5' })
    await expect(select(0.99999)).resolves.toEqual({ uci: 'c7c5', san: 'c5' })
  })

  it('rejects malformed or zero move counts instead of choosing a move', async () => {
    for (const counts of [
      { white: 0, draws: 0, black: 0 },
      { white: -1, draws: 1, black: 1 },
      { white: 1 },
    ]) {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ moves: [{ uci: 'e7e5', san: 'e5', ...counts }] })))
      await expect(fetchOpeningMove('fen', 0, 'token', undefined, fetchImpl)).rejects.toMatchObject({
        kind: 'invalid-response',
      })
    }
  })

  it('surfaces authentication and rate-limit failures instead of substituting moves', async () => {
    for (const [status, kind] of [
      [401, 'unauthorized'],
      [429, 'rate-limited'],
    ] as const) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }))
      await expect(fetchOpeningMove('fen', 0, 'token', undefined, fetchImpl)).rejects.toMatchObject({
        name: LichessExplorerError.name,
        kind,
      })
    }
  })
})
