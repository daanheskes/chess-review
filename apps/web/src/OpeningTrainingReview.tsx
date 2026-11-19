import { winPercent, type Label } from '@chessreview/core'
import { useEffect, useMemo, useState } from 'react'
import { EvalBar } from './EvalBar'
import { explore, fenOf, play, stepTo, targets, type Exploration } from './explore'
import { ExplorePanel } from './ExplorePanel'
import { useLiveEval } from './hooks'
import { IconButton } from './icons'
import { evalText } from './labels'
import { LegalMoveMarker } from './LegalMoveMarker'
import { type openingGame } from './opening-lines'
import { BOARDS, usePrefs } from './prefs'
import { isLight, NAMED_PIECES, reducedMotion, VisibleChessboard } from './pieces'

export interface OpeningAttemptError {
  ply: number
  uci: string
  san: string
  fenBefore: string
  fenAfter: string
  kind: 'Incorrect move' | Label
}

type TrainingMove = ReturnType<typeof openingGame>['moves'][number]
type ReviewStep = { fen: string; label: string; uci?: string; error?: OpeningAttemptError }

export function OpeningTrainingReview({
  initialFen,
  moves,
  errors,
  side,
  variation,
  result,
  nextLevel,
  startDisabled,
  needsLichess,
  onStart,
}: {
  initialFen: string
  moves: TrainingMove[]
  errors: OpeningAttemptError[]
  side: 'w' | 'b'
  variation: string
  result: string
  nextLevel: string
  startDisabled: boolean
  needsLichess: boolean
  onStart: () => void
}) {
  const steps = useMemo(() => {
    const result: ReviewStep[] = [{ fen: initialFen, label: 'Start' }]
    moves.forEach((move, index) => {
      for (const error of errors.filter((item) => item.ply === index)) {
        result.push({
          fen: error.fenAfter,
          label: `${move.number}${move.color === 'w' ? '.' : '…'} ${error.san}`,
          uci: error.uci,
          error,
        })
      }
      result.push({
        fen: move.fenAfter,
        label: `${move.number}${move.color === 'w' ? '.' : '…'} ${move.san}`,
        uci: move.uci,
      })
    })
    for (const error of errors.filter((item) => item.ply === moves.length)) {
      const [, turn, , , , number] = error.fenBefore.split(' ')
      result.push({
        fen: error.fenAfter,
        label: `${number}${turn === 'w' ? '.' : '…'} ${error.san}`,
        uci: error.uci,
        error,
      })
    }
    return result
  }, [errors, initialFen, moves])
  const [index, setIndex] = useState(steps.length - 1)
  const [showBest, setShowBest] = useState(true)
  const [flipped, setFlipped] = useState(side === 'b')
  const [exploring, setExploring] = useState<Exploration | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const step = steps[index]!
  const fen = exploring ? fenOf(exploring) : step.fen
  const turn = fen.split(' ')[1]
  const { live, thinking, error } = useLiveEval(fen)
  const { board } = usePrefs()
  const squares = BOARDS[board]
  const best = showBest && !error ? live?.line[0] : undefined
  const arrows = best
    ? [{ startSquare: best.slice(0, 2), endSquare: best.slice(2, 4), color: '#2E8B62' }]
    : []
  const last = exploring ? exploring.moves[exploring.at - 1] : step.uci
  const dots = picked ? targets(fen, picked) : []
  const at = exploring ? exploring.at : index
  const end = exploring ? exploring.moves.length : steps.length - 1
  const walk = (next: number) => {
    if (exploring) setExploring(stepTo(exploring, next))
    else setIndex(Math.max(0, Math.min(steps.length - 1, next)))
    setPicked(null)
  }
  const tryMove = (from: string, to: string) => {
    const next = play(exploring ?? explore(fen), from, to)
    if (!next) return false
    setExploring(next)
    setPicked(null)
    return true
  }
  const backToOpening = () => {
    setExploring(null)
    setPicked(null)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return
      const target = event.target as HTMLElement
      if (
        (target instanceof HTMLInputElement && target.type !== 'checkbox') ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
        return
      if (event.key === 'ArrowLeft') walk(at - 1)
      else if (event.key === 'ArrowRight') walk(at + 1)
      else if (event.key === 'Home') walk(0)
      else if (event.key === 'End') walk(end)
      else if (event.key === 'Escape' && exploring) backToOpening()
      else if (event.key.toLowerCase() === 'f') setFlipped((current) => !current)
      else if (event.key.toLowerCase() === 'b') setShowBest((current) => !current)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="stage train-stage">
      <section className="boardcol" aria-label="Opening board">
        <div className="board-row">
          <EvalBar
            win={live && !error ? winPercent(live.eval.cp) : 50}
            evalLabel={thinking ? '…' : error ? 'unavailable' : live ? evalText(live.eval) : '…'}
            orientation={flipped ? 'black' : 'white'}
          />
          <div
            className="board"
            role="group"
            aria-label={`Board, ${turn === 'w' ? 'White' : 'Black'} to move`}
          >
            <div>
              <VisibleChessboard
                active
                options={{
                  position: fen,
                  boardOrientation: flipped ? 'black' : 'white',
                  pieces: NAMED_PIECES,
                  allowDragging: true,
                  dropSquareStyle: { boxShadow: 'none' },
                  onPieceDrag: ({ piece, square }) => setPicked(piece.pieceType[0] === turn ? square : null),
                  onPieceDragCancel: () => setPicked(null),
                  onPieceDrop: ({ sourceSquare, targetSquare }) =>
                    targetSquare !== null && tryMove(sourceSquare, targetSquare),
                  onSquareClick: ({ piece, square }) => {
                    if (picked && dots.includes(square) && tryMove(picked, square)) return
                    setPicked(piece?.pieceType[0] === turn && square !== picked ? square : null)
                  },
                  animationDurationInMs: reducedMotion() ? 0 : 160,
                  lightSquareStyle: { backgroundColor: squares.light },
                  darkSquareStyle: { backgroundColor: squares.dark },
                  arrows,
                  squareRenderer: ({ piece, square, children }) => (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        backgroundColor:
                          last?.slice(0, 2) === square || last?.slice(2, 4) === square || picked === square
                            ? isLight(square)
                              ? squares.hlLight
                              : squares.hlDark
                            : undefined,
                      }}
                    >
                      {children}
                      {dots.includes(square) && (
                        <LegalMoveMarker capture={!!piece && piece.pieceType[0] !== turn} hovered={false} />
                      )}
                    </div>
                  ),
                }}
              />
            </div>
          </div>
        </div>
        <div className="controls">
          <div className="navgroup" role="group" aria-label="Move through the opening">
            <IconButton
              label="Start"
              onClick={() => walk(0)}
              disabled={at === 0}
              d="M6 5v14M18 5l-8 7 8 7z"
            />
            <IconButton
              label="Previous move"
              onClick={() => walk(at - 1)}
              disabled={at === 0}
              d="M15 5l-8 7 8 7z"
            />
            <IconButton
              label="Next move"
              onClick={() => walk(at + 1)}
              disabled={at === end}
              d="M9 5l8 7-8 7z"
            />
            <IconButton
              label="End"
              onClick={() => walk(end)}
              disabled={at === end}
              d="M18 5v14M6 5l8 7-8 7z"
            />
          </div>
          <div className="controls-end">
            <IconButton
              label="Flip board"
              onClick={() => setFlipped((current) => !current)}
              disabled={false}
              outline
              d="M8 20V5M8 5L4.5 8.5M8 5l3.5 3.5M16 4v15M16 19l-3.5-3.5M16 19l3.5-3.5"
            />
            {exploring && (
              <button type="button" className="secondary sm mobile-explore-back" onClick={backToOpening}>
                Back to opening
              </button>
            )}
          </div>
        </div>
      </section>
      <div className="stage-side train-panel">
        <div className="learn-result">
          <p role="status">{result}</p>
          <button type="button" className="cta" disabled={startDisabled} onClick={onStart}>
            {needsLichess ? 'Connect Lichess to continue' : `Start ${nextLevel}`}
          </button>
        </div>
        <div>
          <h3>Review · {variation}</h3>
          {!exploring && (
            <p className="muted">{step.error ? `${step.error.kind}: ${step.label}.` : step.label}</p>
          )}
        </div>
        <label className="best-toggle">
          <input
            type="checkbox"
            checked={showBest}
            onChange={(event) => setShowBest(event.currentTarget.checked)}
          />
          <span>Show best move</span>
          <kbd aria-hidden="true">B</kbd>
        </label>
        {thinking && <p role="status">Stockfish is evaluating this position…</p>}
        {!!error && (
          <p className="error" role="alert">
            Stockfish could not evaluate this position:{' '}
            {error instanceof Error ? error.message : 'Unknown engine error.'}
          </p>
        )}
        {exploring && (
          <ExplorePanel
            x={exploring}
            live={error ? undefined : live}
            thinking={thinking}
            onChange={setExploring}
            onExit={backToOpening}
            backLabel="Back to opening"
            movesLabel="Exploration moves"
          />
        )}
        <div className="learn-moves" aria-label="Practice moves">
          {steps.map((item, stepIndex) => (
            <button
              key={stepIndex}
              type="button"
              className={item.error ? 'learn-review-error' : undefined}
              aria-current={index === stepIndex ? 'step' : undefined}
              onClick={() => {
                setIndex(stepIndex)
                backToOpening()
              }}
            >
              {item.label}
              {item.error ? ` (${item.error.kind})` : ''}
            </button>
          ))}
        </div>
        <p className="muted">
          Use the arrow keys to step through moves, B to toggle the best move, and Esc to return to the
          opening.
        </p>
      </div>
    </div>
  )
}
