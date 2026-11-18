import { expect, test, type Page } from '@playwright/test'

async function showRepertoire(page: Page) {
  const toggle = page.getByRole('button', { name: /My repertoire/ })
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
}

test('studies, saves and practices an opening for both sides', async ({ page }) => {
  await page.goto('/openings')
  await expect(page.getByRole('heading', { name: 'Openings', exact: true })).toBeVisible()
  await page
    .getByLabel('Openings')
    .locator('article')
    .filter({ hasText: 'Italian Game' })
    .getByRole('button', { name: 'Train' })
    .click()
  const line = page
    .getByLabel('Opening lines')
    .locator('article')
    .filter({
      has: page.getByText('1. e4 e5 2. Nf3 Nc6 3. Bc4', { exact: true }),
    })
  await line.getByRole('link', { name: 'Train' }).click()
  await expect(page.getByLabel('Selected opening')).toContainText('Open')
  await page.getByRole('button', { name: 'Next move', exact: true }).click()
  await expect(page.getByRole('button', { name: 'White pawn, e4' })).toBeVisible()
  await page.getByRole('button', { name: 'Previous move', exact: true }).click()
  await expect(page.getByRole('button', { name: 'White pawn, e2' })).toBeVisible()
  await page.getByRole('button', { name: 'Add to repertoire' }).click()
  await page.reload()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Openings' }).click()
  await showRepertoire(page)
  await page
    .getByRole('region', { name: 'My repertoire' })
    .getByRole('button', { name: 'Train Italian Game as White' })
    .click()
  await expect(page.getByLabel('Opening lines')).toBeVisible()
  await line.getByRole('link', { name: 'Train', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove from repertoire' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Practice opening' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start playback' }).click()
  await expect(page.getByText('Line viewed! Continue to level 1.')).toBeVisible()
  await page.getByRole('button', { name: 'Start level 1' }).click()
  await expect(page.getByLabel('Opening moves')).toHaveCount(0)
  await expect(page.getByLabel('Opening lines')).toHaveCount(0)

  await page.getByRole('button', { name: 'White pawn, d2' }).click()
  await page.locator('[data-square="d4"]').click()
  await expect(page.getByRole('img', { name: 'Incorrect move' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'White pawn, d2' })).toBeVisible()
  await expect(page.getByText('Incorrect move. Try again.')).toBeVisible()

  await page.getByRole('button', { name: 'White pawn, e2' }).click()
  await page.locator('[data-square="e4"]').click()
  await expect(page.getByRole('button', { name: 'Black pawn, e5' })).toBeVisible()
  await page.getByRole('button', { name: 'White knight, g1' }).click()
  await page.locator('[data-square="f3"]').click()
  await expect(page.getByRole('button', { name: 'Black knight, c6' })).toBeVisible()
  await page.getByRole('button', { name: 'White bishop, f1' }).click()
  await page.locator('[data-square="c4"]').click()
  await expect(page.getByText('Attempt complete with mistakes. Return to level 0.')).toBeVisible()
  await page.getByRole('radio', { name: 'Black' }).check()
  await page.getByRole('button', { name: 'Add to repertoire' }).click()
  await page.getByRole('button', { name: 'Start playback' }).click()
  await expect(page.getByText('Line viewed! Continue to level 1.')).toBeVisible()
  await page.getByRole('button', { name: 'Start level 1' }).click()
  await expect(page.getByRole('button', { name: 'White pawn, e4' })).toBeVisible()
  await page.getByRole('button', { name: 'Black pawn, e7' }).click()
  await page.locator('[data-square="e5"]').click()
  await expect(page.getByRole('button', { name: 'White knight, f3' })).toBeVisible()
  await page.getByRole('button', { name: 'Black knight, b8' }).click()
  await page.locator('[data-square="c6"]').click()
  await expect(page.getByText('Level 1 complete! Continue to level 2.')).toBeVisible()
  await page.reload()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Openings' }).click()
  await showRepertoire(page)
  await expect(page.getByRole('region', { name: 'My repertoire' })).toContainText(
    'White · 67% first try (2/3)',
  )
  await expect(page.getByRole('region', { name: 'My repertoire' })).toContainText(
    'Black · 100% first try (2/2)',
  )
  await page
    .getByRole('region', { name: 'My repertoire' })
    .getByRole('button', { name: 'Train Italian Game as Black' })
    .click()
  await expect(page.getByRole('radio', { name: 'Black' })).toBeChecked()
  await line.getByRole('link', { name: 'Train', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Italian Game', exact: true, level: 1 })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  const width = await page
    .getByRole('region', { name: 'Opening board' })
    .evaluate((board) => board.clientWidth)
  expect(width).toBeGreaterThan(300)
})

test('suggests openings for each side without offering the full catalogue', async ({ page }) => {
  await page.goto('/openings')
  const openings = page.getByLabel('Openings', { exact: true })
  await expect(page).toHaveTitle('Openings · chessreview')
  await expect(page.getByRole('radio', { name: 'All' })).toBeChecked()
  await expect(page.getByRole('heading', { name: 'All openings' })).toBeVisible()
  await showRepertoire(page)
  await expect(page.getByText('Add openings to your repertoire to see them here.')).toBeVisible()
  await expect(openings.locator('article')).toHaveCount(16)
  await expect(page.getByText('Showing 16 of 16')).toBeVisible()
  await page.getByRole('radio', { name: 'White' }).check()
  await expect(page.getByRole('heading', { name: 'Openings for White' })).toBeVisible()
  await expect(openings.locator('article')).toHaveCount(8)
  const ponziani = openings.locator('article').filter({ hasText: 'Ponziani Opening' })
  await expect(ponziani).toContainText('Club')
  await expect(ponziani).toContainText('Aggressive')
  await expect(openings.locator('article').filter({ hasText: 'London System' })).toContainText('Beginner')
  for (const card of await openings.locator('article').all()) {
    await expect(card).toContainText(/Beginner|Club|Expert/)
    await expect(card).toContainText(/Solid|Aggressive/)
    await expect(card.getByRole('img', { name: /First white piece/ })).toHaveCount(1)
  }
  await expect(
    openings
      .locator('article')
      .filter({ hasText: 'Italian Game' })
      .getByRole('img', { name: /white piece.*knight/ }),
  ).toBeVisible()
  await expect(
    openings
      .locator('article')
      .filter({ hasText: 'English Opening' })
      .getByRole('img', { name: /white piece/ }),
  ).toBeVisible()
  await ponziani.getByRole('button', { name: 'Train' }).click()
  await expect(page.getByLabel('Opening lines')).toBeVisible()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Openings' }).click()
  await expect(openings).not.toContainText('Scandinavian Defense')
  await page.getByRole('radio', { name: 'Black' }).check()
  await expect(page.getByRole('heading', { name: 'Openings for Black' })).toBeVisible()
  await expect(openings.locator('article')).toHaveCount(8)
  await expect(openings).toContainText('Scandinavian Defense')
  const caro = openings.locator('article').filter({ hasText: 'Caro-Kann Defense' })
  await expect(caro).toContainText('Beginner')
  await expect(caro).toContainText('Solid')
  await expect(openings.locator('article').filter({ hasText: 'Sicilian Defense' })).toContainText('Expert')
  for (const card of await openings.locator('article').all()) {
    await expect(card).toContainText(/Beginner|Club|Expert/)
    await expect(card).toContainText(/Solid|Aggressive/)
    await expect(card.getByRole('img', { name: /First black piece/ })).toHaveCount(1)
  }
  await expect(
    openings
      .locator('article')
      .filter({ hasText: 'Scandinavian Defense' })
      .getByRole('img', { name: /black piece.*queen/ }),
  ).toBeVisible()
  await expect(caro.getByRole('img', { name: /black piece.*knight/ })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Search openings' })).toHaveCount(0)
  await expect(caro).toContainText('Black · vs 1.e4')
  await page.getByRole('combobox', { name: 'Level' }).selectOption('Beginner')
  await expect(page.getByText('Showing 2 of 16')).toBeVisible()
  await page.getByRole('combobox', { name: 'Style' }).selectOption('Aggressive')
  await expect(page.getByText('Showing 0 of 16')).toBeVisible()
  await page.getByRole('button', { name: '× Reset' }).click()
  await expect(page.getByRole('radio', { name: 'All' })).toBeChecked()
  await expect(openings.locator('article')).toHaveCount(16)
  await expect(openings.locator('article').filter({ hasText: 'Italian Game' })).toContainText(
    'White · 1.e4 e5',
  )
  const italian = openings.locator('article').filter({ hasText: 'Italian Game' })
  const star = italian.getByRole('button', { name: 'Italian Game as White in repertoire' })
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  const repertoire = page.getByRole('region', { name: 'My repertoire' })
  await showRepertoire(page)
  const savedCard = repertoire.locator('article').filter({ hasText: 'Italian Game' })
  await expect(savedCard.locator('strong')).toHaveText('Italian Game')
  await expect(savedCard).toContainText('White · 1.e4 e5')
  await expect(
    savedCard.getByRole('button', { name: 'Italian Game as White in repertoire' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await savedCard.getByRole('button', { name: 'Train Italian Game as White' }).click()
  await expect(page.getByRole('heading', { name: 'Italian Game', exact: true, level: 1 })).toBeVisible()
  await page
    .getByLabel('Opening lines')
    .locator('article')
    .first()
    .getByRole('link', { name: 'Train' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Italian Game: Classical Variation, Giuoco Pianissimo, Main Line' }),
  ).toBeVisible()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Openings' }).click()
  await savedCard.getByRole('button', { name: /in repertoire/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('Add openings to your repertoire to see them here.')).toBeVisible()
  await page.getByRole('combobox', { name: 'Style' }).selectOption('Aggressive')
  await expect(page.getByText('Showing 5 of 16')).toBeVisible()
  await page.getByRole('combobox', { name: 'Level' }).selectOption('Expert')
  await expect(page.getByText('Showing 2 of 16')).toBeVisible()
  await expect(openings).toContainText('Sicilian Defense')
  await expect(openings).toContainText("King's Indian Defense")
  await page.getByRole('button', { name: '× Reset' }).click()
  await expect(page.getByRole('button', { name: 'Browse all openings' })).toHaveCount(0)
  await expect(openings).toContainText('Ponziani Opening')
  await expect(openings).not.toContainText('Amar Opening')
})

test('orders opening cards by level and then style, including filtered results', async ({ page }) => {
  await page.goto('/#/openings')
  const cards = page.getByLabel('Openings', { exact: true }).locator('article')
  const tags = () =>
    cards.evaluateAll((elements) =>
      elements.map((element) =>
        Array.from(element.querySelectorAll('.learn-card-tags span'), (tag) => tag.textContent?.trim()).slice(
          1,
          3,
        ),
      ),
    )
  await expect(cards).toHaveCount(16)
  expect(await tags()).toEqual([
    ['Beginner', 'Solid'],
    ['Beginner', 'Solid'],
    ['Beginner', 'Solid'],
    ['Beginner', 'Aggressive'],
    ['Beginner', 'Aggressive'],
    ['Club', 'Solid'],
    ['Club', 'Solid'],
    ['Club', 'Solid'],
    ['Club', 'Solid'],
    ['Club', 'Solid'],
    ['Club', 'Aggressive'],
    ['Expert', 'Solid'],
    ['Expert', 'Solid'],
    ['Expert', 'Solid'],
    ['Expert', 'Aggressive'],
    ['Expert', 'Aggressive'],
  ])
  await page.getByRole('radio', { name: 'White' }).check()
  await page.getByRole('combobox', { name: 'Level' }).selectOption('Club')
  await expect(cards).toHaveCount(3)
  expect(await tags()).toEqual([
    ['Club', 'Solid'],
    ['Club', 'Solid'],
    ['Club', 'Aggressive'],
  ])
})

test('shows active filters and only offers reset when a filter is selected', async ({ page }) => {
  await page.goto('/#/openings')
  const reset = page.getByRole('button', { name: '× Reset' })
  const active = page.getByRole('group', { name: 'Active filters' })
  await expect(page.getByText('Showing 16 of 16')).toBeVisible()
  await expect(reset).toHaveCount(0)
  await expect(active).toHaveCount(0)
  await page.getByRole('radio', { name: 'Black' }).check()
  await expect(active).toHaveText('Side: Black')
  await expect(reset).toBeVisible()
  await page.getByRole('combobox', { name: 'Level' }).selectOption('Beginner')
  await page.getByRole('combobox', { name: 'Style' }).selectOption('Aggressive')
  await expect(page.getByText('Showing 0 of 16')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(
    'No openings for the selected filters. Try changing or resetting them.',
  )
  await expect(active.locator('.pill')).toHaveText(['Side: Black', 'Level: Beginner', 'Style: Aggressive'])
  await page.getByRole('radio', { name: 'All' }).check()
  await page.getByRole('combobox', { name: 'Level' }).selectOption('Any level')
  await expect(active).toHaveText('Style: Aggressive')
  await reset.click()
  await expect(page.getByText('Showing 16 of 16')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'All' })).toBeChecked()
  await expect(page.getByRole('combobox', { name: 'Level' })).toHaveValue('Any level')
  await expect(page.getByRole('combobox', { name: 'Style' })).toHaveValue('Any style')
  await expect(reset).toHaveCount(0)
  await expect(active).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('hides the starter when a variation is already saved and preserves its progress', async ({ page }) => {
  await page.goto('/#/openings')
  const starter = page.getByRole('region', { name: 'New to openings?' })
  await expect(starter).toContainText('London System')
  await expect(starter).toContainText('Caro-Kann Defense')
  await expect(starter).toContainText("King's Indian Defense")
  await expect(starter).toContainText('Black · vs 1.d4 · Expert')
  await page
    .getByLabel('Openings', { exact: true })
    .locator('article')
    .filter({ hasText: 'London System' })
    .getByRole('button', { name: 'Train' })
    .click()
  const variation = page.getByLabel('Opening lines').locator('article').last()
  const variationName = await variation.getByRole('heading').innerText()
  await variation.getByRole('link', { name: 'Train' }).click()
  await page.getByRole('button', { name: 'Add to repertoire' }).click()
  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('chessreview.opening-repertoire')!) as { id: string; side: string }[],
  )
  await page.evaluate((entry) => {
    localStorage.setItem('chessreview.opening-progress', JSON.stringify([{ ...entry, correct: 1, total: 2 }]))
  }, saved[0])
  await page.reload()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Openings' }).click()
  await expect(starter).toHaveCount(0)
  const repertoire = page.getByRole('region', { name: 'My repertoire' })
  await showRepertoire(page)
  await expect(repertoire.locator('article')).toHaveCount(1)
  await expect(repertoire.getByLabel('1 saved opening')).toBeVisible()
  await expect(repertoire).toContainText('White · 50% first try (1/2)')
  await page.reload()
  expect(
    await page.evaluate(
      () =>
        (
          JSON.parse(localStorage.getItem('chessreview.opening-repertoire')!) as {
            id: string
            side: string
          }[]
        )[0],
    ),
  ).toEqual(saved[0])
  await showRepertoire(page)
  await expect(repertoire.locator('article')).toHaveCount(1)
  await expect(repertoire).toContainText('White · 50% first try (1/2)')
  await repertoire.getByRole('button', { name: 'Train London System as White' }).click()
  await expect(page.getByRole('heading', { name: 'London System', exact: true, level: 1 })).toBeVisible()
  await page
    .getByLabel('Opening lines')
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: variationName, exact: true }) })
    .getByRole('link', { name: 'Train', exact: true })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: variationName, exact: true })).toBeVisible()
})

test('collapses the repertoire and only offers the starter when it is empty', async ({ page }) => {
  await page.goto('/#/openings')
  const repertoire = page.getByRole('region', { name: 'My repertoire' })
  const toggle = repertoire.getByRole('button', { name: /My repertoire/ })
  const starter = page.getByRole('region', { name: 'New to openings?' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(repertoire.getByText('Add openings to your repertoire to see them here.')).toBeHidden()
  await expect(starter).toBeVisible()
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(repertoire.getByText('Add openings to your repertoire to see them here.')).toBeVisible()
  await toggle.click()
  await starter.getByRole('button', { name: 'Add starter repertoire' }).click()
  await expect(starter).toHaveCount(0)
  await expect(repertoire.getByLabel('3 saved openings')).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await showRepertoire(page)
  await expect(repertoire.locator('article')).toHaveCount(3)
  await page.reload()
  await expect(starter).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await showRepertoire(page)
  for (const name of ['London System', 'Caro-Kann Defense', "King's Indian Defense"]) {
    await repertoire.getByRole('button', { name: new RegExp(`${name} as .* in repertoire`) }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()
  }
  await expect(starter).toBeVisible()
  await expect(repertoire.getByLabel('0 saved openings')).toBeVisible()
})

test('counts saved lines and confirms removal from cards', async ({ page }) => {
  await page.goto('/#/openings')
  const repertoire = page.getByRole('region', { name: 'My repertoire' })
  const star = page.getByLabel('Openings', { exact: true }).getByRole('button', {
    name: 'Italian Game as White in repertoire',
  })
  await expect(repertoire.getByLabel('0 saved openings')).toBeVisible()
  await star.click()
  await expect(repertoire.getByLabel('1 saved opening', { exact: true })).toBeVisible()
  await star.click()
  const dialog = page.getByRole('dialog', { name: 'Remove Italian Game from your repertoire?' })
  await expect(dialog).toContainText('White')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await expect(repertoire.getByLabel('1 saved opening', { exact: true })).toBeVisible()
  await page.reload()
  await showRepertoire(page)
  await repertoire.getByRole('button', { name: 'Italian Game as White in repertoire' }).click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(repertoire.getByLabel('1 saved opening', { exact: true })).toBeVisible()
  await repertoire.getByRole('button', { name: 'Train Italian Game as White' }).click()
  await page
    .getByLabel('Opening lines')
    .locator('article')
    .first()
    .getByRole('link', { name: 'Train' })
    .click()
  await expect(page.getByRole('button', { name: 'Remove from repertoire' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add to repertoire' })).toHaveCount(0)
  const lineUrl = page.url()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Openings' }).click()
  await repertoire.getByRole('button', { name: 'Italian Game as White in repertoire' }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
  await page.goto(lineUrl)
  await expect(page.getByRole('button', { name: 'Add to repertoire' })).toBeVisible()
  await page.reload()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Openings' }).click()
  await expect(repertoire.getByLabel('0 saved openings')).toBeVisible()
})

test('reports a storage failure when adding the starter repertoire', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = localStorage.setItem.bind(localStorage)
    Storage.prototype.setItem = function (key, value) {
      if (key === 'chessreview.opening-repertoire') throw new Error('Storage unavailable')
      return setItem(key, value)
    }
  })
  await page.goto('/#/openings')
  await page.getByRole('button', { name: 'Add starter repertoire' }).click()
  await expect(page.getByRole('alert')).toHaveText('Could not save your repertoire. Check browser storage.')
  await expect(page.getByRole('region', { name: 'My repertoire' }).locator('article')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add starter repertoire' })).toBeDisabled()
})

test('shows indicative types for recommended opening lines', async ({ page }) => {
  await page.goto('/#/openings')
  await page
    .getByLabel('Openings', { exact: true })
    .locator('article')
    .filter({ hasText: 'Caro-Kann Defense' })
    .getByRole('button', { name: 'Train' })
    .click()
  await expect(
    page
      .getByLabel('Opening lines')
      .locator('article')
      .filter({
        has: page.getByText('1. e4 c6', { exact: true }),
      })
      .getByText('B10 · Solid'),
  ).toBeVisible()
})

test('shows opening families before their lines', async ({ page }) => {
  await page.goto('/#/openings')
  const openings = page.getByLabel('Openings', { exact: true })
  await expect(openings.locator('article').filter({ hasText: 'English Opening' })).toContainText('177 lines')
  await expect(page.getByLabel('Opening lines')).toHaveCount(0)
  await expect(openings).not.toContainText('Achilles-Omega Gambit')
  await openings
    .locator('article')
    .filter({ hasText: 'English Opening' })
    .getByRole('button', { name: 'Train' })
    .click()
  const lines = page.getByLabel('Opening lines')
  expect(await lines.locator('article').count()).toBeLessThan(177)
  await expect(lines).toContainText('Achilles-Omega Gambit')
  await lines.getByRole('link', { name: 'Train' }).last().click()
  await expect(page.getByRole('region', { name: 'Opening board' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Openings' }).click()
  await expect(page.getByLabel('Selected opening')).toHaveCount(0)
})

test('opens every suggested opening before training a line', async ({ page }) => {
  await page.goto('/#/openings')
  const cards = page.getByLabel('Openings', { exact: true }).locator('article')
  await expect(cards).toHaveCount(16)
  const names = await cards.locator('strong').allTextContents()
  expect(names).toHaveLength(16)
  for (const name of names) {
    const card = cards.filter({ has: page.getByText(name, { exact: true }) })
    await card.locator('strong').click({ force: true })
    await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Opening board' })).toHaveCount(0)
    const main = page.getByLabel('Opening lines').locator('article').first()
    await expect(main.getByRole('heading', { name: 'Main line', exact: true })).toBeVisible()
    await expect(main.locator('strong')).not.toBeEmpty()
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Openings' }).click()
  }
})

test('groups same-named variations while keeping their continuations trainable', async ({ page }) => {
  await page.goto('/#/openings/italian-game?side=w')
  const cards = page.getByLabel('Opening lines').locator('article')
  const names = await cards.locator('h2').allTextContents()
  expect(new Set(names).size).toBe(names.length)
  const pianissimo = cards.filter({
    has: page.getByRole('heading', { name: 'Italian Game: Giuoco Pianissimo', exact: true }),
  })
  await expect(pianissimo).toHaveCount(1)
  await pianissimo.locator('summary').click()
  const alternative = pianissimo.locator('.learn-line-alternative').first()
  const moves = await alternative.locator('.learn-line-moves').innerText()
  await expect(alternative.getByRole('progressbar')).toHaveAttribute('value', '0')
  await alternative.getByRole('link', { name: 'Train' }).click()
  await expect(page.getByRole('region', { name: 'Opening board' })).toBeVisible()
  const lineUrl = page.url()
  await page.reload()
  await expect(page).toHaveURL(lineUrl)
  await expect(page.getByRole('region', { name: 'Opening board' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Italian Game' })
    .click()
  await pianissimo.locator('summary').click()
  await expect(pianissimo.locator('.learn-line-alternative').first().locator('.learn-line-moves')).toHaveText(
    moves,
  )
})

test('links opening lines and preserves partial progress separately for each side', async ({ page }) => {
  await page.goto('/#/openings')
  await page
    .getByLabel('Openings', { exact: true })
    .locator('article')
    .filter({ hasText: 'Italian Game' })
    .getByRole('button', { name: 'Train' })
    .click()
  await expect(page).toHaveURL(/#\/openings\/italian-game\?side=w$/)
  await expect(page.getByRole('region', { name: 'My repertoire' })).toHaveCount(0)
  const lines = page.getByLabel('Opening lines')
  await expect(lines.locator('article').first()).toContainText('Main line')
  const line = lines.locator('article').filter({
    has: page.getByText('1. e4 e5 2. Nf3 Nc6 3. Bc4', { exact: true }),
  })
  await expect(line.getByRole('progressbar')).toHaveAttribute('value', '0')
  await line.getByRole('link', { name: 'Train' }).click()
  await expect(page).toHaveURL(/#\/openings\/italian-game\/italian-game-[a-z0-9]+\?side=w$/)
  const lineUrl = page.url()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Italian Game')
  await expect(page.getByRole('region', { name: 'My repertoire' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start playback' }).click()
  await expect(page.getByText('Line viewed! Continue to level 1.')).toBeVisible()
  await page.getByRole('button', { name: 'Start level 1' }).click()
  await page.getByRole('button', { name: 'White pawn, e2' }).click()
  await page.locator('[data-square="e4"]').click()
  await expect(page.getByRole('button', { name: 'Black pawn, e5' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Italian Game' })
    .click()
  await expect(line.getByRole('progressbar')).toHaveAttribute('value', '33')
  await page.reload()
  await expect(line.getByRole('progressbar')).toHaveAttribute('value', '33')
  await page.getByRole('radio', { name: 'Black' }).check()
  await expect(line.getByRole('progressbar')).toHaveAttribute('value', '0')
  await page.goto(lineUrl)
  await expect(page.getByRole('region', { name: 'Opening board' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/italian-game\?side=b$/)
  await page.goForward()
  await expect(page).toHaveURL(lineUrl)
  await page.goto('/#/openings/italian-game/not-a-line?side=w')
  await expect(page.getByRole('alert')).toContainText('could not be found')
})

test('advances through training levels and falls back after an attempt with mistakes', async ({ page }) => {
  await page.goto('/#/openings/italian-game?side=w')
  const line = page
    .getByLabel('Opening lines')
    .locator('article')
    .filter({
      has: page.getByText('1. e4 e5 2. Nf3 Nc6 3. Bc4', { exact: true }),
    })
  await line.getByRole('link', { name: 'Train' }).click()
  const level = page.getByLabel('Training level', { exact: true })
  await expect(level).toContainText('Level 0 of 3')
  await page.getByRole('button', { name: 'Start playback' }).click()
  await expect(page.getByRole('button', { name: 'White pawn, e4' })).toBeVisible()
  await expect(page.getByText('Line viewed! Continue to level 1.')).toBeVisible()
  await expect(level).toContainText('Level 1 of 3')
  await page.reload()
  await expect(level).toContainText('Level 1 of 3')

  const playWhite = async (mistake = false) => {
    if (mistake) {
      await page.getByRole('button', { name: 'White pawn, d2' }).click()
      await page.locator('[data-square="d4"]').click()
      await expect(page.getByText('Incorrect move. Try again.')).toBeVisible()
    }
    await page.getByRole('button', { name: 'White pawn, e2' }).click()
    await page.locator('[data-square="e4"]').click()
    await expect(page.getByRole('button', { name: 'Black pawn, e5' })).toBeVisible()
    await page.getByRole('button', { name: 'White knight, g1' }).click()
    await page.locator('[data-square="f3"]').click()
    await expect(page.getByRole('button', { name: 'Black knight, c6' })).toBeVisible()
    await page.getByRole('button', { name: 'White bishop, f1' }).click()
    await page.locator('[data-square="c4"]').click()
  }

  await page.getByRole('button', { name: 'Start level 1' }).click()
  await expect(page.getByText('Hint: e2 to e4.')).toBeVisible()
  await expect(page.locator('marker[id$="-arrowhead-0-e2-e4"]')).toHaveCount(1)
  await expect(page.locator('.learn-piece-hint')).toHaveCount(0)
  await playWhite()
  await expect(page.getByText('Level 1 complete! Continue to level 2.')).toBeVisible()
  await page.getByRole('button', { name: 'Start level 2' }).click()
  await expect(page.getByText('Hint: move the piece on e2.')).toBeVisible()
  await expect(page.locator('marker[id$="-arrowhead-0-e2-e4"]')).toHaveCount(0)
  await expect(page.locator('[data-square="e2"] .learn-piece-hint')).toHaveCount(1)
  await playWhite()
  await expect(page.getByText('Level 2 complete! Continue to level 3.')).toBeVisible()
  await page.getByRole('button', { name: 'Start level 3' }).click()
  await expect(page.getByText(/^Hint:/)).toHaveCount(0)
  await expect(page.locator('marker[id*="-arrowhead-"]')).toHaveCount(0)
  await expect(page.locator('.learn-piece-hint')).toHaveCount(0)
  await playWhite()
  await expect(page.getByText('Line mastered! You can practice level 3 again.')).toBeVisible()
  await expect(level).toContainText('Mastered')
  await page.reload()
  await expect(level).toContainText('Mastered')
  await page.getByRole('radio', { name: 'Black' }).check()
  await expect(level).toContainText('Level 0 of 3')
  await page.getByRole('radio', { name: 'White' }).check()
  await expect(level).toContainText('Mastered')
  await page.getByRole('button', { name: 'Start level 3' }).click()
  await playWhite(true)
  await expect(page.getByText('Attempt complete with mistakes. Return to level 2.')).toBeVisible()
  await expect(level).not.toContainText('Mastered')
  await page.getByRole('button', { name: 'Start level 2' }).click()
  await playWhite(true)
  await expect(page.getByText('Attempt complete with mistakes. Return to level 1.')).toBeVisible()
  await page.getByRole('button', { name: 'Start level 1' }).click()
  await playWhite(true)
  await expect(page.getByText('Attempt complete with mistakes. Return to level 0.')).toBeVisible()
  await page.reload()
  await expect(level).toContainText('Level 0 of 3')
})

test('does not advance practice for a side with no moves in a line', async ({ page }) => {
  await page.goto('/#/openings/english-opening?side=b')
  const line = page
    .getByLabel('Opening lines')
    .locator('article')
    .filter({
      has: page.getByText('1. c4', { exact: true }),
    })
  await line.getByRole('link', { name: 'Train', exact: true }).click()
  await page.getByRole('button', { name: 'Start playback' }).click()
  await expect(page.getByText('This line has no moves for Black. Choose another side or line.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start level 1' })).toBeDisabled()
  await page.getByRole('radio', { name: 'White' }).check()
  await expect(page.getByLabel('Training level', { exact: true })).toContainText('Level 0 of 3')
})

test('reports failure to save a training level without advancing', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = localStorage.setItem.bind(localStorage)
    Storage.prototype.setItem = function (key, value) {
      if (key === 'chessreview.opening-levels') throw new Error('Storage unavailable')
      return setItem(key, value)
    }
  })
  await page.goto('/#/openings/english-opening?side=w')
  const line = page
    .getByLabel('Opening lines')
    .locator('article')
    .filter({
      has: page.getByText('1. c4', { exact: true }),
    })
  await line.getByRole('link', { name: 'Train', exact: true }).click()
  await page.getByRole('button', { name: 'Start playback' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Could not save your training level. Check browser storage.',
  )
  await expect(page.getByLabel('Training level', { exact: true })).toContainText('Level 0 of 3')
  await expect(page.getByRole('button', { name: 'Start playback' })).toBeDisabled()
})

test('offers the Scandinavian main line without removing the original opening', async ({ page }) => {
  await page.goto('/#/openings')
  await page.getByRole('radio', { name: 'Black' }).check()
  await page
    .getByLabel('Openings')
    .locator('article')
    .filter({ hasText: 'Scandinavian Defense' })
    .getByRole('button', { name: 'Train' })
    .click()
  const lines = page.getByLabel('Opening lines')
  const recommended = lines.locator('article').first()
  await expect(recommended).toContainText('Scandinavian Defense: Main Line')
  await expect(recommended).toContainText('Main line')
  await expect(lines.getByText('1. e4 d5', { exact: true })).toBeVisible()
  await recommended.getByRole('link', { name: 'Train' }).click()
  await expect(page.getByLabel('Opening moves').getByRole('button')).toHaveCount(15)
  await page.getByLabel('Opening moves').getByRole('button', { name: '8. O-O' }).click()
  await expect(page.getByRole('button', { name: 'White king, g1' })).toBeVisible()
  await page.getByRole('button', { name: 'Add to repertoire' }).click()
  await page.reload()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Openings' }).click()
  await showRepertoire(page)
  await expect(page.getByRole('region', { name: 'My repertoire' }).locator('article strong')).toHaveText(
    'Scandinavian Defense',
  )
  await page
    .getByRole('region', { name: 'My repertoire' })
    .getByRole('button', { name: 'Train Scandinavian Defense as Black' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Scandinavian Defense', exact: true, level: 1 }),
  ).toBeVisible()
  await page
    .getByLabel('Opening lines')
    .locator('article')
    .first()
    .getByRole('link', { name: 'Train' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Scandinavian Defense: Main Line, classical development' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove from repertoire' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add to repertoire' })).toHaveCount(0)
})

test('lays out opening and repertoire cards responsively and keeps stars in sync', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/openings')
  const openings = page.getByLabel('Openings', { exact: true })
  const cards = openings.locator('article')
  for (const [width, columns] of [
    [390, 1],
    [700, 2],
    [1024, 3],
    [1440, 4],
    [1920, 4],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    const boxes = await Promise.all(
      Array.from({ length: columns + 1 }, (_, index) => cards.nth(index).boundingBox()),
    )
    expect(boxes.every((box) => box !== null)).toBe(true)
    for (let index = 1; index < columns; index++) {
      expect(boxes[index]!.y).toBe(boxes[0]!.y)
      expect(boxes[index]!.x).toBeGreaterThan(boxes[index - 1]!.x)
    }
    expect(boxes[columns]!.y).toBeGreaterThan(boxes[0]!.y)
    const lastBox = await cards.last().boundingBox()
    expect(lastBox!.width).toBeCloseTo(boxes[0]!.width, 1)
    expect(
      await cards.evaluateAll((elements) =>
        elements.every((element) => element.scrollWidth <= element.clientWidth),
      ),
    ).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  const first = cards.nth(0)
  const second = cards.nth(1)
  const firstBox = await first.boundingBox()
  const secondBox = await second.boundingBox()
  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()
  expect(secondBox!.x).toBeGreaterThan(firstBox!.x + firstBox!.width)
  expect(secondBox!.y).toBe(firstBox!.y)
  await first.getByRole('button', { name: /in repertoire/ }).click()
  await second.getByRole('button', { name: /in repertoire/ }).click()
  await showRepertoire(page)
  const saved = page.getByRole('region', { name: 'My repertoire' }).locator('article')
  await expect(saved).toHaveCount(2)
  const savedFirst = await saved.nth(0).boundingBox()
  const savedSecond = await saved.nth(1).boundingBox()
  expect(savedFirst!.width).toBeCloseTo(firstBox!.width, 1)
  expect(savedSecond!.x).toBeGreaterThan(savedFirst!.x + savedFirst!.width)
  expect(savedSecond!.y).toBe(savedFirst!.y)
  await first.getByRole('button', { name: /in repertoire/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(saved).toHaveCount(1)
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileFirst = await first.boundingBox()
  const mobileSecond = await second.boundingBox()
  expect(mobileSecond!.y).toBeGreaterThan(mobileFirst!.y + mobileFirst!.height)
  expect(mobileSecond!.x).toBe(mobileFirst!.x)
})

test('keeps card widths unchanged when filtering leaves fewer cards than columns', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto('/#/openings')
  const cards = page.getByLabel('Openings', { exact: true }).locator('article')
  await expect(cards).toHaveCount(16)
  const fullWidth = (await cards.first().boundingBox())!.width
  await page.getByRole('combobox', { name: 'Level' }).selectOption('Expert')
  await page.getByRole('combobox', { name: 'Style' }).selectOption('Aggressive')
  await expect(cards).toHaveCount(2)
  for (const card of await cards.all()) {
    expect((await card.boundingBox())!.width).toBeCloseTo(fullWidth, 1)
  }
})
