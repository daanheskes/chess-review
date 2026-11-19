import { reviewKey, settingsFor } from '@chessreview/core'
import { expect, test } from '@playwright/test'

test('loads and reviews a game opened from a shared Lichess link', async ({ page }) => {
  const pgn = '[Event "Shared game"]\n[White "Alice"]\n[Black "Bob"]\n[Result "*"]\n\n1. e4 e5 *'
  const id = await reviewKey(pgn, settingsFor('quick', 'stockfish-19-lite-single'))
  await page.route('https://lichess.org/game/export/AbCd1234', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' },
      body: pgn,
    }),
  )

  await page.goto(`/#/review/${id}?u=Alice&platform=lichess&depth=quick&game=AbCd1234`)

  await expect(page.getByRole('heading', { name: 'Analysing' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText(/Step \d+ of \d+/)
  await expect(page.getByRole('heading', { name: 'Alice vs Bob' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy share link' })).toBeVisible()
  expect(page.url()).toContain(`/review/${id}?u=Alice&platform=lichess&depth=quick&game=AbCd1234`)
})
