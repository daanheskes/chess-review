import { expect, test, type Page } from '@playwright/test'

const GAME =
  '[White "Morphy"]\n[Black "Saint Brie"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0'

const PUZZLE = {
  id: 'morphy|test-position',
  player: 'morphy',
  gameId: 'game',
  opponent: 'Saint Brie',
  date: '2026-10-01',
  tactic: 'pin',
  perspective: undefined,
  checkedWith: { depth: 18, nodes: 3_000_000 },
  puzzle: {
    moveIndex: 6,
    fen: 'r1bqkbnr/ppp2ppp/2np4/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4',
    color: 'w',
    solution: 'h5f7',
    solutionSan: 'Qxf7#',
    line: ['h5f7'],
    playedUci: 'g1f3',
    playedSan: 'Nf3',
    label: 'Miss',
    loss: 31,
    winBefore: 80,
    phase: 'opening',
    bestWin: 100,
    gap: 25,
  },
  progress: { box: 0, due: 0, attempts: 0, solved: 0, lastAt: null },
}

async function importGame(page: Page) {
  await page.goto('/')
  await page.getByText('Paste a PGN instead').click()
  await page.getByLabel('PGN').fill(GAME)
  await page.getByRole('button', { name: 'Review PGN' }).click()
  await expect(page.locator('.review')).toBeVisible()
}

async function withPuzzle(page: Page) {
  await importGame(page)
  await page.evaluate(
    (record) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('chessreview')
        open.onerror = () => reject(open.error ?? new Error('could not open the database'))
        open.onsuccess = () => {
          const tx = open.result.transaction('puzzles', 'readwrite')
          tx.objectStore('puzzles').put(record)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error ?? new Error('could not save the puzzle'))
        }
      }),
    PUZZLE,
  )
}

test('places accuracy after game details and before the rest on narrow reviews', async ({ page }) => {
  await importGame(page)

  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.locator('.hint-desktop')).toContainText(
    'Right-click a square to highlight it; right-drag to draw an arrow.',
  )
  await expect(page.locator('.shortcuts')).toBeVisible()
  const desktop = await page.evaluate(() => ({
    boardLeft: document.querySelector('.boardcol')!.getBoundingClientRect().left,
    summaryLeft: document.querySelector('.summary')!.getBoundingClientRect().left,
  }))
  expect(desktop.summaryLeft).toBeGreaterThan(desktop.boardLeft)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.hint-mobile')).toHaveText('Long-tap a square to highlight it')
  await expect(page.locator('.hint-desktop')).toBeHidden()
  await expect(page.locator('.shortcuts')).toBeHidden()
  const mobile = await page.evaluate(() => ({
    titleBottom: document.querySelector('.title')!.getBoundingClientRect().bottom,
    summaryTop: document.querySelector('.summary')!.getBoundingClientRect().top,
    summaryBottom: document.querySelector('.summary')!.getBoundingClientRect().bottom,
    boardTop: document.querySelector('.boardcol')!.getBoundingClientRect().top,
    boardBottom: document.querySelector('.boardcol')!.getBoundingClientRect().bottom,
    panelTop: document.querySelector('.panel')!.getBoundingClientRect().top,
  }))
  expect(mobile.titleBottom).toBeLessThan(mobile.summaryTop)
  expect(mobile.summaryBottom).toBeLessThan(mobile.boardTop)
  expect(mobile.boardTop - mobile.summaryBottom).toBeLessThan(32)
  expect(mobile.boardBottom).toBeLessThan(mobile.panelTop)
})

test('keeps analysis navigation icon-only and does not scroll when solving', async ({ page }) => {
  await withPuzzle(page)
  await page.goto('/#/train')
  await page.getByLabel('Your move').fill('Qxf7#')
  const scrollBefore = await page.evaluate(() => window.scrollY)

  await page.getByRole('button', { name: 'Check' }).click()

  await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore)

  await page.getByRole('button', { name: 'Analyze puzzle' }).click()
  const navigation = page.getByRole('group', { name: 'Move through analysis' })
  for (const label of ['Start', 'Previous move', 'Next move', 'End']) {
    const button = navigation.getByRole('button', { name: label })
    await expect(button).toHaveClass('icon')
    await expect(button.locator('svg')).toHaveCount(1)
    await expect(button).toHaveText('')
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(navigation.getByRole('button', { name: 'Start' })).toBeHidden()
  await expect(navigation.getByRole('button', { name: 'End' })).toBeHidden()
  await expect(navigation.getByRole('button', { name: 'Previous move' })).toBeVisible()
  await expect(navigation.getByRole('button', { name: 'Next move' })).toBeVisible()
})

test('keeps review controls compact on mobile and offers a way back from exploration', async ({ page }) => {
  await importGame(page)
  await page.setViewportSize({ width: 390, height: 844 })

  const navigation = page.getByRole('group', { name: 'Move through the game' })
  await expect(navigation.getByRole('button', { name: 'Start' })).toBeHidden()
  await expect(navigation.getByRole('button', { name: 'End' })).toBeHidden()
  await expect(navigation.getByRole('button', { name: 'Previous move' })).toBeVisible()
  await expect(navigation.getByRole('button', { name: 'Next move' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Explore' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Flip board' })).toBeVisible()
  await expect(page.locator('.hint-mobile')).toHaveText('Long-tap a square to highlight it')
  await expect(page.locator('.shortcuts')).toBeHidden()

  const board = await page.locator('.board > div').boundingBox()
  if (!board) throw new Error('Review board is not visible')
  await page.mouse.click(board.x + (4.5 / 8) * board.width, board.y + (6.5 / 8) * board.height)
  await page.mouse.click(board.x + (4.5 / 8) * board.width, board.y + (4.5 / 8) * board.height)

  await expect(page.getByRole('heading', { name: 'Exploring' })).toBeVisible()
  await expect(page.locator('.hint-mobile')).toHaveText('Long-tap a square to highlight it')
  await expect(page.locator('.mobile-explore-back')).toBeVisible()
  await expect(page.locator('.mobile-explore-back')).toHaveText('Back to the game')
  await expect(page.getByRole('button', { name: 'Back to the game' })).toHaveCount(2)
  await page.locator('.mobile-explore-back').click()
  await expect(page.getByRole('heading', { name: 'Exploring' })).toBeHidden()
})
