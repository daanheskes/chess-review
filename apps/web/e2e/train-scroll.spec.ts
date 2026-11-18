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
    context: {
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 2 3',
      uci: 'd7d6',
      san: 'd6',
    },
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

const COMPLETED_PUZZLE = {
  ...PUZZLE,
  progress: { box: 1, due: Date.now() + 86_400_000, attempts: 1, solved: 1, lastAt: Date.now() },
}

async function importGame(page: Page) {
  await page.goto('/')
  await page.getByText('Paste a PGN instead').click()
  await page.getByLabel('PGN').fill(GAME)
  await page.getByRole('button', { name: 'Review PGN' }).click()
  await expect(page.locator('.review')).toBeVisible()
}

async function withPuzzle(page: Page, record: typeof PUZZLE | typeof COMPLETED_PUZZLE = PUZZLE) {
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
    record,
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
  await expect(page.getByRole('tab', { name: 'New puzzles' })).toHaveAttribute('aria-selected', 'true')
  const board = page.getByRole('group', { name: 'Board, Black to move' })
  await expect(board).toBeVisible()
  await expect(page.getByRole('heading', { name: "Opponent's last move: d6" })).toBeVisible()
  await expect(page.getByLabel('Your move')).toBeDisabled()
  await expect(page.getByRole('group', { name: 'Board, White to move' })).toBeVisible()
  await expect(page.getByLabel('Your move')).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Black pawn, d6' }).locator('xpath=..')).toHaveCSS(
    'background-color',
    'rgb(201, 183, 76)',
  )
  const highlightedSquares = await page
    .locator('.board')
    .evaluate(
      (board) =>
        [...board.querySelectorAll<HTMLElement>('*')].filter(
          (element) =>
            element.style.backgroundColor === 'rgb(201, 183, 76)' ||
            element.style.backgroundColor === 'rgb(241, 226, 124)',
        ).length,
    )
  expect(highlightedSquares).toBe(2)
  await expect(page.getByRole('tab', { name: 'Puzzle category' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Misses' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Positional mistakes' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Opening misses' })).toHaveCount(0)
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

test('opens a completed puzzle so it can be solved again', async ({ page }) => {
  await withPuzzle(page, COMPLETED_PUZZLE)
  await page.goto('/#/train')

  const completed = page.getByRole('tab', { name: 'Completed puzzles' })
  await expect(page.getByRole('tab', { name: 'New puzzles' })).toHaveAttribute('aria-selected', 'true')
  await completed.click()
  await expect(completed).toHaveAttribute('aria-selected', 'true')

  const redo = page.getByRole('button', { name: 'Redo puzzle: Qxf7# against Saint Brie' })
  await expect(redo).toBeVisible()
  await redo.click()
  await page.getByLabel('Your move').fill('Qxf7#')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to completed list' }).click()
  await expect(page.locator('.completed-puzzle-progress')).toContainText('2 correct of 2 attempts')
})

test('Practice opens recent mistakes and navigates each position once', async ({ page }) => {
  await importGame(page)
  await page.goto('/#/insights')
  await page.getByLabel('Player').selectOption('Saint Brie')
  await expect(page.getByRole('heading', { name: 'What your mistakes had in common' })).toBeVisible()

  const practice = page.getByRole('link', { name: /Practice/ }).first()
  await expect(practice).toHaveAttribute('href', /tab=mistakes/)
  await practice.click()
  await expect(page.getByRole('tab', { name: 'Mistakes' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('1 of 1', { exact: true })).toBeVisible()
  await expect(page.locator('.mistake-queue')).toContainText('Bxd1')

  await page.goto('/#/train?tab=mistakes&u=Saint%20Brie')
  await expect(page.getByText('1 of 2', { exact: true })).toBeVisible()
  const board = page.locator('.embedded-review .board')
  const newestPosition = await board.getAttribute('aria-label')
  const navigation = page.getByRole('navigation', { name: 'Mistake position navigation' })
  const next = navigation.getByRole('button', { name: 'Next position' })
  await expect(next).toBeEnabled()
  await next.click()
  await expect(page.getByText('2 of 2', { exact: true })).toBeVisible()
  await expect(page.locator('.mistake-queue')).toContainText('g6')
  await expect(next).toBeDisabled()
  await expect(board).not.toHaveAttribute('aria-label', newestPosition!)
  await expect(navigation.getByRole('button', { name: 'Previous position' })).toBeEnabled()

  await page.getByRole('button', { name: 'g6, Mistake' }).click()
  await page.getByRole('list', { name: 'Best line' }).getByRole('button').first().click()
  await expect(page.getByRole('heading', { name: 'Exploring' })).toBeVisible()
  await expect(page.locator('.explore-eval')).toContainText(/depth \d+/, { timeout: 30_000 })
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
