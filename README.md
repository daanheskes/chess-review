# chessreview

Chess game review that runs entirely in your browser: move labels (brilliant, great, book, best … blunder,
miss), accuracy, a win-chance graph, accuracy by phase and a plain-language summary. Stockfish runs in Web
Workers on your own CPU, so there is no server, no account, and your games never leave your device.

Import games from a chess.com or Lichess username, or paste any PGN. "Review all new games" queues every
unreviewed game in the list; the queue keeps going if you leave the page and picks up again after a
reload. A review can be downloaded as an annotated PGN (labels as NAGs, `[%eval]` and `[%clk]`
comments) or as a review file, which opens on another device.

<p>
  <img src="docs/screenshots/home.png" alt="The home page: a headline, a sample win-chance trace with three blunders flagged, and a username box" width="800">
</p>
<p>
  <img src="docs/screenshots/review.png" alt="A review: the board at a mistake with the tactic explained, clocks on each player, the move list and each player's accuracy" width="800">
</p>
<p>
  <img src="docs/screenshots/games.png" alt="The game list, grouped by day, with result, accuracy and a small trace for each reviewed game" width="390">
  <img src="docs/screenshots/insights.png" alt="Insights: accuracy, record and errors per 100 moves, accuracy over time, errors by phase and openings" width="390">
</p>
<p>
  <img src="docs/screenshots/review-dark.png" alt="The same review in the dark theme" width="390">
  <img src="docs/screenshots/review-mobile.png" alt="The review on a phone" width="150">
  <img src="docs/screenshots/settings.png" alt="The settings panel: theme, analysis depth and board colours" width="190">
</p>

Regenerate these with `pnpm build && pnpm screenshots`; they are real output of the app, not mock-ups.

## Develop

    pnpm install
    pnpm dev             # http://localhost:5173
    pnpm check           # case clashes, types, lint and formatting
    pnpm test            # focused unit tests added for new behavior
    pnpm e2e             # builds, then runs the active browser regression checks
    pnpm budget          # after a build: checks the download stays within its size budget
    pnpm screenshots     # after a build: regenerates the pictures in docs/screenshots

Requires Node 22+ and pnpm 10 (`corepack enable` picks up the version pinned in `package.json`).
`pnpm install` fetches the Stockfish WASM build (the `stockfish` package's postinstall, the only
dependency build script allowed in `pnpm-workspace.yaml`); `predev` and `prebuild` copy it into
`apps/web/public/engine`. The first time you run browser checks, install Chromium with
`pnpm --filter @chessreview/web exec playwright install --with-deps chromium`.

## How it is organised

| Path               | What                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`    | Pure review logic: rules, accuracy, phases, opening book. Runs anywhere.                                                                |
| `packages/engine`  | UCI client, Web Worker and Node transports, parallel engine pool.                                                                       |
| `apps/web`         | React app, services layer (chess.com, storage, review queue), browser regression checks.                                                |
| `reference/python` | Original implementation and golden-fixture generator for `core`.                                                                        |
| `docs/`            | [Architecture](docs/ARCHITECTURE.md), [decision records](docs/adr/README.md), [deployment](docs/DEPLOY.md), [roadmap](docs/ROADMAP.md). |

## How moves are labelled

Win chance comes from the engine evaluation (the Lichess formula). A move is labelled by how much win chance
it gave up:

| Label                          | Rule                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| Brilliant                      | within 2% of best, gives up 2+ pawns by exchange, game not already decided (45–90%)           |
| Great                          | the best move, runner-up 20%+ worse, in a contested position (25–75%), and not a recapture    |
| Book                           | the position is on a known opening line                                                       |
| Best / Excellent / Good        | engine's choice / gave up up to 2% / up to 5%                                                 |
| Inaccuracy / Mistake / Blunder | gave up up to 10% / 20% / more                                                                |
| Miss                           | a mistake or blunder right after the opponent made one (10%+), from an at-least-even position |

For mistakes, blunders, misses, great and brilliant moves the review also says _why_, when the
engine's own lines show it: a piece left hanging, a fork, pin, skewer, discovered attack, trapped
piece or overloaded defender, a missed or allowed mate, a recapture, or the material a line wins. The
squares involved are ringed on the board and the best line is shown in full. When no tactic can be
confirmed from the engine's lines, the review says only what the move cost. For what the numbers mean and how far to trust them, see
[Reading a review](docs/reading-a-review.md).

Click any move of the best line to step through it, or move a piece on the board to explore your
own ideas: the engine evaluates each position live. Exploring never changes the stored review.

**Insights** (linked from the home page) sums up every game reviewed on your device for one player:
accuracy over time, errors per 100 moves by phase, the tactics behind your mistakes, and your results
by opening and time control. It is computed in your browser from your stored reviews.

**Train** turns your own mistakes into puzzles. After a game is reviewed, each mistake that cost 20 or more
points of win chance is searched again, deeper; it becomes a puzzle only if one move was clearly the best
and nothing else came close. You find the move by dragging a piece or typing it (`Nxd5`). Puzzles you
answer come back later, after a day, three days, a week, until you solve them. Everything stays in your
browser, so progress does not follow you to another device.

**Openings** suggests 16 openings by side, level and style, lets you choose a bundled line and save it to a
local repertoire for White or Black. Training starts by watching the line, then progresses through practice
with move arrows, piece hints and finally no hints. Complete a practice without mistakes to advance; after an
attempt with mistakes, return to the preceding level. Completing level 3 marks the line mastered, and it can
still be practiced. Training levels are stored separately for each line and side in this browser.
For each saved line, the repertoire shows the percentage of your moves played correctly on the first
try in the last completed practice, separately for each side. Progress is also stored in this browser.
Each opening and line has a shareable hash URL; its line cards show the furthest completed practice progress
for the selected side. Previously completed practices count as fully practiced.
Suggested openings have indicative difficulty and style labels and an icon for the opening side's first
non-pawn move in an example line; individual lines can differ.
Cards are ordered by level (Beginner, Club, Expert), then style (Solid before Aggressive).
The star on an opening card saves or removes the first listed line for that opening and side.
The repertoire is collapsed by default; its toggle shows the saved-line count. Removal requires confirmation,
and practice progress is retained. When the repertoire is empty, the optional starter repertoire adds the
London System for White and the Caro-Kann and King's Indian defenses for Black.
Opening types are indicative, inferred from names and initial moves, and are not available for
every line. The repertoire is stored in this browser and does not sync between devices.
For each suggested opening, a selected main-line variation appears first; the original named lines remain
available. Lines with the same name are grouped on one card, with their alternative continuations and
individual progress available to expand. Repertoire cards for suggested openings lead to the opening's
line selection. The Scandinavian recommendation follows the
[classical main line](https://en.wikipedia.org/wiki/Scandinavian_Defence#Main_line) through 8.O-O.

Sites that host the full Stockfish network can offer an **accurate engine** as a one-time 99 MB
download (Settings → Engine), which matches desktop Stockfish exactly; see `docs/DEPLOY.md`.

When the PGN carries clock times (chess.com and Lichess exports do), each move shows how long it took,
and the Report tab graphs both clocks and counts the errors made in time trouble (under a tenth of the
starting time, at most two minutes) against the rest.

These are heuristics, not chess.com's proprietary rules, so labels differ from theirs. The rating shown in the
Report tab is a rough estimate from average centipawn loss, not a calibrated rating.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the checks to run, where code goes, and the procedure for
changing a review rule. Changes are listed in [CHANGELOG.md](CHANGELOG.md); to report a vulnerability,
see [SECURITY.md](SECURITY.md).

## Licence

GPL-3.0-or-later (see `LICENSE`). The bundled engine is Stockfish.js by Nathan Rugg and Chess.com, LLC, built from
Stockfish by the Stockfish developers, also GPL-3.0. Opening data: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0.
