export const LEGAL_MOVE_COLOR = '#2E8B62'
export const LEGAL_MOVE_HOVER_COLOR = 'rgba(46, 139, 98, 0.35)'
export const SQUARE_MARK_COLOR = 'rgba(200, 64, 60, 0.55)'

export function LegalMoveMarker({ capture, hovered }: { capture: boolean; hovered: boolean }) {
  if (hovered) return null
  if (!capture) {
    return <span className="dot-target" aria-hidden="true" style={{ backgroundColor: LEGAL_MOVE_COLOR }} />
  }

  return (
    <span className="dot-capture" aria-hidden="true" style={{ color: LEGAL_MOVE_COLOR }}>
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}
