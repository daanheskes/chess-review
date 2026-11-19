# Architecture

chessreview analyses chess games in the browser: it runs Stockfish in Web Workers on the visitor's
own CPU, turns the evaluations into move labels and accuracy, and keeps the results in IndexedDB.
There is no backend. The whole product is a static site.

## Layout

```
packages/core     Pure review logic. No DOM, no Node, no engine process.
packages/engine   UCI client, transports (Web Worker, Node process) and the parallel engine pool.
apps/web          The React app, its services layer, and the end-to-end tests.
reference/python  The original implementation, kept as the oracle for core (see its README).
data/             Opening data (Lichess chess-openings, CC0) shared by both implementations.
```

Dependencies point one way: `web -> engine -> core`. `core` is type-checked without Node types
(`packages/core/tsconfig.json`), so an accidental Node or DOM dependency fails the build.

```
PGN ──parseGame──► ParsedGame ──evaluatePositions(Engine)──► EngineRecord[] ──buildReview(book)──► Review
                                        │                                                           │
                              EnginePool ─► UciEngine ─► Worker(Stockfish WASM)             IndexedDB + UI
```

## Decisions

### 1. The engine runs on the client

Hosting Stockfish for every visitor would make cost scale with usage and invite abuse. In the browser
the cost is zero, scales with users, and games never leave the device. The price is device variance
(a phone is slower than a laptop) and a rewrite from Python, both accepted.

### 2. A pool of single-threaded engines, not one multi-threaded engine

The positions of a game are independent, so analysing them on N single-threaded workers scales close
to linearly. Multi-threaded WASM needs `SharedArrayBuffer`, which needs cross-origin isolation headers
that some static hosts cannot set. The pool needs nothing special and works anywhere
(`packages/engine/src/pool.ts`). Workers start lazily and are torn down after 30 s idle
(`EngineHost`), because each holds tens of megabytes.

### 3. Reviews are reproducible

The same game and settings give the same review on any machine. This holds because the engine runs
with one thread and a 16 MB hash, receives `ucinewgame` before every search (so no result depends on
what ran before), and is limited by node count rather than time. The "second search" that finds the
runner-up lists its `searchmoves` in sorted UCI order, because Stockfish builds its root move list in
the order given and a library's move-generation order must not leak into results. Measured: the WASM
build reproduces native Stockfish evaluations exactly on the test games.

### 4. Classification is a pure function of recorded engine output

`buildReview(game, records, book, settings)` has no engine, clock or I/O. The engine's output for a game
is a list of `EngineRecord`s (score, mate, best move, runner-up score). This keeps classification
independent of the engine and lets Python and TypeScript use identical input.

### 5. Python is the oracle

`reference/python` defines the expected classifications. The golden fixtures in
`packages/core/test/fixtures/` retain recorded engine output and Python reviews for real and hand-made
games; `scripts/make_fixtures.py` regenerates them when the rules change.

### 6. A review's identity

`reviewKey(pgn, settings)` hashes the PGN, depth, node limit, hash size, engine build and
`ANALYSIS_VERSION`. Same inputs, same id, on any device. When the rules or the `Review` shape change,
bump `ANALYSIS_VERSION`: old ids stop matching and stale stored reviews are pruned at startup.

### 7. Persistence and resilience

Reviews and in-flight requests live in IndexedDB (`services/storage.ts`), with an in-memory fallback
where it is unavailable. A request is written before analysis starts and removed when it finishes, so a
reload mid-analysis resumes instead of losing work. Analyses queue and run one at a time; cancelling
rejects queued searches and tells the engine to `stop`. Engine failures are reported in terms a user
can act on, and a crashed worker is replaced and its task retried once. Because a crash usually means
memory ran short, the pool then runs with one worker fewer, and its starting size respects
`navigator.deviceMemory`.

A service worker (`apps/web/sw/`, generated per build by `scripts/precache.mjs`) caches the whole build,
so a pasted PGN can be reviewed offline. A new version waits until the user chooses to reload into it.
See `docs/adr/0007-offline-and-low-end-devices.md`.

### 8. The lite engine, and the path to the full one

The app ships Stockfish 19 _lite_ (1.8 MB). The full net is 99 MB, which exceeds Cloudflare Pages'
25 MiB file limit and is a heavy first download. Measured against a 6M-node native reference over 30
positions:

| Engine and budget          | Best-move agreement | Mean win-chance error | Positions off by > 5% |
| -------------------------- | ------------------- | --------------------- | --------------------- |
| Native full, 1.5M nodes    | 26/30               | 1.3%                  | n/a                   |
| WASM lite, 1.5M (Standard) | 26/30               | 2.0%                  | 4                     |
| WASM lite, 3M              | 25/30               | 1.7%                  | 2                     |
| WASM lite, 6M (Deep)       | 27/30               | 1.5%                  | 2                     |

Lite has a floor of roughly 1.5% error that more search barely lowers, so label boundaries (2%, 5%,
10%) are fuzzy by about that much. The real quality lever is the full net, whose WASM build is
bit-identical to native Stockfish. It is offered as an opt-in "Accurate engine" when the deployment
configures where the file is hosted (`docs/DEPLOY.md`): the app downloads it with progress, checks its
size and SHA-256 against the build's manifest, keeps it in Cache Storage, and hands it to the workers as
a `blob:` URL. Its id (`stockfish-19-single`) is part of every review's id, so the two engines' reviews
never mix, and a pending request remembers which engine it asked for. Measured in Node, it searches at
about half the lite engine's speed (255 vs 479 thousand nodes per second) and needs about 500 MB per
worker (lite: 130 MB), so it runs on at most two workers, one on devices reporting 4 GB or less.
`docs/adr/0003-full-engine.md` has the details.

### 9. Labels are heuristics, not chess.com's rules

The rules are documented in `packages/core/src/rules.ts` and the README. `GREAT_*` and `BRILLIANT_*` were
tuned against real games (Kasparov–Topalov for brilliancies); they are judgement calls and will be
revisited as more games are reviewed.

### 10. Tactic explanations are computed when a review is read

A mistake says _why_ ("Allows a fork: Nc7+ attacks the king and the rook on a8"), not just what it
cost. The review stores the engine's principal variation for every position (`Review.lines`, up to
`PV_PLIES` = 12 plies); `explainReviewMove` in `packages/core/src/tactics` reads the position, the
move and the two lines either side of it and returns a typed `Explanation` with its sentence, the
line that shows it and the squares to highlight.

- **At read time, not stored.** The detectors are pure functions of data the review already holds,
  so they can improve without bumping `ANALYSIS_VERSION` or re-analysing anything, and only the move
  on screen is explained (a median of 13 ms, 47 ms at worst, on the corpus in Node). Storing the
  lines is the only change to the `Review` (version 4).
- **Their own exchange evaluator.** The detectors judge captures with a geometric static exchange
  (`staticExchange`, with x-rays, without pins) rather than `see`, which searches legal moves and
  cost up to half a second per explanation. They agree on 99.8% of the corpus's captures; `see`
  still decides the Brilliant rule, unchanged.
- **Confirmed by the engine, or not said.** A motif (hanging piece, fork, pin, skewer, discovered
  attack, trapped piece, overloaded defender, mate, back-rank mate) is named only if the engine's own
  line plays it and then wins material with it, and the material matches the difference between the
  best line and the played one. A plain "loses material" claim quotes only the captures in the first
  six plies. When nothing qualifies, the commentary keeps its plain wording.
- **Measured.** On the Lichess puzzle database the detectors agree with Lichess's theme tags at the
  rates in `docs/adr/0001-tactic-explanations.md`, and a hand audit of every explanation given in the
  40-game corpus (`data/corpus`) found no false statement. `scripts/README.md` has the commands.
- **Python parity is unchanged.** The reference implementation does not record lines; the parity
  tests compare every field it produces.

### 11. Free analysis is separate from the review

Stepping through an engine line or trying moves on the board (`apps/web/src/explore.ts`) is page
state only: it is never written to storage and never changes a `Review`. Positions are evaluated by
`LiveAnalysis` (`services/analysis.ts`) on the same engine pool as reviews, at the user's preset
(depth- and node-limited, so it ends on its own). Moving on aborts the search for the position left
behind (the engine gets `stop`), and answers are remembered per position, so stepping back is free.

### 12. Insights are computed from stored reviews, in the browser

`packages/core/src/insights.ts` turns reviews into one player's statistics (`gameFacts` per game,
then `insights` across them): pure functions, tested with seeded reviews. The web app reads every
stored review from IndexedDB and tags each of the player's errors with `explainReviewMove`, yielding
to the page every 20 ms (about 2.5 s for 40 games in Chromium) and caching per game for the session.
Nothing is stored or sent; `docs/adr/0004-insights.md` has the choices.

### 13. Time analysis is read from the clocks already in the review

`packages/core/src/clock.ts` derives think time per move (the clock difference plus the increment,
the first move timed from the starting clock), time trouble (less than a tenth of the base time,
capped at two minutes) and per-side counts of errors with and without time trouble, from
`MoveReview.clockMs` and the `TimeControl` header. It needs no change to stored reviews or to
`ANALYSIS_VERSION`. Games without clocks, or daily games without a base time, are handled: no
graph, or no time-trouble figures. `docs/adr/0005-time-analysis.md` has the details.

### 14. Two game sources, batches, and portable reviews

Games come from chess.com's public archive API or Lichess's public games export (ndjson, last 30
games, more on request); both are plain CORS GETs with no account. "Review all new games" starts
every unreviewed game through `ReviewService.startMany`, in list order; the existing request store
makes the queue durable, and `resumePending` restarts unfinished requests at start-up. Reviews
export as annotated PGN (`exportPgn`) and as JSON (`exportJson`); `importJson` treats a file as
untrusted, checks every field against the PGN it carries, and recomputes the id from the review's own
settings before storing it. `docs/adr/0006-import-export.md` has the details.

### 15. Lichess opening training is opt-in and rating-bucketed

After the existing three variation-practice levels, the Opening Explorer supplies the opponent's
reply from Rapid games (`apps/web/src/services/lichess-opening-explorer.ts`). Moves played less than
5% of the time are excluded; the rest are sampled in proportion to their game counts. Levels 4
through GM map to Lichess rating groups 0, 1000, 1200, 1400, 1600, 1800, 2000, 2200 and 2500. The
lowest group is 0–999, so level 4's requested 400 rating is an approximation, not an exact filter.
Users authenticate directly with Lichess using PKCE; the access token stays in tab-scoped
`sessionStorage` and is never shipped by the app. User moves are checked by the existing Stockfish
worker pool against the review's win-chance thresholds. Inaccuracies and worse are taken back and
errors after the variation lower the next level after the run. Incorrect attempts during the forced
variation do not affect progression or error statistics and are omitted from the review, while the
correct variation moves remain visible. After the variation, the user must play 2 good moves
at level 4, increasing by one per level to 10 at GM. A position without Explorer
continuations or an early game end cannot complete a level.

Moves appear immediately while Stockfish evaluates them. When Stockfish rejects a move, an error
marker is shown for 300 ms before the move is taken back; mistakes in the fixed line remain visible
for one second. Fixed and Explorer replies wait at least 650 ms.
Two consecutive rejected moves unlock an optional hint for the current position; a third unlocks
giving up, which opens a review and lowers the level only if an error counts toward the level.
The hint uses the fixed variation move or the best move from the rejected move's engine analysis.
Giving up records the errors but does not count as a completed attempt or overwrite practice progress.
Explorer's king-to-rook castling notation is converted to standard UCI before validation and playback.
After a completed attempt, the opening board becomes a move-by-move review. Incorrect attempts are
shown on the board, and users can explore continuations before returning to the opening. The existing
live Stockfish analysis supplies the evaluation bar and best-move arrow; rejected moves use the same
classification as game reviews, including missed chances after an opponent error. The level record
also stores the highest level reached and counts of completed attempts and errors for each variation
and side. Older records start tracking statistics from their current level; earlier attempts cannot
be reconstructed.

The explorer's separate origin (`https://explorer.lichess.org`) is the only new CSP connection and
has a browser regression check. Browser JavaScript cannot set a custom `User-Agent`, so requests
carry the browser's own header; a deployment needing Lichess's requested app-identifying header
requires a server-side proxy.

## Changing the rules

1. Change `reference/python/src/chessreview/analysis.py`.
2. Bump `ANALYSIS_VERSION` in `packages/core/src/rules.ts`.
3. Regenerate fixtures (`reference/python/README.md`) and make `packages/core` match. When only the
   classification changed (not what the engine is asked), `scripts/reclassify_fixtures.py` rebuilds
   the expected reviews from the recorded engine output, with no engine or network.
4. `pnpm check`, `pnpm e2e`, and the matching corpus audit.

Adding a label means: the `LABELS` list and `GLYPH` in core, the rule in `buildReview`, a colour in
`apps/web/src/labels.ts` and `styles.css`, plus a focused test for the new behavior.

## Security

No backend or local product accounts; opening training has an optional direct Lichess OAuth PKCE
connection. The deployed site sets a strict Content-Security-Policy
(`apps/web/public/_headers`): scripts and workers from the same origin only, `wasm-unsafe-eval` for the
engine, and `connect-src` limited to `api.chess.com`, `lichess.org` and
`explorer.lichess.org`. Browser regression checks run under that policy. The engine is GPL-3.0 software,
so the project is GPL-3.0-or-later and ships the licence and source pointers with the engine files.

## Known limits and next steps

- Share links for a review (today a review lives on the device that made it).
- Browser regression checks run in Chromium only.

The longer list is in [ROADMAP.md](ROADMAP.md).
