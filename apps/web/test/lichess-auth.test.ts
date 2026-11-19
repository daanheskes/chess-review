import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginLichessLogin, finishLichessLogin, getLichessToken } from '../src/services/lichess-auth'

function installWindow(href: string) {
  const values = new Map<string, string>()
  const location = {
    href,
    origin: new URL(href).origin,
    pathname: new URL(href).pathname,
    search: new URL(href).search,
    hash: new URL(href).hash,
    assign: vi.fn(),
  }
  const windowMock = {
    location,
    history: { replaceState: vi.fn() },
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  }
  vi.stubGlobal('window', windowMock)
  return { values, windowMock }
}

describe('Lichess OAuth PKCE', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('starts a state-checked PKCE authorization without embedding a secret', async () => {
    const { values, windowMock } = installWindow('https://chess-review-cjo.pages.dev/#/openings')
    await beginLichessLogin()

    const [target] = windowMock.location.assign.mock.calls[0]!
    const authorization = new URL(String(target))
    const pending = JSON.parse(values.get('chessreview.lichess-oauth')!)
    expect(authorization.origin + authorization.pathname).toBe('https://lichess.org/oauth')
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorization.searchParams.get('code_challenge')).toBeTruthy()
    expect(authorization.searchParams.get('state')).toBe(pending.state)
    expect(authorization.searchParams.has('client_secret')).toBe(false)
  })

  it('exchanges a validated callback and stores the token only in the current tab', async () => {
    const { values, windowMock } = installWindow(
      'https://chess-review-cjo.pages.dev/?code=one-time-code&state=state-1',
    )
    values.set(
      'chessreview.lichess-oauth',
      JSON.stringify({
        state: 'state-1',
        verifier: 'pkce-verifier',
        returnTo: '/#/openings/sicilian-defense',
      }),
    )
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"access_token":"tab-token"}', { status: 200 }))

    await finishLichessLogin(fetchImpl)

    expect(getLichessToken()).toBe('tab-token')
    expect(values.has('chessreview.lichess-oauth')).toBe(false)
    expect(windowMock.history.replaceState).toHaveBeenCalledWith(null, '', '/#/openings/sicilian-defense')
    const [, options] = fetchImpl.mock.calls[0]!
    expect(options?.method).toBe('POST')
    expect(options?.body).toBeInstanceOf(URLSearchParams)
    if (options?.body instanceof URLSearchParams)
      expect(options.body.get('code_verifier')).toBe('pkce-verifier')
  })

  it('rejects a callback with a mismatched state before exchanging its code', async () => {
    const { values } = installWindow('https://chess-review-cjo.pages.dev/?code=code&state=wrong')
    values.set(
      'chessreview.lichess-oauth',
      JSON.stringify({ state: 'expected', verifier: 'verifier', returnTo: '/#/openings' }),
    )
    const fetchImpl = vi.fn<typeof fetch>()

    await expect(finishLichessLogin(fetchImpl)).rejects.toThrow('could not be verified')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
