import { explore, fenOf, lineMoves, stepTo, type Exploration } from './explore'
import { evalText } from './labels'
import type { LiveEval } from './services'

export function MoveChips({
  fen,
  line,
  label,
  current,
  onPick,
}: {
  fen: string
  line: readonly string[]
  label: string
  current?: number
  onPick: (index: number) => void
}) {
  return (
    <span className="chips" role="list" aria-label={label}>
      {lineMoves(fen, line).map((move) => (
        <span role="listitem" key={move.index}>
          <button className="chip" aria-current={move.index === current} onClick={() => onPick(move.index)}>
            {move.text}
          </button>
        </span>
      ))}
    </span>
  )
}

export function ExplorePanel({
  x,
  live,
  thinking,
  onChange,
  onExit,
  backLabel = 'Back to the game',
  movesLabel = 'Your moves',
}: {
  x: Exploration
  live: LiveEval | undefined
  thinking: boolean
  onChange: (x: Exploration) => void
  onExit: () => void
  backLabel?: string
  movesLabel?: string
}) {
  const fen = fenOf(x)
  return (
    <div className="comment explore" aria-live="polite">
      <h2>Exploring</h2>
      <p className="muted">Try moves on the board. They are not part of the review and are not saved.</p>
      <p className="nums explore-eval">
        <b>{thinking || !live ? 'Thinking…' : evalText(live.eval)}</b>
        {live && !thinking && live.depth > 0 && <span className="muted"> depth {live.depth}</span>}
      </p>
      {live && !thinking && live.line.length > 0 && (
        <div className="bestline">
          <span className="muted">Engine</span>
          <MoveChips
            fen={fen}
            line={live.line.slice(0, 8)}
            label="Engine line"
            onPick={(i) =>
              onChange(
                explore(x.root, [...x.moves.slice(0, x.at), ...live.line.slice(0, i + 1)], x.at + i + 1),
              )
            }
          />
        </div>
      )}
      <div className="bestline">
        <span className="muted">Moves</span>
        {x.moves.length ? (
          <MoveChips
            fen={x.root}
            line={x.moves}
            label={movesLabel}
            current={x.at - 1}
            onPick={(i) => onChange(stepTo(x, i + 1))}
          />
        ) : (
          <span className="muted"> none yet</span>
        )}
      </div>
      <button className="secondary" onClick={onExit}>
        {backLabel}
      </button>
    </div>
  )
}
