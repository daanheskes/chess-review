import type { Side } from '@chessreview/core'

export function EvalBar({
  win,
  evalLabel,
  orientation,
}: {
  win: number
  evalLabel: string
  orientation: Side
}) {
  const whiteOnBottom = orientation === 'white'
  const leadWhite = win >= 50
  const labelAtBottom = leadWhite === whiteOnBottom
  return (
    <div className="evalbar" role="img" aria-label={`Evaluation ${evalLabel}`}>
      <div className="evalbar-white" style={{ height: `${win}%`, [whiteOnBottom ? 'bottom' : 'top']: 0 }} />
      <span
        className={`evalbar-label ${leadWhite ? 'on-white' : 'on-black'}`}
        style={{ [labelAtBottom ? 'bottom' : 'top']: 4 }}
      >
        {evalLabel}
      </span>
    </div>
  )
}
