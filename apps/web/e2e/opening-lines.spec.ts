import { expect, test } from '@playwright/test'

test('shows opening moves and named variations while preserving hidden line links', async ({ page }) => {
  for (const { opening, name, moves, alternateOrder } of [
    {
      opening: 'ponziani-opening',
      name: 'Ponziani Opening',
      moves: '1. e4 e5 2. Nf3 Nc6 3. c3',
      alternateOrder: true,
    },
    {
      opening: 'scandinavian-defense',
      name: 'Scandinavian Defense',
      moves: '1. e4 d5',
      alternateOrder: false,
    },
    { opening: 'caro-kann-defense', name: 'Caro-Kann Defense', moves: '1. e4 c6', alternateOrder: false },
    { opening: 'sicilian-defense', name: 'Sicilian Defense', moves: '1. e4 c5', alternateOrder: false },
  ]) {
    await page.goto(`/#/openings/${opening}?side=w`)
    const cards = page.getByLabel('Opening lines').locator('.learn-line-card')
    await expect(cards.first().getByRole('heading', { name: 'Opening moves' })).toBeVisible()
    await expect(cards.first().locator('.learn-line-moves')).toHaveText(moves)
    await expect(cards.first().locator('.learn-card-description')).toHaveText(
      `These moves define the ${name}${alternateOrder ? '; other move orders may also be possible.' : '.'}`,
    )
    await expect(cards.first().getByRole('button', { name: 'Watch', exact: true })).toBeVisible()
    if (opening === 'ponziani-opening') {
      await expect(
        cards.getByRole('heading', { name: 'Ponziani Opening: Romanishin Variation' }),
      ).toBeVisible()
      await expect(cards.getByRole('heading', { name: 'Ponziani Opening: Réti Variation' })).toBeVisible()
      await expect(cards.getByRole('heading', { name: 'Main line' })).toBeVisible()
    }
  }

  await page.goto('/#/openings/ponziani-opening/ponziani-opening-jaenisch-counterattack-1jjacgq?side=w')
  await expect(page.getByRole('region', { name: 'Opening board' })).toBeVisible()
  await expect(page.getByLabel('Opening moves').getByRole('button')).toHaveCount(6)
})

test('allows authenticated Lichess Explorer requests under the production CSP', async ({ page }) => {
  await page.route('https://explorer.lichess.org/**', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'authorization',
        'content-type': 'application/json',
      },
      body: '{"moves":[]}',
    }),
  )
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const response = await fetch(
      'https://explorer.lichess.org/lichess?variant=standard&speeds=rapid&ratings=0&moves=1&fen=rnbqkbnr%2Fpppppppp%2F8%2F8%2F8%2F8%2FPPPPPPPP%2FRNBQKBNR%20w%20KQkq%20-%200%201',
      { headers: { Authorization: 'Bearer test-token' } },
    )
    const body: unknown = await response.json()
    const moves =
      typeof body === 'object' && body !== null && 'moves' in body && Array.isArray(body.moves)
        ? body.moves.length
        : -1
    return { ok: response.ok, moves }
  })
  expect(result).toEqual({ ok: true, moves: 0 })
})

test('unlocks the first Lichess level from saved level-three mastery and requires login', async ({
  page,
}) => {
  await page.goto('/#/openings/ponziani-opening/ponziani-opening-jaenisch-counterattack-1jjacgq?side=w')
  await page.evaluate(() =>
    localStorage.setItem(
      'chessreview.opening-levels',
      JSON.stringify([
        {
          id: 'C44\tPonziani Opening: Jaenisch Counterattack\t1. e4 e5 2. Nf3 Nc6 3. c3 Nf6',
          side: 'w',
          level: 3,
          mastered: true,
        },
      ]),
    ),
  )
  await page.reload()

  await expect(page.getByLabel('Training level').getByText('Level 4', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Training level')).toContainText('Lichess Rapid ratings 0–999.')
  await expect(page.getByText('the closest available group', { exact: false })).toHaveCount(0)
  await expect(page.getByText('After this variation, play', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Connect Lichess', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect Lichess to continue' })).toBeEnabled()
  await page.route('https://lichess.org/oauth**', (route) => route.fulfill({ status: 200, body: 'OAuth' }))
  const authorization = page.waitForRequest('https://lichess.org/oauth**')
  await page.getByRole('button', { name: 'Connect Lichess to continue' }).click()
  expect(new URL((await authorization).url()).searchParams.get('response_type')).toBe('code')
})

test('offers a hint after consecutive errors and reviews an unfinished attempt on giving up', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/openings/ponziani-opening/ponziani-opening-jaenisch-counterattack-1jjacgq?side=w')
  await page.evaluate(() =>
    localStorage.setItem(
      'chessreview.opening-levels',
      JSON.stringify([
        {
          id: 'C44\tPonziani Opening: Jaenisch Counterattack\t1. e4 e5 2. Nf3 Nc6 3. c3 Nf6',
          side: 'w',
          level: 3,
          mastered: false,
        },
      ]),
    ),
  )
  await page.reload()
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  await page.getByRole('button', { name: 'Start Level 3' }).click()
  const wrongMove = async (piece: string, target: string) => {
    await page.getByRole('button', { name: piece }).click()
    await page.locator(`[data-square="${target}"]`).click()
    await expect(page.getByRole('img', { name: 'Incorrect move' })).toBeVisible()
    await page.clock.runFor(50)
    await page.clock.runFor(1000)
    await page.clock.runFor(50)
    await expect(page.getByRole('button', { name: piece })).toBeEnabled()
  }
  await wrongMove('White pawn, d2', 'd4')
  await expect(page.getByRole('button', { name: 'Show hint' })).toHaveCount(0)
  await wrongMove('White pawn, c2', 'c4')
  await expect(page.getByRole('button', { name: 'Show hint' })).toBeEnabled()
  await page.getByRole('button', { name: 'Show hint' }).click()
  await expect(page.getByText('Hint: e2 to e4.')).toBeVisible()
  await page.getByRole('button', { name: 'White pawn, e2' }).click()
  await page.locator('[data-square="e4"]').click()
  await expect(page.getByText('Opponent plays…')).toBeVisible()
  await page.clock.runFor(650)
  await page.clock.runFor(50)
  await expect(page.getByRole('button', { name: 'Black pawn, e5' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show hint' })).toHaveCount(0)
  await expect(page.getByText('Hint: e2 to e4.')).toHaveCount(0)
  await wrongMove('White knight, b1', 'c3')
  await wrongMove('White knight, b1', 'a3')
  await expect(page.getByRole('button', { name: 'Show hint' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Give up' })).toHaveCount(0)
  await wrongMove('White pawn, d2', 'd4')
  await expect(page.getByRole('button', { name: 'Restart' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Give up' }).click()
  await expect(page.getByText('You gave up. Your level dropped.')).toBeVisible()
  await expect(page.getByLabel('Training level').getByText('Level 2', { exact: true })).toBeVisible()
  const moves = page.getByLabel('Practice moves')
  await expect(moves.getByRole('button', { name: '2. Nc3 (Incorrect move)' })).toBeVisible()
  await expect(moves.getByRole('button', { name: '2. Na3 (Incorrect move)' })).toBeVisible()
  await expect(moves.getByRole('button', { name: '2. d4 (Incorrect move)' })).toBeVisible()
  await expect(moves.getByRole('button', { name: '2. Nf3', exact: true })).toHaveCount(0)
  const statistics = page.getByLabel('Training statistics')
  await expect(statistics.locator('.tile').filter({ hasText: 'Completed attempts' })).toContainText('0')
  await expect(statistics.locator('.tile').filter({ hasText: 'Errors' })).toContainText('5')
})

test('giving up during the forced variation does not lower the level or record errors', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/openings/ponziani-opening/ponziani-opening-jaenisch-counterattack-1jjacgq?side=w')
  await page.evaluate(() => {
    localStorage.setItem(
      'chessreview.opening-levels',
      JSON.stringify([
        {
          id: 'C44\tPonziani Opening: Jaenisch Counterattack\t1. e4 e5 2. Nf3 Nc6 3. c3 Nf6',
          side: 'w',
          level: 4,
          mastered: false,
        },
      ]),
    )
    sessionStorage.setItem('chessreview.lichess-token', 'test-token')
  })
  await page.reload()
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  await page.getByRole('button', { name: 'Start Level 4' }).click()
  for (let count = 0; count < 3; count++) {
    await page.getByRole('button', { name: 'White pawn, d2' }).click()
    await page.locator('[data-square="d4"]').click()
    await expect(page.getByRole('img', { name: 'Incorrect move' })).toBeVisible()
    await page.clock.runFor(50)
    await page.clock.runFor(1000)
    await page.clock.runFor(50)
    await expect(page.getByRole('button', { name: 'White pawn, d2' })).toBeEnabled()
  }
  await page.getByRole('button', { name: 'Give up' }).click()
  await expect(page.getByText('You gave up. Your level stays the same.')).toBeVisible()
  await expect(page.getByLabel('Training level').getByText('Level 4', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Practice moves').getByRole('button', { name: /Incorrect move/ })).toHaveCount(
    0,
  )
  const statistics = page.getByLabel('Training statistics')
  await expect(statistics.locator('.tile').filter({ hasText: 'Completed attempts' })).toContainText('0')
  await expect(statistics.locator('.tile').filter({ hasText: 'Errors' })).toContainText('0')
})

test('forced variation mistakes do not prevent advancing or appear in the review', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/engine/stockfish-19-lite-single.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        let fen = '';
        self.onmessage = ({ data }) => {
          if (data === 'uci') postMessage('uciok');
          else if (data === 'isready') postMessage('readyok');
          else if (data.startsWith('position fen ')) fen = data.slice(13);
          else if (data.startsWith('go ')) {
            const best = fen.split(' ')[1] === 'b' ? 'a7a6' : 'a2a3';
            postMessage('info depth 14 nodes 400000 score cp 0 pv ' + best);
            postMessage('bestmove ' + best);
          }
        };
      `,
    }),
  )
  await page.route('https://explorer.lichess.org/**', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'authorization',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ moves: [{ uci: 'd7d5', san: 'd5', white: 40, draws: 20, black: 40 }] }),
    }),
  )
  await page.goto('/#/openings/ponziani-opening/ponziani-opening-jaenisch-counterattack-1jjacgq?side=w')
  await page.evaluate(() => {
    localStorage.setItem(
      'chessreview.opening-levels',
      JSON.stringify([
        {
          id: 'C44\tPonziani Opening: Jaenisch Counterattack\t1. e4 e5 2. Nf3 Nc6 3. c3 Nf6',
          side: 'w',
          level: 4,
          mastered: false,
        },
      ]),
    )
    sessionStorage.setItem('chessreview.lichess-token', 'test-token')
  })
  await page.reload()
  await page.getByRole('button', { name: 'Start Level 4' }).click()
  await page.getByRole('button', { name: 'White pawn, d2' }).click()
  await page.locator('[data-square="d4"]').click()
  await expect(page.getByRole('img', { name: 'Incorrect move' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'White pawn, d2' })).toBeEnabled()
  for (const [piece, target, reply] of [
    ['White pawn, e2', 'e4', 'Black pawn, e5'],
    ['White knight, g1', 'f3', 'Black knight, c6'],
    ['White pawn, c2', 'c3', 'Black knight, f6'],
  ]) {
    await page.getByRole('button', { name: piece }).click()
    await page.locator(`[data-square="${target}"]`).click()
    await expect(page.getByRole('button', { name: reply })).toBeVisible()
  }
  await page.getByRole('button', { name: 'White pawn, d2' }).click()
  await page.locator('[data-square="d4"]').click()
  await expect(page.getByRole('button', { name: 'Black pawn, d5' })).toBeVisible()
  await page.getByRole('button', { name: 'White bishop, f1' }).click()
  await page.locator('[data-square="b5"]').click()
  await expect(page.getByLabel('Training level').getByText('Level 5', { exact: true })).toBeVisible()
  const moves = page.getByLabel('Practice moves')
  await expect(moves.getByRole('button', { name: '1. e4', exact: true })).toBeVisible()
  await expect(moves.getByRole('button', { name: '1. d4 (Incorrect move)' })).toHaveCount(0)
  await expect(
    page.getByLabel('Training statistics').locator('.tile').filter({ hasText: 'Errors' }),
  ).toContainText('0')
})

test('giving up after the variation reviews the rejected moves and lowers the level', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/engine/stockfish-19-lite-single.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        let fen = '';
        self.onmessage = ({ data }) => {
          if (data === 'uci') postMessage('uciok');
          else if (data === 'isready') postMessage('readyok');
          else if (data.startsWith('position fen ')) fen = data.slice(13);
          else if (data.startsWith('go ')) {
            const score = fen.split(' ')[0].split('/')[5].endsWith('P') ? 80 : 0;
            const best = fen.split(' ')[1] === 'b' ? 'd7d5' : 'd2d4';
            postMessage('info depth 14 nodes 400000 score cp ' + score + ' pv ' + best);
            postMessage('bestmove ' + best);
          }
        };
      `,
    }),
  )
  await page.goto('/#/openings/ponziani-opening/ponziani-opening-jaenisch-counterattack-1jjacgq?side=w')
  await page.evaluate(() => {
    localStorage.setItem(
      'chessreview.opening-levels',
      JSON.stringify([
        {
          id: 'C44\tPonziani Opening: Jaenisch Counterattack\t1. e4 e5 2. Nf3 Nc6 3. c3 Nf6',
          side: 'w',
          level: 4,
          mastered: false,
        },
      ]),
    )
    sessionStorage.setItem('chessreview.lichess-token', 'test-token')
  })
  await page.reload()
  await page.getByRole('button', { name: 'Start Level 4' }).click()
  for (const [piece, target, reply] of [
    ['White pawn, e2', 'e4', 'Black pawn, e5'],
    ['White knight, g1', 'f3', 'Black knight, c6'],
    ['White pawn, c2', 'c3', 'Black knight, f6'],
  ]) {
    await page.getByRole('button', { name: piece }).click()
    await page.locator(`[data-square="${target}"]`).click()
    await expect(page.getByRole('button', { name: reply })).toBeVisible()
  }
  for (let count = 0; count < 3; count++) {
    await page.getByRole('button', { name: 'White pawn, h2' }).click()
    await page.locator('[data-square="h3"]').click()
    await expect(
      page.getByText('Inaccuracy taken back. Try again; your level will drop after this run.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'White pawn, h2' })).toBeEnabled()
    if (count === 1) {
      await page.getByRole('button', { name: 'Show hint' }).click()
      await expect(page.getByText('Hint: d2 to d4.')).toBeVisible()
    }
  }
  await page.getByRole('button', { name: 'Give up' }).click()
  await expect(page.getByLabel('Training level').getByText('Level 3', { exact: true })).toBeVisible()
  await expect(
    page.getByLabel('Practice moves').getByRole('button', { name: '4. h3 (Inaccuracy)' }),
  ).toHaveCount(3)
  await expect(page.getByRole('link', { name: 'Revoke access on Lichess' })).toBeVisible()
})

test('shows incorrect moves before taking them back and delays the fixed reply', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/openings/ponziani-opening/ponziani-opening-jaenisch-counterattack-1jjacgq?side=w')
  await page.evaluate(() =>
    localStorage.setItem(
      'chessreview.opening-levels',
      JSON.stringify([
        {
          id: 'C44\tPonziani Opening: Jaenisch Counterattack\t1. e4 e5 2. Nf3 Nc6 3. c3 Nf6',
          side: 'w',
          level: 1,
          mastered: false,
        },
      ]),
    ),
  )
  await page.reload()
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  await page.getByRole('button', { name: 'Start Level 1' }).click()
  await page.getByRole('button', { name: 'White pawn, d2' }).click()
  await page.locator('[data-square="d4"]').click()
  await page.clock.runFor(50)
  await expect(page.getByRole('button', { name: 'White pawn, d4' })).toBeVisible()
  await page.clock.runFor(949)
  await expect(page.getByRole('button', { name: 'White pawn, d4' })).toBeVisible()
  await page.clock.runFor(1)
  await page.clock.runFor(50)
  await expect(page.getByRole('button', { name: 'White pawn, d2' })).toBeEnabled()

  await page.getByRole('button', { name: 'White pawn, e2' }).click()
  await page.locator('[data-square="e4"]').click()
  await expect(page.getByText('Opponent plays…')).toBeVisible()
  await page.clock.runFor(649)
  await expect(page.getByRole('button', { name: 'Black pawn, e7' })).toBeVisible()
  await page.clock.runFor(1)
  await page.clock.runFor(50)
  await expect(page.getByRole('button', { name: 'Black pawn, e5' })).toBeVisible()
})

for (const evaluation of ['fast', 'slow', 'accepted', 'restart'] as const) {
  test(`shows a move immediately during ${evaluation} Stockfish evaluation`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('**/engine/stockfish-19-lite-single.js', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `
          let fen = '', first = true, pending;
          const channel = new BroadcastChannel('opening-engine-test');
          const respond = () => {
            const ranks = fen.split(' ')[0].split('/');
            const score = ${evaluation === 'accepted' ? '0' : "ranks[5].endsWith('P') ? 80 : 0"};
            const best = fen.split(' ')[1] === 'b' ? 'd7d5' : 'd2d4';
            postMessage('info depth 14 nodes 400000 score cp ' + score + ' pv ' + best);
            postMessage('bestmove ' + best);
            channel.postMessage('done');
          };
          channel.onmessage = ({ data }) => {
            if (data === 'release' && pending) { pending(); pending = undefined; }
          };
          self.onmessage = ({ data }) => {
            if (data === 'uci') postMessage('uciok');
            else if (data === 'isready') postMessage('readyok');
            else if (data.startsWith('position fen ')) fen = data.slice(13);
            else if (data.startsWith('go ')) {
              if (first) { first = false; pending = respond; channel.postMessage('waiting'); }
              else respond();
            }
          };
        `,
      }),
    )
    await page.route('https://explorer.lichess.org/**', (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': 'authorization',
          'content-type': 'application/json',
        },
        body: '{"moves":[]}',
      }),
    )
    await page.goto('/#/openings/ponziani-opening/ponziani-opening-jaenisch-counterattack-1jjacgq?side=w')
    await page.evaluate(() => {
      localStorage.setItem(
        'chessreview.opening-levels',
        JSON.stringify([
          {
            id: 'C44\tPonziani Opening: Jaenisch Counterattack\t1. e4 e5 2. Nf3 Nc6 3. c3 Nf6',
            side: 'w',
            level: 4,
            mastered: false,
          },
        ]),
      )
      sessionStorage.setItem('chessreview.lichess-token', 'test-token')
    })
    await page.reload()
    await page.getByRole('button', { name: 'Start Level 4' }).click()
    for (const [piece, target, reply] of [
      ['White pawn, e2', 'e4', 'Black pawn, e5'],
      ['White knight, g1', 'f3', 'Black knight, c6'],
      ['White pawn, c2', 'c3', 'Black knight, f6'],
    ]) {
      await page.getByRole('button', { name: piece }).click()
      await page.locator(`[data-square="${target}"]`).click()
      await expect(page.getByRole('button', { name: reply })).toBeVisible()
    }

    await page.clock.install()
    await page.clock.pauseAt(new Date())
    const waiting = page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const channel = new BroadcastChannel('opening-engine-test')
          channel.onmessage = ({ data }) => {
            if (data === 'waiting') {
              channel.close()
              resolve()
            }
          }
        }),
    )
    await page.getByRole('button', { name: 'White pawn, h2' }).click()
    await page.locator('[data-square="h3"]').click()
    await waiting
    await page.clock.runFor(50)
    await expect(page.getByRole('button', { name: 'White pawn, h3' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Incorrect move' })).toHaveCount(0)
    await expect(page.getByText('Stockfish is evaluating your move…')).toBeVisible()

    if (evaluation === 'restart') {
      await page.getByRole('button', { name: 'Restart' }).click()
      await page.clock.runFor(50)
      await expect(page.getByRole('button', { name: 'White pawn, h2' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'White pawn, e2' })).toBeVisible()
      await expect(page.getByRole('img', { name: 'Incorrect move' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Start Level 4' })).toBeVisible()
      return
    }

    if (evaluation === 'slow') {
      await page.clock.runFor(950)
      await expect(page.getByRole('button', { name: 'White pawn, h3' })).toBeVisible()
      await expect(page.getByRole('img', { name: 'Incorrect move' })).toHaveCount(0)
    }
    const completed = page.evaluate(
      (expected) =>
        new Promise<void>((resolve) => {
          const channel = new BroadcastChannel('opening-engine-test')
          let count = 0
          channel.onmessage = ({ data }) => {
            if (data === 'done' && ++count === expected) {
              channel.close()
              resolve()
            }
          }
        }),
      evaluation === 'accepted' ? 2 : 3,
    )
    await page.evaluate(() => {
      const channel = new BroadcastChannel('opening-engine-test')
      channel.postMessage('release')
      channel.close()
    })
    await completed
    if (evaluation === 'accepted') {
      await expect(page.getByText('After the variation: 1 of 2 good moves')).toBeVisible()
      await expect(page.getByRole('button', { name: 'White pawn, h3' })).toBeVisible()
      await expect(page.getByRole('img', { name: 'Incorrect move' })).toHaveCount(0)
      return
    }
    await expect(page.getByText('Inaccuracy. Taking your move back…')).toBeVisible()
    await expect(page.getByRole('button', { name: 'White pawn, h3' })).toBeVisible()
    const marker = page.getByRole('img', { name: 'Incorrect move' })
    await expect(marker).toBeVisible()
    const markerBox = await marker.boundingBox()
    const squareBox = await page.locator('[data-square="h3"]').boundingBox()
    expect(markerBox).not.toBeNull()
    expect(squareBox).not.toBeNull()
    expect(markerBox!.x).toBeGreaterThanOrEqual(squareBox!.x)
    expect(markerBox!.y).toBeGreaterThanOrEqual(squareBox!.y)
    expect(markerBox!.x + markerBox!.width).toBeLessThanOrEqual(squareBox!.x + squareBox!.width)
    expect(markerBox!.y + markerBox!.height).toBeLessThanOrEqual(squareBox!.y + squareBox!.height)
    await page.clock.runFor(299)
    await expect(page.getByRole('button', { name: 'White pawn, h3' })).toBeVisible()
    await expect(marker).toBeVisible()
    await page.clock.runFor(1)
    await expect(marker).toHaveCount(0)
    await page.clock.runFor(50)
    await expect(page.getByRole('button', { name: 'White pawn, h2' })).toBeEnabled()
    await expect(
      page.getByText('Inaccuracy taken back. Try again; your level will drop after this run.'),
    ).toBeVisible()
  })
}

test('requires one more good move at each higher Lichess level', async ({ page }) => {
  await page.goto('/#/openings/ponziani-opening/ponziani-opening-jaenisch-counterattack-1jjacgq?side=w')
  await page.evaluate(() => sessionStorage.setItem('chessreview.lichess-token', 'test-token'))
  for (const [level, moves] of [
    [8, 6],
    [11, 9],
    [12, 10],
  ]) {
    await page.evaluate((level) => {
      localStorage.setItem(
        'chessreview.opening-levels',
        JSON.stringify([
          {
            id: 'C44\tPonziani Opening: Jaenisch Counterattack\t1. e4 e5 2. Nf3 Nc6 3. c3 Nf6',
            side: 'w',
            level,
            mastered: false,
          },
        ]),
      )
    }, level)
    await page.reload()
    const levelName = level === 11 ? 'IM Level' : level === 12 ? 'GM Level' : `Level ${level}`
    await page.getByRole('button', { name: `Start ${levelName}` }).click()
    for (const [piece, target, reply] of [
      ['White pawn, e2', 'e4', 'Black pawn, e5'],
      ['White knight, g1', 'f3', 'Black knight, c6'],
      ['White pawn, c2', 'c3', 'Black knight, f6'],
    ]) {
      await page.getByRole('button', { name: piece }).click()
      await page.locator(`[data-square="${target}"]`).click()
      await expect(page.getByRole('button', { name: reply })).toBeVisible()
    }
    await expect(page.getByText(`After the variation: 0 of ${moves} good moves`)).toBeVisible()
    await expect(page.getByLabel('Progress after the variation')).toHaveJSProperty('max', moves)
  }
})

test('takes back inaccurate and bad moves, allows retry, and drops a level only after two good moves', async ({
  page,
}) => {
  await page.route('**/engine/stockfish-19-lite-single.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        let fen = '';
        self.onmessage = ({ data }) => {
          if (data === 'uci') postMessage('uciok');
          else if (data === 'isready') postMessage('readyok');
          else if (data.startsWith('position fen ')) fen = data.slice(13);
          else if (data.startsWith('go ')) {
            const ranks = fen.split(' ')[0].split('/');
            const score = ranks[5].endsWith('P') ? 80 : ranks[4].startsWith('Q') ? 300 : 0;
            const best = fen.split(' ')[1] === 'b' ? 'd7d5' : ranks[6].startsWith('PPPP') ? 'd2d4' : 'a2a3';
            postMessage('info depth 14 nodes 400000 score cp ' + score + ' pv ' + best);
            postMessage('bestmove ' + best);
          }
        };
      `,
    }),
  )
  let requests = 0
  await page.route('https://explorer.lichess.org/**', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': 'authorization',
        },
      })
    requests++
    return route.fulfill(
      requests === 1
        ? { status: 503, headers: { 'access-control-allow-origin': '*' } }
        : {
            status: 200,
            headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
            body: JSON.stringify({
              moves: [{ uci: 'd7d5', san: 'd5', white: 40, draws: 20, black: 40 }],
            }),
          },
    )
  })
  await page.goto('/#/openings/ponziani-opening/ponziani-opening-jaenisch-counterattack-1jjacgq?side=w')
  await page.evaluate(() => {
    localStorage.setItem(
      'chessreview.opening-levels',
      JSON.stringify([
        {
          id: 'C44\tPonziani Opening: Jaenisch Counterattack\t1. e4 e5 2. Nf3 Nc6 3. c3 Nf6',
          side: 'w',
          level: 4,
          mastered: false,
        },
      ]),
    )
    sessionStorage.setItem('chessreview.lichess-token', 'test-token')
  })
  await page.reload()
  const sessionControls = page.locator('.learn-lichess-session')
  await expect(sessionControls.getByRole('link', { name: 'Revoke access on Lichess' })).toBeVisible()
  expect(
    await sessionControls.evaluate((element) =>
      Boolean(element.previousElementSibling?.matches('[aria-label="Training statistics"]')),
    ),
  ).toBe(true)
  await expect(page.getByText('Variation: 0 of 6 moves played')).toBeVisible()
  await expect(page.getByLabel('Variation progress')).toHaveJSProperty('value', 0)
  await expect(page.getByLabel('Variation progress')).toHaveJSProperty('max', 6)
  await expect(page.getByLabel('Progress after the variation')).toHaveCount(0)
  await expect(page.getByText('After the variation:', { exact: false })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start Level 4' }).click()
  await page.getByRole('button', { name: 'White pawn, d2' }).click()
  await page.locator('[data-square="d4"]').click()
  await expect(page.getByRole('img', { name: 'Incorrect move' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'White pawn, d2' })).toBeEnabled()
  for (const [piece, target, reply, played] of [
    ['White pawn, e2', 'e4', 'Black pawn, e5', 2],
    ['White knight, g1', 'f3', 'Black knight, c6', 4],
    ['White pawn, c2', 'c3', 'Black knight, f6', 6],
  ] as const) {
    await page.getByRole('button', { name: piece }).click()
    await page.locator(`[data-square="${target}"]`).click()
    await expect(page.getByRole('button', { name: reply })).toBeVisible()
    if (played < 6) {
      await expect(page.getByText(`Variation: ${played} of 6 moves played`)).toBeVisible()
      await expect(page.getByLabel('Variation progress')).toHaveJSProperty('value', played)
      await expect(page.getByLabel('Progress after the variation')).toHaveCount(0)
    }
  }

  await expect(page.getByText('Variation complete ✓')).toBeVisible()
  await expect(page.getByLabel('Variation progress')).toHaveCount(0)
  await expect(page.getByText('After the variation: 0 of 2 good moves')).toBeVisible()
  await expect(page.getByLabel('Progress after the variation')).toHaveJSProperty('value', 0)
  await page.getByRole('button', { name: 'White pawn, h2' }).click()
  await page.locator('[data-square="h3"]').click()
  await expect(page.getByRole('button', { name: 'White pawn, h3' })).toBeVisible()
  await expect(
    page.getByText('Inaccuracy taken back. Try again; your level will drop after this run.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'White pawn, h2' })).toBeEnabled()
  await expect(page.getByText('After the variation: 0 of 2 good moves')).toBeVisible()
  await expect(page.getByLabel('Progress after the variation')).toHaveJSProperty('value', 0)

  await page.getByRole('button', { name: 'White queen, d1' }).click()
  await page.locator('[data-square="a4"]').click()
  await expect(page.getByText('Stockfish rejected that move. Try again.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'White queen, d1' })).toBeEnabled()
  await page.getByRole('button', { name: 'Show hint' }).click()
  await expect(page.getByText('Hint: a2 to a3.')).toBeVisible()

  await page.getByRole('button', { name: 'White pawn, d2' }).click()
  await page.locator('[data-square="d4"]').click()
  await expect(page.getByRole('alert')).toContainText('HTTP 503')
  await expect(page.getByText('After the variation: 1 of 2 good moves')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show hint' })).toHaveCount(0)
  await expect(page.getByLabel('Progress after the variation')).toHaveJSProperty('value', 1)
  await page.getByRole('button', { name: 'Retry Lichess' }).click()
  await expect(page.getByRole('button', { name: 'Black pawn, d5' })).toBeVisible()

  await page.getByRole('button', { name: 'White bishop, f1' }).click()
  await page.locator('[data-square="b5"]').click()
  await expect(page.locator('.stage-side').getByText('Level completed with mistakes.')).toBeVisible()
  await expect(page.locator('.stage-side').getByRole('button', { name: 'Start Level 3' })).toBeVisible()
  await expect(page.getByLabel('Training level').getByText('Level 3', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Review · Ponziani Opening: Jaenisch Counterattack' }),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: /^Evaluation/ })).toBeVisible()
  await expect(page.getByLabel('Practice moves')).toContainText('4. h3 (Inaccuracy)')
  await expect(page.getByLabel('Practice moves')).toContainText('4. Qa4 (Blunder)')
  await expect(
    page.getByLabel('Practice moves').getByRole('button', { name: '1. d4 (Incorrect move)' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '4. h3 (Inaccuracy)' }).click()
  await expect(page.getByText('Inaccuracy: 4. h3.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'White pawn, h3' })).toBeVisible()
  const best = page.getByRole('checkbox', { name: 'Show best move' })
  await expect(best).toBeChecked()
  const bestArrow = page.locator('marker[id$="-arrowhead-0-d7-d5"]')
  await expect(bestArrow).toHaveCount(1)
  await page.keyboard.press('b')
  await expect(best).not.toBeChecked()
  await expect(bestArrow).toHaveCount(0)
  await page.keyboard.press('b')
  await expect(best).toBeChecked()
  await expect(bestArrow).toHaveCount(1)
  await page.getByRole('button', { name: 'Black pawn, d7' }).click()
  await page.locator('[data-square="d5"]').click()
  await expect(page.getByRole('button', { name: 'Black pawn, d5' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Exploring' })).toBeVisible()
  await expect(
    page.getByText('Try moves on the board. They are not part of the review and are not saved.'),
  ).toBeVisible()
  await expect(page.getByLabel('Exploration moves')).toContainText('4… d5')
  await page.getByRole('button', { name: 'Previous move', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Black pawn, d7' })).toBeVisible()
  await page.getByRole('button', { name: 'Next move', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Black pawn, d5' })).toBeVisible()
  await page.getByLabel('Engine line').getByRole('button', { name: '5. a3' }).click()
  await expect(page.getByRole('button', { name: 'White pawn, a3' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to opening' }).click()
  await expect(page.getByRole('button', { name: 'White pawn, h3' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Black pawn, d7' })).toBeVisible()
  await page.getByRole('button', { name: 'Next move', exact: true }).click()
  await expect(page.getByText('Blunder: 4. Qa4.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'White queen, a4' })).toBeVisible()
  const navigation = page.getByRole('group', { name: 'Move through the opening' })
  await expect(navigation.locator('button[title="Start"]')).toBeVisible()
  await expect(navigation.locator('button[title="End"]')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(navigation.locator('button[title="Start"]')).toBeHidden()
  await expect(navigation.locator('button[title="End"]')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Previous move', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next move', exact: true })).toBeVisible()
  const stats = page.getByLabel('Training statistics')
  await expect(stats.locator('.tile').nth(0)).toContainText('Level 4')
  await expect(stats.locator('.tile').nth(1)).toContainText('1')
  await expect(stats.locator('.tile').nth(2)).toContainText('2')
  await page.reload()
  await expect(stats.locator('.tile').nth(0)).toContainText('Level 4')
  await expect(stats.locator('.tile').nth(1)).toContainText('1')
  await expect(stats.locator('.tile').nth(2)).toContainText('2')
  await page.getByRole('radio', { name: 'Black' }).check()
  await expect(stats.locator('.tile').nth(1)).toContainText('0')
  await expect(stats.locator('.tile').nth(2)).toContainText('0')
  expect(requests).toBe(2)
})

test('shows a live review after a clean variation and records the highest level', async ({ page }) => {
  await page.goto('/#/openings/ponziani-opening/ponziani-opening-jaenisch-counterattack-1jjacgq?side=w')
  await page.evaluate(() =>
    localStorage.setItem(
      'chessreview.opening-levels',
      JSON.stringify([
        {
          id: 'C44\tPonziani Opening: Jaenisch Counterattack\t1. e4 e5 2. Nf3 Nc6 3. c3 Nf6',
          side: 'w',
          level: 1,
          mastered: false,
        },
      ]),
    ),
  )
  await page.reload()
  await page.getByRole('button', { name: 'Start Level 1' }).click()
  for (const [piece, target, reply] of [
    ['White pawn, e2', 'e4', 'Black pawn, e5'],
    ['White knight, g1', 'f3', 'Black knight, c6'],
    ['White pawn, c2', 'c3', 'Black knight, f6'],
  ]) {
    await page.getByRole('button', { name: piece }).click()
    await page.locator(`[data-square="${target}"]`).click()
    await expect(page.getByRole('button', { name: reply })).toBeVisible()
  }
  await expect(page.locator('.stage-side').getByText('🎉 Level completed.')).toBeVisible()
  await expect(page.locator('.stage-side').getByRole('button', { name: 'Start Level 2' })).toBeVisible()
  await expect(page.getByRole('img', { name: /^Evaluation/ })).toBeVisible()
  await expect(page.getByLabel('Practice moves')).toContainText('3… Nf6')
  const stats = page.getByLabel('Training statistics')
  await expect(stats.locator('.tile').nth(0)).toContainText('Level 2')
  await expect(stats.locator('.tile').nth(1)).toContainText('1')
  await expect(stats.locator('.tile').nth(2)).toContainText('0')
})

test('fetches a Lichess reply when the variation ends with the player move', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let requests = 0
  await page.route('https://explorer.lichess.org/**', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': 'authorization',
        },
      })
    requests++
    return route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify({
        moves: requests === 1 ? [] : [{ uci: 'd2d4', san: 'd4', white: 40, draws: 20, black: 40 }],
      }),
    })
  })
  await page.goto('/#/openings/ponziani-opening/ponziani-opening-jaenisch-counterattack-1jjacgq?side=b')
  await page.evaluate(() => {
    localStorage.setItem(
      'chessreview.opening-levels',
      JSON.stringify([
        {
          id: 'C44\tPonziani Opening: Jaenisch Counterattack\t1. e4 e5 2. Nf3 Nc6 3. c3 Nf6',
          side: 'b',
          level: 4,
          mastered: false,
        },
      ]),
    )
    sessionStorage.setItem('chessreview.lichess-token', 'test-token')
  })
  await page.reload()
  await page.getByRole('button', { name: 'Start Level 4' }).click()
  for (const [reply, piece, target] of [
    ['White pawn, e4', 'Black pawn, e7', 'e5'],
    ['White knight, f3', 'Black knight, b8', 'c6'],
    ['White pawn, c3', 'Black knight, g8', 'f6'],
  ]) {
    await expect(page.getByRole('button', { name: reply })).toBeVisible()
    await page.getByRole('button', { name: piece }).click()
    await page.locator(`[data-square="${target}"]`).click()
  }
  await expect(page.getByRole('alert')).toContainText('No rapid games')
  await expect(page.getByLabel('Training level')).toContainText('Level 4')
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().startsWith('https://explorer.lichess.org/') && response.request().method() === 'GET',
    ),
    page.getByRole('button', { name: 'Retry Lichess' }).click(),
  ])
  await expect(page.getByText('Looking up a Lichess reply…')).toBeVisible()
  await page.clock.runFor(649)
  await expect(page.getByRole('button', { name: 'White pawn, d2' })).toBeVisible()
  await page.clock.runFor(1)
  await expect(page.getByText('Your move.')).toBeVisible()
  await page.clock.runFor(50)
  await expect(page.getByRole('button', { name: 'White pawn, d4' })).toBeVisible()
  await expect(page.getByText('After the variation: 0 of 2 good moves')).toBeVisible()
  expect(requests).toBe(2)
})
