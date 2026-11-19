const CLIENT_ID = 'chess-review-cjo.pages.dev'
const TOKEN_KEY = 'chessreview.lichess-token'
const PENDING_KEY = 'chessreview.lichess-oauth'

interface PendingLogin {
  state: string
  verifier: string
  returnTo: string
}

interface TokenResponse {
  access_token?: unknown
}

export class LichessAuthError extends Error {
  override name = 'LichessAuthError'
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return base64Url(bytes)
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

function session(): Storage {
  try {
    return window.sessionStorage
  } catch {
    throw new LichessAuthError('Browser session storage is unavailable; Lichess login cannot continue.')
  }
}

export function getLichessToken(): string | null {
  return session().getItem(TOKEN_KEY)
}

export function clearLichessToken(): void {
  session().removeItem(TOKEN_KEY)
}

export async function beginLichessLogin(): Promise<void> {
  const verifier = randomToken()
  const state = randomToken()
  const url = new URL(window.location.href)
  const pending: PendingLogin = {
    state,
    verifier,
    returnTo: `${url.pathname}${url.search}${url.hash}`,
  }
  session().setItem(PENDING_KEY, JSON.stringify(pending))

  const challenge = await challengeFor(verifier)
  const authorization = new URL('https://lichess.org/oauth')
  authorization.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: `${url.origin}${url.pathname}`,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  }).toString()
  window.location.assign(authorization)
}

function restoreUrl(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) return
  window.history.replaceState(null, '', path)
}

/** Completes a Lichess PKCE redirect before React mounts, keeping the code out of the app URL. */
export async function finishLichessLogin(fetchImpl: typeof fetch = fetch): Promise<void> {
  const callback = new URL(window.location.href)
  const code = callback.searchParams.get('code')
  const oauthError = callback.searchParams.get('error')
  if (!code && !oauthError) return

  const storage = session()
  const rawPending = storage.getItem(PENDING_KEY)
  storage.removeItem(PENDING_KEY)
  let pending: PendingLogin | null = null
  try {
    const parsed: unknown = rawPending ? JSON.parse(rawPending) : null
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'state' in parsed &&
      typeof parsed.state === 'string' &&
      'verifier' in parsed &&
      typeof parsed.verifier === 'string' &&
      'returnTo' in parsed &&
      typeof parsed.returnTo === 'string'
    )
      pending = parsed as PendingLogin
  } catch {
    pending = null
  }

  if (!pending) {
    restoreUrl(callback.pathname)
    throw new LichessAuthError('Lichess login could not be verified. Start the connection again.')
  }
  restoreUrl(pending.returnTo)

  if (oauthError) throw new LichessAuthError('Lichess login was cancelled or denied.')
  if (callback.searchParams.get('state') !== pending.state)
    throw new LichessAuthError('Lichess login could not be verified. Start the connection again.')
  if (!code) throw new LichessAuthError('Lichess did not return an authorization code.')

  let response: Response
  try {
    response = await fetchImpl('https://lichess.org/api/token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        redirect_uri: `${callback.origin}${callback.pathname}`,
        code_verifier: pending.verifier,
      }),
    })
  } catch {
    throw new LichessAuthError('Could not reach Lichess to finish login. Check your connection.')
  }
  if (!response.ok) throw new LichessAuthError(`Lichess login failed (HTTP ${response.status}).`)

  const body: unknown = await response.json()
  const token = (body as TokenResponse | null)?.access_token
  if (typeof token !== 'string' || !token)
    throw new LichessAuthError('Lichess returned an invalid login response.')
  storage.setItem(TOKEN_KEY, token)
}
