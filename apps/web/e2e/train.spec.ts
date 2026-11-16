import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const GAME =
  '[White "Morphy"]\n[Black "Saint Brie"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0'

// After 1. e4 e5 2. Bc4 Nc6 3. Qh5 d6, White has Qxf7# and, in the game, played Nf3 instead.
const PUZZLE = {
  id: 'morphy|test-position',
  player: 'morphy',
  gameId: 'game',
  opponent: 'Saint Brie',
  date: '2026-10-01',
  tactic: 'pin' as string | null,
  perspective: undefined as 'allowed' | 'missed' | null | undefined,
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

const LINE_PUZZLE = {
  ...PUZZLE,
  puzzle: {
    ...PUZZLE.puzzle,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    solution: 'e2e4',
    solutionSan: 'e4',
    line: ['e2e4', 'd7d5', 'e4d5', 'd8d5'],
    playedUci: 'd2d4',
    playedSan: 'd4',
  },
}

const LONG_LINE_PUZZLE = {
  ...LINE_PUZZLE,
  puzzle: {
    ...LINE_PUZZLE.puzzle,
    line: [
      'e2e4',
      'e7e5',
      'g1f3',
      'b8c6',
      'f1b5',
      'a7a6',
      'b5a4',
      'g8f6',
      'e1g1',
      'f8e7',
      'f1e1',
      'b7b5',
      'a4b3',
      'd7d6',
      'c2c3',
    ],
  },
}

const POSITIONAL_PUZZLE = {
  ...LINE_PUZZLE,
  id: 'morphy|positional',
  opponent: 'Positional sample',
  tactic: null,
  puzzle: {
    ...LINE_PUZZLE.puzzle,
    loss: 28,
    winBefore: 60,
    phase: 'middlegame',
    cpLoss: 40,
    gambit: false,
  },
}

const OPENING_MISS = {
  ...PUZZLE,
  id: 'morphy|opening-miss',
  opponent: 'Opening sample',
  puzzle: { ...PUZZLE.puzzle, cpLoss: 101, gambit: false },
}

const COMPLETED_PUZZLE = {
  ...PUZZLE,
  id: 'morphy|completed',
  opponent: 'Completed sample',
  progress: { box: 1, due: Date.now() - 1, attempts: 2, solved: 1, lastAt: Date.now() },
}

/** Reviews a game through the page, so a player exists, then plants a puzzle in the browser's storage. */
async function withPuzzle(page: Page, extra: object[] = []) {
  await page.goto('/')
  await page.getByText('Paste a PGN instead').click()
  await page.getByLabel('PGN').fill(GAME)
  await page.getByRole('button', { name: 'Review PGN' }).click()
  await expect(page.locator('.review')).toBeVisible()
  await page.evaluate(
    (record) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('chessreview')
        open.onerror = () => reject(open.error ?? new Error('could not open the database'))
        open.onsuccess = () => {
          const tx = open.result.transaction('puzzles', 'readwrite')
          for (const r of record) tx.objectStore('puzzles').put(r)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error ?? new Error('could not save the puzzle'))
        }
      }),
    [PUZZLE, ...extra],
  )
}

test('says puzzles come from your own games before any is reviewed', async ({ page }) => {
  await page.goto('/#/train')
  await expect(page.getByRole('heading', { name: 'Train', level: 1 })).toBeVisible()
  await expect(page.getByText('Puzzles come from your own games')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review some of your games' })).toHaveAttribute('href', '#/')
})

test('switches between misses, positional mistakes and opening misses', async ({ page }) => {
  await withPuzzle(page, [POSITIONAL_PUZZLE, OPENING_MISS, COMPLETED_PUZZLE])
  await page.goto('/#/train')

  const tabs = page.getByRole('tablist', { name: 'Puzzle category' })
  await expect(tabs.getByRole('tab', { name: 'Hits', exact: true })).toHaveCount(0)
  await expect(tabs.getByRole('tab', { name: 'Misses', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByText('Against Completed sample')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()

  await tabs.getByRole('tab', { name: 'Positional mistakes' }).click()
  await expect(tabs.getByRole('tab', { name: 'Positional mistakes' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()
  await expect(page.getByText('from your game against Positional sample')).toBeVisible()

  await tabs.getByRole('tab', { name: 'Opening misses' }).click()
  await expect(tabs.getByRole('tab', { name: 'Opening misses', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()
  await expect(page.getByText('from your game against Opening sample')).toBeVisible()

  await tabs.getByRole('tab', { name: 'Completed puzzles' }).click()
  await expect(tabs.getByRole('tab', { name: 'Completed puzzles' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Against Completed sample')).toBeVisible()
  await expect(page.locator('.train-completed li').filter({ hasText: 'Completed sample' })).toContainText(
    'Last answer: correct',
  )
})

test('selects a piece on mousedown and keeps it selected when released on the same square', async ({
  page,
}) => {
  await withPuzzle(page)
  await page.goto('/#/train')
  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()

  const queen = await page.locator('[data-square="h5"]').boundingBox()
  expect(queen).not.toBeNull()
  await page.mouse.move(queen!.x + queen!.width / 2, queen!.y + queen!.height / 2)
  await page.mouse.down()
  await expect(page.locator('[data-square="f7"] .dot-capture')).toBeVisible({ timeout: 2000 })
  await page.mouse.up()
  await expect(page.locator('[data-square="f7"] .dot-capture')).toBeVisible({ timeout: 2000 })
  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()
})

test('shows a wrong board move briefly, then animates it back', async ({ page }) => {
  await withPuzzle(page)
  await page.goto('/#/train')
  await page.locator('[data-square="h5"]').click()
  await page.locator('[data-square="h4"]').click()

  const wrongQueen = page.locator('[data-square="h4"] [data-piece="wQ"]')
  const marker = page.locator('[data-square="h4"] .wrong-move-marker')
  await expect(wrongQueen).toBeVisible({ timeout: 1000 })
  await expect(marker).toHaveText('×')
  await expect(marker).toHaveCSS('background-color', 'rgb(200, 64, 60)')
  await expect(page.locator('[data-square="h5"] [data-piece="wQ"]')).toBeVisible({ timeout: 2000 })
  await expect(marker).toHaveCount(0)
  await expect(page.getByText('That is not the best move.')).toBeVisible()
})

test('does not outline a square in black while dragging a piece', async ({ page }) => {
  await withPuzzle(page)
  await page.goto('/#/train')

  const queen = await page.locator('[data-square="h5"]').boundingBox()
  const blockedSquare = await page.locator('[data-square="d1"]').boundingBox()
  expect(queen).not.toBeNull()
  expect(blockedSquare).not.toBeNull()
  await page.mouse.move(queen!.x + queen!.width / 2, queen!.y + queen!.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    blockedSquare!.x + blockedSquare!.width / 2,
    blockedSquare!.y + blockedSquare!.height / 2,
  )
  await expect
    .poll(() => page.locator('[data-square="d1"]').evaluate((square) => getComputedStyle(square).boxShadow))
    .toBe('none')
  await page.mouse.up()
  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()
})

test('marks capture targets in their corners and fills hovered legal targets', async ({ page }) => {
  await withPuzzle(page)
  await page.goto('/#/train')
  await page.locator('[data-square="h5"]').click()

  const captureSquare = page.locator('[data-square="f7"]')
  await expect(captureSquare.locator('.dot-capture')).toBeVisible()
  await expect(captureSquare.locator('.dot-capture')).toHaveCSS('color', 'rgb(46, 139, 98)')
  await expect(captureSquare.locator('.dot-target')).toHaveCount(0)
  const quietTarget = page.locator('[data-square="h6"] .dot-target')
  await expect(quietTarget).toBeVisible()
  await expect(quietTarget).toHaveCSS('background-color', 'rgb(46, 139, 98)')

  const target = await captureSquare.boundingBox()
  expect(target).not.toBeNull()
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2)
  await expect(captureSquare.locator('.dot-capture')).toHaveCount(0)
  await expect(captureSquare.locator('.dot-target')).toHaveCount(0)
  const fill = await captureSquare
    .locator(':scope > div')
    .evaluate((square) => getComputedStyle(square).backgroundColor)
  expect(fill).toBe('rgba(46, 139, 98, 0.35)')
})

test('plays the best line after a correct move and lets you continue from there', async ({ page }) => {
  await withPuzzle(page, [LINE_PUZZLE])
  await page.goto('/#/train')
  await page.getByLabel('Your move').fill('e4')
  await page.getByRole('button', { name: 'Check' }).click()

  await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible()
  await expect(page.getByRole('img', { name: /^Evaluation/ })).toBeVisible()
  const currentLineMove = page.locator('.train-line [aria-current="true"]')
  await expect(currentLineMove).toHaveText('1. e4')
  await page.waitForTimeout(700)
  const blackPawn = page.locator('[data-square="d5"] [data-piece="bP"]')
  await expect(blackPawn).toBeHidden()
  await expect(blackPawn).toBeVisible({ timeout: 1000 })
  await expect(currentLineMove).toHaveText('d5')

  await page.locator('[data-square="e4"]').click()
  await expect(page.locator('[data-square="d5"] .dot-capture')).toBeVisible()
  await page.locator('[data-square="d5"]').click()
  const whitePawn = page.locator('[data-square="d5"] [data-piece="wP"]')
  await expect(whitePawn).toBeVisible()
  await expect(currentLineMove).toHaveText('2. exd5')
  await page.waitForTimeout(700)
  await expect(whitePawn).toBeVisible()

  await expect(page.locator('[data-square="d5"] [data-piece="bQ"]')).toBeVisible({
    timeout: 1500,
  })
  await expect(currentLineMove).toHaveText('Qxd5')
  await expect(page.getByText('Best line played. You can keep playing from here.')).toBeVisible()

  await page.getByRole('button', { name: 'd5', exact: true }).click()
  await expect(currentLineMove).toHaveText('d5')
  await expect(page.locator('[data-square="d5"] [data-piece="bP"]')).toBeVisible()
  await expect(page.locator('[data-square="d7"] [data-piece="bP"]')).toHaveCount(0)
  await page.waitForTimeout(1000)
  await expect(currentLineMove).toHaveText('d5')
  await page.getByRole('button', { name: 'Qxd5' }).click()
  await expect(currentLineMove).toHaveText('Qxd5')
  await expect(page.locator('[data-square="d5"] [data-piece="bQ"]')).toBeVisible()

  await page.locator('[data-square="b1"]').click()
  await expect(page.locator('[data-square="c3"] .dot-target')).toBeVisible()
  await page.locator('[data-square="c3"]').click()
  expect(await page.locator('.train-live').count()).toBe(1)
  await expect(page.locator('.train-live .explore-eval b')).toHaveText(/^[+−]\d+\.\d$|^M\d+$/)
  await expect(page.locator('.evalbar-label')).toHaveText(/^[+−]\d+\.\d$|^M\d+$/)
  const exploration = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(exploration.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  await page.setViewportSize({ width: 390, height: 844 })
  const liveOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(liveOverflow).toBeLessThanOrEqual(0)
  await page.getByRole('button', { name: 'Back to puzzle' }).click()
  await expect(page.locator('.train-live')).toHaveCount(0)
  await expect(page.locator('[data-square="d5"] [data-piece="bQ"]')).toBeVisible()
  await page.getByRole('button', { name: 'Retry puzzle' }).click()
  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()
  await expect(page.locator('.evalbar')).toHaveCount(0)
})

test('can analyze a completed puzzle before playing the best line', async ({ page }) => {
  await withPuzzle(page, [LINE_PUZZLE])
  await page.goto('/#/train')
  await page.getByLabel('Your move').fill('e4')
  await page.getByRole('button', { name: 'Check' }).click()

  await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible()
  await page.getByRole('button', { name: 'Analyze puzzle' }).click()
  await expect(page.locator('.train-live')).toBeVisible()
  const bestMoveToggle = page.getByRole('checkbox', { name: 'Show best move' })
  await expect(bestMoveToggle).toBeChecked()
  await expect(page.locator('.train-live .explore-eval b')).toHaveText(/^[+−]\d+\.\d$|^M\d+$/)
  await expect(page.getByRole('group', { name: 'Board, White to move' })).toBeVisible()
  await expect(page.locator('[data-square="e2"] [data-piece="wP"]')).toBeVisible()
  await page.locator('[data-square="e2"]').click()
  await expect(page.locator('[data-square="e3"] .dot-target')).toBeVisible()
  await page.locator('[data-square="e3"]').click()
  await expect(page.locator('[data-square="e3"] [data-piece="wP"]')).toBeVisible()

  await page.getByRole('button', { name: 'Back to puzzle' }).click()
  await page.getByRole('button', { name: 'Analyze puzzle' }).click()
  await expect(page.getByRole('group', { name: 'Board, White to move' })).toBeVisible()
  const analysisMoves = page.getByRole('list', { name: 'Analysis moves' })
  await expect(analysisMoves.getByRole('button', { name: '1. e4', exact: true })).toBeVisible()

  const bestMoveArrow = page.locator('.board svg path[marker-end]')
  await expect(bestMoveArrow).toHaveCount(1)
  await page.keyboard.press('b')
  await expect(bestMoveToggle).not.toBeChecked()
  await expect(bestMoveArrow).toHaveCount(0)
  await page.keyboard.press('b')
  await expect(bestMoveToggle).toBeChecked()
  await expect(bestMoveArrow).toHaveCount(1)
  await page.keyboard.press('b')
  await expect(bestMoveToggle).not.toBeChecked()
  await expect(bestMoveArrow).toHaveCount(0)
  await expect(page.locator('.best-move-badge')).toHaveCount(0)
  await page.keyboard.press('b')
  await expect(bestMoveToggle).toBeChecked()
  await bestMoveToggle.uncheck()
  await expect(bestMoveArrow).toHaveCount(0)
  await expect(page.locator('.best-move-badge')).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await analysisMoves.getByRole('button', { name: '1. e4', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Board, Black to move' })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('group', { name: 'Board, White to move' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('group', { name: 'Board, Black to move' })).toBeVisible()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Board, White to move' })).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Board, Black to move' })).toBeVisible()
  await page.keyboard.press('Home')
  await expect(page.getByRole('group', { name: 'Board, White to move' })).toBeVisible()
  await page.keyboard.press('End')
  await expect(page.getByRole('group', { name: 'Board, White to move' })).toBeVisible()
  await page.keyboard.press('Home')

  await analysisMoves.getByRole('button', { name: '1. e4', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Board, Black to move' })).toBeVisible()
  await page.locator('[data-square="e7"]').click()
  await expect(page.locator('[data-square="e5"] .dot-target')).toBeVisible()
  await page.locator('[data-square="e5"]').click()
  await expect(page.locator('[data-square="e5"] [data-piece="bP"]')).toBeVisible()
  await expect(analysisMoves).toContainText('e5')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  const analysis = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(analysis.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
})

test('marks checkmate while exploring a completed puzzle', async ({ page }) => {
  await withPuzzle(page)
  await page.goto('/#/train')
  await page.getByLabel('Your move').fill('Qxf7#')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible()

  await page.getByRole('button', { name: 'Analyze puzzle' }).click()
  await expect(page.locator('.train-live')).toBeVisible()
  const analysisMoves = page.getByRole('list', { name: 'Analysis moves' })
  await analysisMoves.getByRole('button', { name: '4. Qxf7#' }).click()

  const mate = page.locator('[data-square="e8"] [data-king-check="mate"]')
  await expect(mate).toBeVisible()
  await expect(mate.getByRole('img', { name: 'Checkmate' })).toHaveText('#')
})

test('draws arrows and marks squares on a puzzle board', async ({ page }) => {
  await withPuzzle(page)
  await page.goto('/#/train')

  const markedSquare = page.locator('[data-square="c3"]')
  await markedSquare.click({ button: 'right' })
  const mark = markedSquare.locator('[data-mark="true"]')
  await expect(mark).toBeVisible()
  await expect(mark).toHaveCSS('background-color', 'rgba(200, 64, 60, 0.55)')

  const from = await page.locator('[data-square="d2"]').boundingBox()
  const to = await page.locator('[data-square="d4"]').boundingBox()
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2)
  await page.mouse.up({ button: 'right' })
  await expect(page.locator('.train-stage .board svg path[marker-end*="d2-d4"]')).toHaveCount(1)
})

test('asks a puzzle, takes a typed answer, and counts only the first try', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
  await withPuzzle(page)
  await page.getByRole('link', { name: 'Train' }).click()

  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()
  await expect(page.getByText('from your game against Saint Brie on 2026-10-01')).toBeVisible()

  // Typing something that is not a move explains how to write one.
  await page.getByLabel('Your move').fill('hello')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText('That is not a legal move here.')).toBeVisible()

  // The move played in the game was the mistake, and the page says so.
  await page.getByLabel('Your move').fill('Nf3')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(
    page.getByText('That is the move you played in the game, and it was the mistake.'),
  ).toBeVisible()

  // Trying again with the right move solves it, and shows what happened in the game.
  await page.getByLabel('Your move').fill('Qxf7')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible()
  await expect(page.getByText('In the game you played')).toContainText('Nf3')
  await expect(page.locator('.train-line')).toContainText('4. Qxf7#')
  await expect(page.getByRole('link', { name: 'Open the game' })).toHaveAttribute(
    'href',
    '#/review/game?u=morphy',
  )

  // The first answer was wrong, so the puzzle does not count as solved first try.
  await expect(page.getByText('Solved first try').locator('..')).toContainText('0%')

  await page.getByRole('tab', { name: 'Positional mistakes' }).click()
  await page.getByRole('tab', { name: 'Misses', exact: true }).click()
  await expect(page.getByText('No more new puzzles to practise right now.')).toBeVisible()
  expect(problems).toEqual([])

  // Today's set counts it, and says so once nothing is left.
  await expect(page.getByText('1 of 1 today · done for today')).toBeVisible()
  await page.getByRole('tab', { name: 'Completed puzzles' }).click()
  await expect(page.getByText(/Against Saint Brie.*2026-10-01/)).toBeVisible()
  await expect(page.getByText('Last answer: not correct')).toBeVisible()

  // The answer is saved and remains available in Completed after a reload.
  await page.reload()
  await page.getByRole('tab', { name: 'Completed puzzles' }).click()
  await expect(page.getByText(/Against Saint Brie.*2026-10-01/)).toBeVisible()
})

test('shows the answer on request and the page has no WCAG A/AA violations', async ({ page }) => {
  await withPuzzle(page)
  await page.goto('/#/train')
  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()
  const asking = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(asking.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  await page.getByRole('button', { name: 'Show the answer' }).click()
  await expect(page.getByRole('heading', { name: 'The best move' })).toBeVisible()
  const shown = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(shown.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
})

test('the header, with its navigation, fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  for (const route of ['/', '/#/insights', '/#/train']) {
    await page.goto(route)
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  // The name is hidden on a phone, but the link keeps it for screen readers.
  await expect(page.getByRole('link', { name: 'chessreview' })).toBeVisible()
})

test('shows how far today’s set is, and counts it up as puzzles are answered', async ({ page }) => {
  const other = { ...PUZZLE, id: 'morphy|second', tactic: 'fork', puzzle: { ...PUZZLE.puzzle, loss: 20 } }
  await withPuzzle(page, [other])
  await page.goto('/#/train')
  await expect(page.getByText('0 of 2 today')).toBeVisible()
  await page.getByRole('button', { name: 'Show the answer' }).first().click()
  await page.getByRole('button', { name: 'Next puzzle' }).click()
  await expect(page.getByText('1 of 2 today')).toBeVisible()
})

test('practises one tactic when a link asks for it, and says when it has none', async ({ page }) => {
  const other = { ...PUZZLE, id: 'morphy|second', tactic: 'fork' }
  await withPuzzle(page, [other])

  await page.goto('/#/train?tactic=fork')
  await expect(page.getByText('Focus: Forks · 1 puzzle')).toBeVisible()
  await expect(page.getByText('0 of 2 today')).toBeVisible() // the day's set is not narrowed by the focus
  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()
  await page.getByRole('button', { name: 'Show the answer' }).first().click()
  await page.getByRole('button', { name: 'Next puzzle' }).click()
  await expect(page.getByText('No more new puzzles to practise right now.')).toBeVisible()

  // Another tactic has no puzzles yet, and the way back to all of them is on the page.
  await page.goto('/#/train?tactic=skewer')
  await expect(page.getByText('No puzzles for “Skewers” yet.')).toBeVisible()
  await page.getByRole('link', { name: 'Show all puzzles' }).first().click()
  await expect(page.getByText('Focus:')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'White to move. Find the best move.' })).toBeVisible()
})

test('a puzzle fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await withPuzzle(page)
  await page.goto('/#/train?tactic=pin')
  await expect(page.getByLabel('Your move')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('the solved puzzle and its best line fit a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await withPuzzle(page, [LONG_LINE_PUZZLE])
  await page.goto('/#/train')
  await page.getByLabel('Your move').fill('e4')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('heading', { name: 'Correct' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('a tactic in the link that is not a real one shows an empty focus, not a broken page', async ({
  page,
}) => {
  await withPuzzle(page)
  for (const odd of ['constructor', '__proto__', 'someNewTactic']) {
    await page.goto(`/#/train?tactic=${odd}`)
    await expect(page.getByRole('link', { name: 'Show all puzzles' }).first()).toBeVisible()
    await expect(page.getByText('Focus:')).toBeVisible()
  }
  await page.goto('/#/train?tactic=')
  await expect(page.getByText('Focus:')).toHaveCount(0)
})

test('opens for the player named in the link', async ({ page }) => {
  await withPuzzle(page)
  await page.goto('/#/train?tactic=pin&u=Morphy')
  await expect(page.getByLabel('Player')).toHaveValue('Morphy')
})

test('practises the side of a tactic the link asks for', async ({ page }) => {
  const allowed = { ...PUZZLE, id: 'morphy|allowed', tactic: 'fork', perspective: 'allowed' as const }
  const missed = { ...PUZZLE, id: 'morphy|missed', tactic: 'fork', perspective: 'missed' as const }
  await withPuzzle(page, [allowed, missed])

  await page.goto('/#/train?tactic=fork&p=missed')
  await expect(page.getByText('Focus: Missed a fork · 1 puzzle')).toBeVisible()
  await page.goto('/#/train?tactic=fork&p=allowed')
  await expect(page.getByText('Focus: Allowed a fork · 1 puzzle')).toBeVisible()
  await page.goto('/#/train?tactic=fork')
  await expect(page.getByText('Focus: Forks · 2 puzzles')).toBeVisible()

  // Neither of these has the side recorded as "missed", so the focus is empty, not wrong.
  await page.goto('/#/train?tactic=pin&p=missed')
  await expect(page.getByText('No puzzles for “Missed a pin” yet.')).toBeVisible()
  // A side that is not one is ignored.
  await page.goto('/#/train?tactic=fork&p=nonsense')
  await expect(page.getByText('Focus: Forks · 2 puzzles')).toBeVisible()
})

test('a side with no tactic is ignored, and puzzles with no side are offered when a side has none', async ({
  page,
}) => {
  const known = { ...PUZZLE, id: 'morphy|known', tactic: 'fork', perspective: 'missed' as const }
  const unknown = { ...PUZZLE, id: 'morphy|unknown', tactic: 'fork', perspective: null }
  await withPuzzle(page, [known, unknown])

  await page.goto('/#/train?p=missed')
  await expect(page.getByText('Focus:')).toHaveCount(0)

  await page.goto('/#/train?tactic=fork&p=allowed&u=Morphy')
  await expect(page.getByText('No puzzles for “Allowed a fork” yet.')).toBeVisible()
  await expect(page.getByText('1 puzzle of forks could not be sorted into allowed or missed')).toBeVisible()
  await page.getByRole('link', { name: 'Practise them all' }).click()
  await expect(page.getByText('Focus: Forks · 2 puzzles')).toBeVisible()
})
