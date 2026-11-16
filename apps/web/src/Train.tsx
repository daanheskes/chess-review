import {
  pickNext,
  playersIn,
  summarize,
  today,
  withTactic,
  replay,
  checkStatus,
  winPercent,
  type Phase,
  type PuzzlePool,
  type PuzzlePerspective,
  type PuzzleRecord,
  withPool,
} from '@chessreview/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { AppHeader } from './AppHeader'
import { explore, fenOf, lineMoves, play, stepTo, targets, type Exploration } from './explore'
import { useAsync, useLiveEval } from './hooks'
import { evalText } from './labels'
import { tacticName, tacticTopic } from './insight-facts'
import { LEGAL_MOVE_HOVER_COLOR, LegalMoveMarker, SQUARE_MARK_COLOR } from './LegalMoveMarker'
import { NAMED_PIECES, isLight, reducedMotion } from './pieces'
import { BOARDS, rememberedPlayer, usePrefs } from './prefs'
import { moveFromText } from './puzzle-input'
import { getPuzzleService, getReviewService, type SyncProgress } from './services'

const PHASE_NAMES: Record<Phase, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
}
const COLOR_NAMES = { w: 'White', b: 'Black' }
const ARROW = 'rgba(76,127,214,0.85)'
const BEST_ARROW = '#2E8B62'
const PUZZLE_POOLS = [
  { id: 'miss', label: 'Misses' },
  { id: 'positional', label: 'Positional mistakes' },
  { id: 'opening-miss', label: 'Opening misses' },
  { id: 'completed', label: 'Completed puzzles' },
] as const
/** How many puzzles make up a day's set. Soft: the player can carry on past it. */
const DAILY_GOAL = 10

const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0)

/** Puzzles from the player's own games; answered puzzles are kept in Completed. */
export function TrainPage({
  tactic,
  perspective,
  player: asked,
}: {
  tactic: string | null
  perspective: PuzzlePerspective | null
  player: string | null
}) {
  const stored = useAsync('all', async () => (await getReviewService()).allReviews())
  const players = useMemo(() => playersIn((stored.value ?? []).map((s) => s.review)), [stored.value])
  const [chosen, setChosen] = useState<string | null>(null)
  const [pool, setPool] = useState<PuzzlePool>('miss')
  const named = (name: string | null) => players.find((p) => p.name.toLowerCase() === name?.toLowerCase())
  const player = chosen ?? named(asked)?.name ?? named(rememberedPlayer())?.name ?? players[0]?.name ?? null

  useEffect(() => {
    document.title = 'Train · chessreview'
  }, [])

  return (
    <>
      <AppHeader active="train" />
      <main className="page train">
        <div className="insights-head">
          <h1>Train</h1>
          {players.length > 0 && (
            <label className="player">
              Player
              <select value={player ?? ''} onChange={(e) => setChosen(e.target.value)}>
                {players.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.games} game{p.games === 1 ? '' : 's'})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="tabs train-tabs" role="tablist" aria-label="Puzzle category">
          {PUZZLE_POOLS.map((tab, i) => (
            <button
              key={tab.id}
              id={`train-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={pool === tab.id}
              aria-controls="train-pool-panel"
              tabIndex={pool === tab.id ? 0 : -1}
              className="tab"
              onClick={() => setPool(tab.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                e.stopPropagation()
                const next =
                  PUZZLE_POOLS[
                    (i + (e.key === 'ArrowRight' ? 1 : -1) + PUZZLE_POOLS.length) % PUZZLE_POOLS.length
                  ]!
                setPool(next.id)
                document.getElementById(`train-tab-${next.id}`)?.focus()
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div id="train-pool-panel" role="tabpanel" aria-labelledby={`train-tab-${pool}`} tabIndex={0}>
          {stored.loading ? (
            <p className="muted">Reading your reviews…</p>
          ) : player === null ? (
            <div className="empty">
              <p>Puzzles come from your own games, so there is nothing to practise yet.</p>
              <p>
                <a href="#/">Review some of your games</a> first.
              </p>
            </div>
          ) : (
            <Session
              key={`${player}|${tactic ?? ''}|${perspective ?? ''}`}
              player={player}
              tactic={tactic}
              perspective={perspective}
              pool={pool}
            />
          )}
        </div>
      </main>
    </>
  )
}

/** One player's puzzles: new verified positions appear while the rest are checked. */
function Session({
  player,
  tactic,
  perspective,
  pool,
}: {
  player: string
  tactic: string | null
  perspective: PuzzlePerspective | null
  pool: PuzzlePool
}) {
  const [records, setRecords] = useState<PuzzleRecord[] | null>(null)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [failed, setFailed] = useState(false)
  // Undefined until selection starts; null once this tab has no new puzzle to ask.
  const [chosen, setChosen] = useState<{ pool: PuzzlePool; id: string | null } | undefined>(undefined)
  // Moved on with each answer, so the day's count and what is due follow the clock.
  const [now, setNow] = useState(() => Date.now())
  const [asked, setAsked] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    let stale = false
    const controller = new AbortController()
    void (async () => {
      try {
        const service = await getPuzzleService()
        if (!stale) setRecords(await service.list(player))
        await service.sync(
          player,
          (p) => {
            if (stale) return
            setProgress({ done: p.done, total: p.total })
            const found = p.record
            if (found)
              setRecords((rs) => {
                if (rs === null) return [found]
                return rs.some((r) => r.id === found.id)
                  ? rs.map((r) => (r.id === found.id ? found : r))
                  : [...rs, found]
              })
          },
          controller.signal,
        )
        if (!stale) setRecords(await service.list(player))
      } catch (e) {
        console.warn('Could not prepare the puzzles', e)
        if (!stale) setFailed(true)
      } finally {
        if (!stale) setProgress(null)
      }
    })()
    return () => {
      stale = true
      controller.abort()
    }
  }, [player])

  const focusName = tactic === null ? '' : perspective ? tacticName(tactic, perspective) : tacticTopic(tactic)
  const poolRecords = records ? withPool(records, pool) : null
  const focused = poolRecords ? withTactic(poolRecords, tactic, perspective) : null
  // Puzzles of this tactic that a focus on one side leaves out only because their side is not known.
  const unsided =
    perspective && records
      ? withTactic(records, tactic).filter((r) => r.puzzle !== null && !r.perspective).length
      : 0
  const startId = focused && pool !== 'completed' ? (pickNext(focused, now, asked)?.id ?? null) : null
  // Lock the first puzzle as soon as there is one, so puzzles found later do not replace it mid-answer.
  if (chosen === undefined || chosen.pool !== pool) setChosen({ pool, id: startId })
  else if (chosen.id === null && startId !== null) setChosen({ pool, id: startId })
  const currentId = chosen?.pool === pool ? (chosen.id ?? startId) : startId
  const current = records?.find((r) => r.id === currentId) ?? null

  const answered = async (record: PuzzleRecord, correct: boolean) => {
    const next = await (await getPuzzleService()).answer(record, correct)
    setNow(Date.now())
    setRecords((rs) => rs?.map((r) => (r.id === next.id ? next : r)) ?? rs)
  }
  const next = () => {
    if (!records || !current) return
    const skip = new Set(asked).add(current.id)
    setAsked(skip)
    setChosen({
      pool,
      id: pickNext(withTactic(withPool(records, pool), tactic, perspective), Date.now(), skip)?.id ?? null,
    })
  }

  const stats = poolRecords ? summarize(poolRecords, now) : null
  const count = focused?.filter((r) => r.puzzle !== null).length ?? 0
  const day =
    poolRecords && pool !== 'completed' ? today(poolRecords, now, startOfDay(now), DAILY_GOAL) : null
  const searching = progress !== null && progress.done < progress.total

  return (
    <>
      {searching && (
        <p className="muted" role="status">
          Looking for puzzles in your games… {progress.done} of {progress.total} positions checked.
        </p>
      )}
      {failed && (
        <p className="muted">Something went wrong while preparing the puzzles. Try reloading the page.</p>
      )}
      {tactic !== null && (
        <p className="train-focus">
          <span>
            Focus: <strong>{focusName}</strong>
            {focused && ` · ${count} puzzle${count === 1 ? '' : 's'}`}
          </span>
          <a href="#/train">Show all puzzles</a>
        </p>
      )}
      {day && day.target > 0 && <DayStrip done={day.done} target={day.target} />}
      {records === null ? (
        <p className="muted">Reading your puzzles…</p>
      ) : pool === 'completed' ? (
        focused && focused.length > 0 ? (
          <CompletedPuzzles records={focused} />
        ) : (
          <div className="empty">
            <p>No completed puzzles yet.</p>
            <p className="muted">Puzzles move here after you try them from one of the practice tabs.</p>
          </div>
        )
      ) : current ? (
        <PuzzleCard key={current.id} record={current} onAnswered={answered} onNext={next} />
      ) : tactic !== null && focused && focused.every((r) => r.puzzle === null) ? (
        searching ? null : (
          <div className="empty">
            <p>No puzzles for “{focusName}” yet.</p>
            <p className="muted">
              Not every mistake becomes a puzzle. <a href="#/train">Show all puzzles</a>.
            </p>
            {unsided > 0 && (
              <p className="muted">
                {unsided} puzzle{unsided === 1 ? '' : 's'} of {tacticTopic(tactic ?? '').toLowerCase()} could
                not be sorted into allowed or missed.{' '}
                <a
                  href={`#/train?tactic=${encodeURIComponent(tactic ?? '')}&u=${encodeURIComponent(player)}`}
                >
                  Practise them all
                </a>
                .
              </p>
            )}
          </div>
        )
      ) : stats && stats.total === 0 ? (
        searching ? null : (
          <div className="empty">
            <p>No clear puzzles in your games yet.</p>
            <p className="muted">
              A position becomes a puzzle when one move is clearly best. Review more of your games and check
              again.
            </p>
          </div>
        )
      ) : (
        <div className="empty">
          <p>No more new puzzles to practise right now.</p>
          <p className="muted">
            Your previous attempts are in Completed puzzles. Review more games to find new puzzles.
          </p>
        </div>
      )}
      {stats && stats.total > 0 && <Progress stats={stats} />}
    </>
  )
}

function CompletedPuzzles({ records }: { records: readonly PuzzleRecord[] }) {
  const completed = [...records].sort((a, b) => (b.progress.lastAt ?? 0) - (a.progress.lastAt ?? 0))
  return (
    <section className="train-completed" aria-label="Completed puzzles">
      <ul>
        {completed.map((record) => {
          const puzzle = record.puzzle!
          // A correct answer moves out of box zero; a wrong answer sends it back.
          const lastWasCorrect = record.progress.box > 0
          return (
            <li key={record.id}>
              <div>
                <p>
                  <strong>{puzzle.solutionSan}</strong> · {PHASE_NAMES[puzzle.phase]}
                </p>
                <p className="muted">
                  Against {record.opponent}
                  {record.date ? ` · ${record.date}` : ''}
                </p>
              </div>
              <p>
                <strong>Last answer: {lastWasCorrect ? 'correct' : 'not correct'}</strong>
                <span className="muted">
                  {' '}
                  · {record.progress.solved} correct of {record.progress.attempts} attempts
                </span>
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Today's set: how many of its puzzles have been answered. */
function DayStrip({ done, target }: { done: number; target: number }) {
  return (
    <div className="train-day">
      <p>
        <strong>{done}</strong> of {target} today
        {done >= target && done > 0 ? ' · done for today' : ''}
      </p>
      <span className="train-day-bar" aria-hidden="true">
        <span style={{ width: `${(done / target) * 100}%` }} />
      </span>
    </div>
  )
}

function Progress({ stats }: { stats: ReturnType<typeof summarize> }) {
  return (
    <section className="train-progress" aria-label="Your progress">
      <div className="tiles train-tiles">
        <div className="tile">
          <span className="tile-label">Puzzles</span>
          <span className="tile-num">{stats.total}</span>
        </div>
        <div className="tile">
          <span className="tile-label">New</span>
          <span className="tile-num">{stats.fresh}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Completed</span>
          <span className="tile-num">{stats.total - stats.fresh}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Solved first try</span>
          <span className="tile-num">
            {stats.attempts > 0 ? `${Math.round((stats.solved / stats.attempts) * 100)}%` : '–'}
          </span>
        </div>
      </div>
      <table className="train-phases">
        <caption>By phase of the game</caption>
        <thead>
          <tr>
            <th scope="col">Phase</th>
            <th scope="col">Puzzles</th>
            <th scope="col">Solved</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(PHASE_NAMES) as Phase[]).map((p) => {
            const s = stats.byPhase[p]
            return (
              <tr key={p}>
                <th scope="row">{PHASE_NAMES[p]}</th>
                <td>{s.total}</td>
                <td>{s.attempts > 0 ? `${Math.round((s.solved / s.attempts) * 100)}%` : '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

type Status = 'asking' | 'wrong' | 'solved' | 'shown'

const TW = 700
const TH = 220

/** Where in the player's game the puzzle sits: the game's win chance, with the moment of the mistake marked. */
function PuzzleTrace({ gameId, moveIndex, held }: { gameId: string; moveIndex: number; held: number }) {
  const stored = useAsync(`puzzle-trace|${gameId}`, async () => (await getReviewService()).stored(gameId))
  const series = stored.value?.review.winSeries
  if (!series || series.length < 2) return null
  const last = series.length - 1
  const x = (i: number) => (i / last) * TW
  const y = (v: number) => TH - (v / 100) * TH
  const line = series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const at = Math.min(moveIndex, last)
  const move = Math.floor(moveIndex / 2) + 1
  return (
    <div className="puzzle-trace">
      <div
        className="puzzle-trace-plot"
        role="img"
        aria-label={`Win chance across your game. The puzzle is at move ${move}, where you held ${Math.round(held)}%.`}
      >
        <svg viewBox={`0 0 ${TW} ${TH}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={`${line}L${TW},${TH}L0,${TH}Z`} className="trace-white" />
          <line
            x1="0"
            x2={TW}
            y1={TH / 2}
            y2={TH / 2}
            className="trace-mid"
            vectorEffect="non-scaling-stroke"
          />
          <path d={line} className="trace-line" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="puzzle-trace-cursor" style={{ left: `${(x(at) / TW) * 100}%` }} />
        <span className="puzzle-trace-tag" style={{ left: `${(x(at) / TW) * 100}%` }}>
          Move {move} · you held {Math.round(held)}%
        </span>
      </div>
    </div>
  )
}

function PuzzleEvalBar({
  win,
  evalLabel,
  orientation,
}: {
  win: number
  evalLabel: string
  orientation: 'white' | 'black'
}) {
  const score = Math.max(0, Math.min(100, win))
  const whiteOnBottom = orientation === 'white'
  const leadWhite = score >= 50
  const labelAtBottom = leadWhite === whiteOnBottom
  return (
    <div className="evalbar" role="img" aria-label={`Evaluation ${evalLabel}`}>
      <div className="evalbar-white" style={{ height: `${score}%`, [whiteOnBottom ? 'bottom' : 'top']: 0 }} />
      <span
        className={`evalbar-label ${leadWhite ? 'on-white' : 'on-black'}`}
        style={{ [labelAtBottom ? 'bottom' : 'top']: 4 }}
      >
        {evalLabel}
      </span>
    </div>
  )
}

/** One puzzle. Keyed by its id, so everything here starts over for the next one. */
function PuzzleCard({
  record,
  onAnswered,
  onNext,
}: {
  record: PuzzleRecord
  onAnswered: (record: PuzzleRecord, correct: boolean) => Promise<void>
  onNext: () => void
}) {
  const puzzle = record.puzzle!
  const sq = BOARDS[usePrefs().board]
  const [status, setStatus] = useState<Status>('asking')
  const [wrongMove, setWrongMove] = useState<string | null>(null)
  const [wrongPreview, setWrongPreview] = useState<{ uci: string; fen: string } | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [hoveredSquare, setHoveredSquare] = useState<string | null>(null)
  const [linePly, setLinePly] = useState(0)
  const [linePreview, setLinePreview] = useState(false)
  const [continuation, setContinuation] = useState<Exploration | null>(null)
  const [showBest, setShowBest] = useState(true)
  const [marked, setMarked] = useState<{ fen: string; squares: string[] } | null>(null)
  const [text, setText] = useState('')
  const [unclear, setUnclear] = useState(false)
  // Only the first answer counts towards progress; retries are practice.
  const recorded = useRef(false)
  const autoplayTimers = useRef<number[]>([])
  const wrongPreviewTimer = useRef<number | null>(null)

  const done = status === 'solved' || status === 'shown'
  const lineSteps = useMemo(() => replay(puzzle.fen, puzzle.line), [puzzle])
  const lineFinished = status === 'solved' && linePly >= lineSteps.length
  const after = lineSteps[0]?.after ?? puzzle.fen
  const lineFen = lineSteps[Math.max(0, linePly - 1)]?.after ?? after
  const fen = continuation ? fenOf(continuation) : (wrongPreview?.fen ?? (done ? lineFen : puzzle.fen))
  const positionCheck = checkStatus(fen)
  const color = COLOR_NAMES[puzzle.color]
  const sideToMove = fen.split(' ')[1] === 'w' ? 'w' : 'b'
  const turn = sideToMove === 'w' ? 'White' : 'Black'
  const awaitingUserLineMove =
    status === 'solved' && !continuation && !lineFinished && sideToMove === puzzle.color
  const canInteract =
    wrongPreview === null && (!done || continuation !== null || lineFinished || awaitingUserLineMove)
  const dots = canInteract && picked ? targets(fen, picked) : []
  const line = useMemo(() => lineMoves(puzzle.fen, puzzle.line), [puzzle])

  useEffect(
    () => () => {
      autoplayTimers.current.forEach((timer) => window.clearTimeout(timer))
      if (wrongPreviewTimer.current !== null) window.clearTimeout(wrongPreviewTimer.current)
    },
    [],
  )

  const clearAutoplay = () => {
    autoplayTimers.current.forEach((timer) => window.clearTimeout(timer))
    autoplayTimers.current = []
  }

  const clearWrongPreview = () => {
    if (wrongPreviewTimer.current !== null) window.clearTimeout(wrongPreviewTimer.current)
    wrongPreviewTimer.current = null
    setWrongPreview(null)
  }

  const scheduleOpponentMove = (nextPly: number) => {
    const timer = window.setTimeout(() => {
      autoplayTimers.current = autoplayTimers.current.filter((pending) => pending !== timer)
      setLinePly(nextPly)
    }, 900)
    autoplayTimers.current.push(timer)
  }

  const submit = (uci: string) => {
    if (done) return
    clearWrongPreview()
    clearAutoplay()
    setPicked(null)
    setHoveredSquare(null)
    setUnclear(false)
    const correct = uci === puzzle.solution
    if (!recorded.current) {
      recorded.current = true
      void onAnswered(record, correct)
    }
    if (correct) {
      setStatus('solved')
      setWrongMove(null)
      setContinuation(null)
      setLinePly(1)
      setLinePreview(false)
      if (lineSteps.length > 1) scheduleOpponentMove(2)
    } else {
      setStatus('wrong')
      setWrongMove(uci)
      const preview = play(explore(puzzle.fen), uci.slice(0, 2), uci.slice(2, 4), uci[4])
      if (!preview) throw new Error(`Cannot show invalid puzzle move ${uci}.`)
      setWrongPreview({ uci, fen: fenOf(preview) })
      wrongPreviewTimer.current = window.setTimeout(() => {
        wrongPreviewTimer.current = null
        setWrongPreview(null)
      }, 700)
    }
  }
  const tryMove = (from: string, to: string): boolean => {
    if (continuation) {
      const next = play(continuation, from, to)
      if (!next) return false
      setContinuation(next)
      setPicked(null)
      setHoveredSquare(null)
      return true
    }
    if (status === 'solved') {
      if (!lineFinished) {
        if (!awaitingUserLineMove) return false
        const next = play(explore(fen), from, to)
        if (!next) return false
        const move = next.moves[next.at - 1]
        if (move !== puzzle.line[linePly]) return false
        clearAutoplay()
        setPicked(null)
        setHoveredSquare(null)
        setLinePly(linePly + 1)
        setLinePreview(false)
        if (linePly + 1 < lineSteps.length) scheduleOpponentMove(linePly + 2)
        return true
      }
      const next = play(explore(fen), from, to)
      if (!next) return false
      setContinuation(next)
      setPicked(null)
      setHoveredSquare(null)
      return true
    }
    if (done) return false
    const uci = [from + to, from + to + 'q'].find((m) => moveFromText(puzzle.fen, m) === m)
    if (!uci) return false
    submit(uci)
    return true
  }
  const reveal = () => {
    clearWrongPreview()
    if (!recorded.current) {
      recorded.current = true
      void onAnswered(record, false)
    }
    setLinePly(1)
    setLinePreview(false)
    setStatus('shown')
  }
  const retry = () => {
    clearWrongPreview()
    clearAutoplay()
    setStatus('asking')
    setWrongMove(null)
    setPicked(null)
    setHoveredSquare(null)
    setLinePly(0)
    setLinePreview(false)
    setContinuation(null)
    setMarked(null)
    setText('')
    setUnclear(false)
  }
  const gotoLineMove = (index: number) => {
    clearAutoplay()
    setContinuation(null)
    setPicked(null)
    setHoveredSquare(null)
    setLinePly(index + 1)
    setLinePreview(true)
  }

  const nextLineMove = done && !continuation ? puzzle.line[linePly] : undefined
  const nextExplorationMove =
    continuation && continuation.at > 0 ? continuation.moves[continuation.at] : undefined
  const currentLineIndex = continuation ? -1 : done ? linePly - 1 : -1
  const lastMove = continuation
    ? continuation.moves[continuation.at - 1]
    : done
      ? puzzle.line[linePly - 1]
      : undefined
  const lastSquares = lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : []
  const when = record.date ? ` on ${record.date}` : ''
  const whiteWin = puzzle.color === 'w' ? puzzle.bestWin : 100 - puzzle.bestWin
  const { live, last, thinking, error } = useLiveEval(status === 'solved' || continuation ? fen : null)
  const liveEval = live ?? last
  const evalWin = liveEval ? winPercent(liveEval.eval.cp) : whiteWin
  const evalLabel = thinking || !liveEval ? '…' : evalText(liveEval.eval)
  const evalError =
    error == null
      ? null
      : error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown engine error'
  const bestMove = continuation && showBest ? live?.line[0] : undefined
  const nextMove = nextExplorationMove ?? nextLineMove
  const arrows = [
    ...(nextMove
      ? [{ startSquare: nextMove.slice(0, 2), endSquare: nextMove.slice(2, 4), color: ARROW }]
      : []),
    ...(bestMove && bestMove !== nextExplorationMove
      ? [{ startSquare: bestMove.slice(0, 2), endSquare: bestMove.slice(2, 4), color: BEST_ARROW }]
      : []),
  ]
  const engineLine = useMemo(() => (live ? lineMoves(fen, live.line.slice(0, 8)) : []), [fen, live])
  const explorationLine = useMemo(
    () => (continuation ? lineMoves(continuation.root, continuation.moves) : []),
    [continuation],
  )

  const backToPuzzle = () => {
    setContinuation(null)
    setPicked(null)
    setHoveredSquare(null)
    setLinePreview(false)
  }
  const analyzePuzzle = () => {
    clearAutoplay()
    setContinuation(explore(puzzle.fen, puzzle.line))
    setPicked(null)
    setHoveredSquare(null)
    setLinePreview(false)
  }
  const chooseEngineMove = (index: number) => {
    if (!continuation || !live) return
    const prefix = continuation.moves.slice(0, continuation.at)
    const engineMoves = live.line.slice(0, index + 1)
    setContinuation(
      explore(continuation.root, [...prefix, ...engineMoves], prefix.length + engineMoves.length),
    )
  }
  const chooseExplorationMove = (index: number) => {
    if (continuation) setContinuation(stepTo(continuation, index + 1))
  }
  const stepExploration = (at: number) => {
    setContinuation((current) => (current ? stepTo(current, at) : current))
  }
  useEffect(() => {
    if (!continuation) return
    const step = (move: (current: Exploration) => Exploration) =>
      setContinuation((current) => (current ? move(current) : current))
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement
      if (
        (target instanceof HTMLInputElement && target.type !== 'checkbox') ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      )
        return
      const actions: Record<string, () => void> = {
        ArrowLeft: () => step((current) => stepTo(current, current.at - 1)),
        ArrowRight: () => step((current) => stepTo(current, current.at + 1)),
        Home: () => step((current) => stepTo(current, 0)),
        End: () => step((current) => stepTo(current, current.moves.length)),
        Escape: () => {
          setContinuation(null)
          setPicked(null)
          setHoveredSquare(null)
          setLinePreview(false)
        },
        b: () => setShowBest((visible) => !visible),
      }
      const run = actions[event.key]
      if (run) {
        event.preventDefault()
        run()
      }
    }
    addEventListener('keydown', onKeyDown)
    return () => removeEventListener('keydown', onKeyDown)
  }, [continuation])

  return (
    <div className="stage train-stage">
      <section className="boardcol" aria-label="Puzzle board">
        <div
          className={`board-row train-board-row${status === 'solved' || continuation ? ' has-evaluation' : ''}`}
        >
          {(status === 'solved' || continuation) && (
            <PuzzleEvalBar
              win={evalWin}
              evalLabel={evalLabel}
              orientation={puzzle.color === 'w' ? 'white' : 'black'}
            />
          )}
          <div className="board" role="group" aria-label={`Board, ${turn} to move`}>
            <div>
              <Chessboard
                options={{
                  position: fen,
                  boardOrientation: puzzle.color === 'w' ? 'white' : 'black',
                  pieces: NAMED_PIECES,
                  allowDragging: canInteract,
                  dropSquareStyle: { boxShadow: 'none' },
                  onPieceDrag: ({ piece, square }) => {
                    const mine = square !== null && piece.pieceType[0] === fen.split(' ')[1]
                    setPicked(mine ? square : null)
                  },
                  onPieceDragCancel: () => {
                    setPicked(null)
                    setHoveredSquare(null)
                  },
                  onPieceDrop: ({ sourceSquare, targetSquare }) => {
                    const valid = targetSquare !== null && tryMove(sourceSquare, targetSquare)
                    setPicked(targetSquare === sourceSquare ? sourceSquare : null)
                    setHoveredSquare(null)
                    return valid
                  },
                  onMouseOverSquare: ({ square }) => setHoveredSquare(square),
                  onMouseOutSquare: ({ square }) => {
                    setHoveredSquare((current) => (current === square ? null : current))
                  },
                  onSquareMouseDown: ({ piece, square }, event) => {
                    if (!canInteract || event.button !== 0) return
                    const mine = piece && piece.pieceType[0] === fen.split(' ')[1]
                    if (mine) setPicked(square)
                  },
                  onSquareClick: ({ piece, square }) => {
                    if (!canInteract) return
                    if (picked && dots.includes(square) && tryMove(picked, square)) return
                    const mine = piece && piece.pieceType[0] === fen.split(' ')[1]
                    if (mine && square !== picked) setPicked(square)
                    else if (!mine) setPicked(null)
                  },
                  onSquareRightClick: ({ square }) => {
                    if (!canInteract) return
                    setMarked((current) => {
                      const squares = current?.fen === fen ? current.squares : []
                      return {
                        fen,
                        squares: squares.includes(square)
                          ? squares.filter((s) => s !== square)
                          : [...squares, square],
                      }
                    })
                  },
                  allowDrawingArrows: canInteract,
                  clearArrowsOnClick: true,
                  clearArrowsOnPositionChange: true,
                  animationDurationInMs: reducedMotion() ? 0 : 160,
                  lightSquareStyle: { backgroundColor: sq.light },
                  darkSquareStyle: { backgroundColor: sq.dark },
                  arrows,
                  squareRenderer: ({ piece, square, children }) => {
                    const hl = lastSquares.includes(square) || square === picked
                    const mark = marked?.fen === fen && marked.squares.includes(square)
                    const target = dots.includes(square)
                    const capture = target && piece !== null && piece.pieceType[0] !== sideToMove
                    const targetHovered = target && hoveredSquare === square
                    const wrongDestination = wrongPreview?.uci.slice(2, 4) === square
                    const kingCheck =
                      piece?.pieceType[1] === 'K' && piece.pieceType[0] === sideToMove ? positionCheck : null
                    return (
                      <div
                        data-mark={mark || undefined}
                        data-king-check={kingCheck ?? undefined}
                        style={{
                          width: '100%',
                          height: '100%',
                          position: 'relative',
                          backgroundColor: mark
                            ? SQUARE_MARK_COLOR
                            : targetHovered
                              ? LEGAL_MOVE_HOVER_COLOR
                              : hl
                                ? isLight(square)
                                  ? sq.hlLight
                                  : sq.hlDark
                                : undefined,
                        }}
                        onMouseEnter={() => setHoveredSquare(square)}
                        onMouseLeave={() =>
                          setHoveredSquare((current) => (current === square ? null : current))
                        }
                      >
                        {children}
                        {target && <LegalMoveMarker capture={capture} hovered={targetHovered} />}
                        {wrongDestination && (
                          <span className="wrong-move-marker" role="img" aria-label="Incorrect move">
                            ×
                          </span>
                        )}
                        {kingCheck === 'mate' && (
                          <span className="checkmate-marker" role="img" aria-label="Checkmate">
                            #
                          </span>
                        )}
                      </div>
                    )
                  },
                }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="train-panel" aria-label="Puzzle">
        <p className="train-kicker">
          {PHASE_NAMES[puzzle.phase]} · from your game against {record.opponent}
          {when}
        </p>
        <h2>
          {done
            ? status === 'solved'
              ? 'Correct'
              : 'The best move'
            : `${color} to move. Find the best move.`}
        </h2>

        <PuzzleTrace gameId={record.gameId} moveIndex={puzzle.moveIndex} held={puzzle.winBefore} />
        {status === 'solved' && evalError && (
          <p role="status" className="train-error">
            Stockfish evaluation failed: {evalError}
          </p>
        )}

        <div role="status" className="train-feedback">
          {status === 'asking' && <p className="muted">Drag a piece, or type your move below.</p>}
          {status === 'wrong' && (
            <p>
              {wrongMove === puzzle.playedUci
                ? 'That is the move you played in the game, and it was the mistake.'
                : 'That is not the best move.'}{' '}
              Try again, or show the answer.
            </p>
          )}
          {done && (
            <p>
              <strong>{puzzle.solutionSan}</strong> was the move. In the game you played{' '}
              <strong>{puzzle.playedSan}</strong> and gave up {puzzle.loss.toFixed(0)} points of win chance.
            </p>
          )}
          {unclear && (
            <p className="train-error">That is not a legal move here. Write it like Nxd5 or e2e4.</p>
          )}
        </div>

        {!done && (
          <form
            className="train-input"
            onSubmit={(e) => {
              e.preventDefault()
              const uci = moveFromText(puzzle.fen, text)
              if (!uci) return setUnclear(true)
              setText('')
              submit(uci)
            }}
          >
            <label>
              Your move
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Nxd5"
              />
            </label>
            <button type="submit" className="secondary">
              Check
            </button>
          </form>
        )}

        {done && (
          <>
            <p className="train-line">
              <span className="muted">Best line: </span>
              <span className="chips" role="list" aria-label="Best line moves">
                {line.map((m) => (
                  <span role="listitem" key={m.index}>
                    <button
                      type="button"
                      className="chip"
                      aria-current={m.index === currentLineIndex}
                      onClick={() => gotoLineMove(m.index)}
                    >
                      {m.text}
                    </button>
                  </span>
                ))}
              </span>
            </p>
            {awaitingUserLineMove && (
              <p className="muted">
                Your turn: play the next move in the best line; the opponent will reply.
              </p>
            )}
            {linePreview && !lineFinished && !awaitingUserLineMove && (
              <p className="muted">Select the next move in the best line to continue.</p>
            )}
            {lineFinished && status === 'solved' && !continuation && (
              <p className="muted">Best line played. You can keep playing from here.</p>
            )}
            {!continuation && (
              <div className="train-actions">
                <button className="secondary" onClick={analyzePuzzle}>
                  Analyze puzzle
                </button>
              </div>
            )}
            {continuation && (
              <div className="comment train-live" aria-live="polite">
                <h2>Exploring</h2>
                <p className="muted">
                  Try moves on the board. They are not part of the puzzle and are not saved. Use the arrow
                  keys to step through moves, Home/End to jump, B to toggle the best move, or Esc to return.
                </p>
                <label className="best-toggle">
                  <input
                    type="checkbox"
                    aria-label="Show best move"
                    checked={showBest}
                    onChange={(event) => setShowBest(event.currentTarget.checked)}
                  />
                  <span>Show best move</span>
                  <kbd aria-hidden="true">B</kbd>
                </label>
                <div className="train-analysis-nav" role="group" aria-label="Move through analysis">
                  <button
                    type="button"
                    className="secondary sm"
                    onClick={() => stepExploration(0)}
                    disabled={continuation.at === 0}
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    className="secondary sm"
                    onClick={() => stepExploration(continuation.at - 1)}
                    disabled={continuation.at === 0}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="secondary sm"
                    onClick={() => stepExploration(continuation.at + 1)}
                    disabled={continuation.at === continuation.moves.length}
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    className="secondary sm"
                    onClick={() => stepExploration(continuation.moves.length)}
                    disabled={continuation.at === continuation.moves.length}
                  >
                    End
                  </button>
                </div>
                <p className="nums explore-eval">
                  <b>{thinking || !live ? 'Thinking…' : evalText(live.eval)}</b>
                  {live && !thinking && live.depth > 0 && <span className="muted"> depth {live.depth}</span>}
                </p>
                {live && !thinking && engineLine.length > 0 && (
                  <div className="bestline">
                    <span className="muted">Engine</span>
                    <span className="chips" role="list" aria-label="Engine line">
                      {engineLine.map((m) => (
                        <span role="listitem" key={m.index}>
                          <button type="button" className="chip" onClick={() => chooseEngineMove(m.index)}>
                            {m.text}
                          </button>
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                <div className="bestline">
                  <span className="muted">Moves</span>
                  {explorationLine.length > 0 ? (
                    <span className="chips" role="list" aria-label="Analysis moves">
                      {explorationLine.map((m) => (
                        <span role="listitem" key={m.index}>
                          <button
                            type="button"
                            className="chip"
                            aria-current={m.index === continuation.at - 1}
                            onClick={() => chooseExplorationMove(m.index)}
                          >
                            {m.text}
                          </button>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="muted">none yet</span>
                  )}
                </div>
                <button className="secondary" onClick={backToPuzzle}>
                  Back to puzzle
                </button>
              </div>
            )}
            <div className="train-actions">
              <button className="primary" onClick={onNext} autoFocus>
                Next puzzle
              </button>
              <a
                className="secondary"
                href={`#/review/${record.gameId}?u=${encodeURIComponent(record.player)}`}
              >
                Open the game
              </a>
            </div>
            <div className="train-actions">
              <button className="ghost" onClick={retry}>
                Retry puzzle
              </button>
            </div>
          </>
        )}
        {!done && status === 'wrong' && (
          <div className="train-actions">
            <button className="secondary" onClick={reveal}>
              Show the answer
            </button>
          </div>
        )}
        {status === 'asking' && (
          <div className="train-actions">
            <button className="ghost" onClick={reveal}>
              Show the answer
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
