import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader } from './AppHeader'
import { explore, fenOf, play, targets } from './explore'
import { LegalMoveMarker } from './LegalMoveMarker'
import {
  curatedOpeningDescriptions,
  curatedOpeningIds,
  firstOpeningPiece,
  groupLinesByName,
  openingGame,
  openingGroups,
  openingLines,
  openingLineSlug,
  openingProfiles,
  openingSlug,
  recommendedGroups,
  type OpeningLine,
} from './opening-lines'
import { isLight, NAMED_PIECES, PIECE_NAMES, reducedMotion, VisibleChessboard } from './pieces'
import { BOARDS, usePrefs } from './prefs'
import { Segmented } from './Segmented'

type Side = 'w' | 'b'
type SideFilter = Side | 'all'
type LevelFilter = 'Any level' | 'Beginner' | 'Club' | 'Expert'
type StyleFilter = 'Any style' | 'Solid' | 'Aggressive'
type Saved = { id: string; side: Side }
type Progress = Saved & { correct: number; total: number }
type Completion = Saved & { done: number; total: number }
type TrainingLevel = 0 | 1 | 2 | 3
type LevelProgress = Saved & { level: TrainingLevel; mastered: boolean }
const LEVEL_ORDER = { Beginner: 0, Club: 1, Expert: 2 } as const
const STYLE_ORDER = { Solid: 0, Aggressive: 1 } as const
const STARTER_OPENINGS = [
  { name: 'London System', side: 'w', label: 'White' },
  { name: 'Caro-Kann Defense', side: 'b', label: 'Black · vs 1.e4' },
  { name: "King's Indian Defense", side: 'b', label: 'Black · vs 1.d4 · Expert' },
] as const
const REPERTOIRE_KEY = 'chessreview.opening-repertoire'
const PROGRESS_KEY = 'chessreview.opening-progress'
const COMPLETION_KEY = 'chessreview.opening-completion'
const LEVEL_KEY = 'chessreview.opening-levels'

function openingUrl(name: string, side: Side, line?: OpeningLine): string {
  return `#/openings/${openingSlug(name)}${line ? `/${openingLineSlug(line)}` : ''}?side=${side}`
}

function readRepertoire(): { saved: Saved[]; error: string | null } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(REPERTOIRE_KEY) ?? '[]')
    if (
      !Array.isArray(raw) ||
      !raw.every(
        (item: unknown) =>
          typeof item === 'object' &&
          item !== null &&
          'id' in item &&
          typeof item.id === 'string' &&
          'side' in item &&
          (item.side === 'w' || item.side === 'b'),
      )
    )
      throw new Error('Invalid repertoire')
    return { saved: raw as Saved[], error: null }
  } catch {
    return { saved: [], error: 'Could not read your repertoire. Reload the page before making changes.' }
  }
}

function readProgress(): { entries: Progress[]; error: string | null } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '[]')
    if (
      !Array.isArray(raw) ||
      !raw.every(
        (item: unknown) =>
          typeof item === 'object' &&
          item !== null &&
          'id' in item &&
          typeof item.id === 'string' &&
          'side' in item &&
          (item.side === 'w' || item.side === 'b') &&
          'correct' in item &&
          typeof item.correct === 'number' &&
          Number.isInteger(item.correct) &&
          'total' in item &&
          typeof item.total === 'number' &&
          Number.isInteger(item.total) &&
          item.total > 0 &&
          item.correct >= 0 &&
          item.correct <= item.total,
      )
    )
      throw new Error('Invalid opening progress')
    return { entries: raw as Progress[], error: null }
  } catch {
    return { entries: [], error: 'Could not read your practice progress. Reload the page to save progress.' }
  }
}

function readCompletion(): { entries: Completion[]; error: string | null } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(COMPLETION_KEY) ?? '[]')
    if (
      !Array.isArray(raw) ||
      !raw.every(
        (item: unknown) =>
          typeof item === 'object' &&
          item !== null &&
          'id' in item &&
          typeof item.id === 'string' &&
          'side' in item &&
          (item.side === 'w' || item.side === 'b') &&
          'done' in item &&
          typeof item.done === 'number' &&
          Number.isInteger(item.done) &&
          'total' in item &&
          typeof item.total === 'number' &&
          Number.isInteger(item.total) &&
          item.total > 0 &&
          item.done >= 0 &&
          item.done <= item.total,
      )
    )
      throw new Error('Invalid opening completion')
    return { entries: raw as Completion[], error: null }
  } catch {
    return { entries: [], error: 'Could not read your opening progress. Reload the page before practicing.' }
  }
}

function readLevels(): { entries: LevelProgress[]; error: string | null } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LEVEL_KEY) ?? '[]')
    if (
      !Array.isArray(raw) ||
      !raw.every(
        (item: unknown) =>
          typeof item === 'object' &&
          item !== null &&
          'id' in item &&
          typeof item.id === 'string' &&
          'side' in item &&
          (item.side === 'w' || item.side === 'b') &&
          'level' in item &&
          (item.level === 0 || item.level === 1 || item.level === 2 || item.level === 3) &&
          'mastered' in item &&
          typeof item.mastered === 'boolean' &&
          (!item.mastered || item.level === 3),
      )
    )
      throw new Error('Invalid opening levels')
    return { entries: raw as LevelProgress[], error: null }
  } catch {
    return { entries: [], error: 'Could not read your training levels. Reload the page before practicing.' }
  }
}

export function LearnPage({ hash, navigate }: { hash: string; navigate: (hash: string) => void }) {
  const [repertoire, setRepertoire] = useState(readRepertoire)
  const [repertoireOpen, setRepertoireOpen] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<(Saved & { name: string }) | null>(null)
  const [progress, setProgress] = useState(readProgress)
  const [completion, setCompletion] = useState(readCompletion)
  const [levels, setLevels] = useState(readLevels)
  const [sideFilter, setSideFilter] = useState<SideFilter>('all')
  const [level, setLevel] = useState<LevelFilter>('Any level')
  const [style, setStyle] = useState<StyleFilter>('Any style')
  const hasFilters = sideFilter !== 'all' || level !== 'Any level' || style !== 'Any style'
  const [path = '', query = ''] = hash.split('?')
  const segments = path.split('/').slice(2)
  const group = segments[0] ? openingGroups.find((item) => openingSlug(item.name) === segments[0]) : undefined
  const selected = segments[1]
    ? group?.lines.find((line) => openingLineSlug(line) === segments[1])
    : undefined
  const invalidRoute = !!segments[0] && (!group || (!!segments[1] && !selected) || segments.length > 2)
  const requestedSide = new URLSearchParams(query).get('side')
  const side: Side =
    requestedSide === 'w' || requestedSide === 'b'
      ? requestedSide
      : group && recommendedGroups.b.some((name) => name === group.name)
        ? 'b'
        : 'w'
  const saved = selected
    ? repertoire.saved.some((entry) => entry.id === selected.id && entry.side === side)
    : false
  const recommendations = (['w', 'b'] as const).flatMap((color) =>
    recommendedGroups[color].map((name) => ({
      group: openingGroups.find((item) => item.name === name)!,
      side: color,
    })),
  )
  const missingStarter = STARTER_OPENINGS.filter(
    (starter) =>
      !repertoire.saved.some((entry) => {
        const line = openingLines.find((item) => item.id === entry.id)
        return entry.side === starter.side && line?.name.split(/[:,]/, 1)[0]!.trim() === starter.name
      }),
  )
  const matches = recommendations
    .filter(
      (item) =>
        (sideFilter === 'all' || sideFilter === item.side) &&
        (level === 'Any level' || openingProfiles[item.group.name]!.level === level) &&
        (style === 'Any style' || openingProfiles[item.group.name]!.style === style),
    )
    .sort((a, b) => {
      const first = openingProfiles[a.group.name]!
      const second = openingProfiles[b.group.name]!
      return (
        LEVEL_ORDER[first.level] - LEVEL_ORDER[second.level] ||
        STYLE_ORDER[first.style] - STYLE_ORDER[second.style]
      )
    })
  const lines = group?.lines ?? []
  const lineGroups = groupLinesByName(lines)

  useEffect(() => {
    document.title = `${selected?.name ?? group?.name ?? 'Openings'} · chessreview`
  }, [group, selected])

  const saveRepertoire = (next: Saved[]) => {
    if (repertoire.error) return
    try {
      localStorage.setItem(REPERTOIRE_KEY, JSON.stringify(next))
      setRepertoire({ saved: next, error: null })
    } catch {
      setRepertoire({
        saved: repertoire.saved,
        error: 'Could not save your repertoire. Check browser storage.',
      })
    }
  }

  const toggleSaved = (id: string, savedSide: Side) => {
    const exists = repertoire.saved.some((entry) => entry.id === id && entry.side === savedSide)
    if (exists) {
      const line = openingLines.find((item) => item.id === id)!
      setPendingRemoval({ id, side: savedSide, name: line.name.split(/[:,]/, 1)[0]!.trim() })
    } else {
      saveRepertoire([...repertoire.saved, { id, side: savedSide }])
    }
  }

  const recordPractice = (id: string, practiceSide: Side, correct: number, total: number) => {
    if (progress.error) return
    const entries = [
      ...progress.entries.filter((entry) => entry.id !== id || entry.side !== practiceSide),
      { id, side: practiceSide, correct, total },
    ]
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(entries))
      setProgress({ entries, error: null })
    } catch {
      setProgress({
        entries: progress.entries,
        error: 'Could not save your practice progress. Check browser storage.',
      })
    }
  }

  const recordCompletion = (id: string, practiceSide: Side, done: number, total: number) => {
    if (completion.error || total === 0) return
    const previous = completion.entries.find((entry) => entry.id === id && entry.side === practiceSide)
    if (previous && previous.done >= done && previous.total === total) return
    const entries = [
      ...completion.entries.filter((entry) => entry.id !== id || entry.side !== practiceSide),
      { id, side: practiceSide, done, total },
    ]
    try {
      localStorage.setItem(COMPLETION_KEY, JSON.stringify(entries))
      setCompletion({ entries, error: null })
    } catch {
      setCompletion({
        entries: completion.entries,
        error: 'Could not save your opening progress. Check browser storage.',
      })
    }
  }

  const recordLevel = (id: string, practiceSide: Side, nextLevel: TrainingLevel, mastered: boolean) => {
    if (levels.error) return false
    const entries = [
      ...levels.entries.filter((entry) => entry.id !== id || entry.side !== practiceSide),
      { id, side: practiceSide, level: nextLevel, mastered },
    ]
    try {
      localStorage.setItem(LEVEL_KEY, JSON.stringify(entries))
      setLevels({ entries, error: null })
      return true
    } catch {
      setLevels({
        entries: levels.entries,
        error: 'Could not save your training level. Check browser storage.',
      })
      return false
    }
  }

  return (
    <>
      <AppHeader active="openings" />
      <main className="page learn">
        {group && !invalidRoute && (
          <nav className="learn-breadcrumbs" aria-label="Breadcrumb">
            <a href="#/openings">Openings</a>
            <span aria-hidden="true">/</span>
            {selected ? (
              <>
                <a href={openingUrl(group.name, side)}>{group.name}</a>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{selected.name}</span>
              </>
            ) : (
              <span aria-current="page">{group.name}</span>
            )}
          </nav>
        )}
        <div className="insights-head">
          <h1>{selected?.name ?? group?.name ?? 'Openings'}</h1>
        </div>
        {repertoire.error && (
          <p className="error" role="alert">
            {repertoire.error}
          </p>
        )}
        {progress.error && (
          <p className="error" role="alert">
            {progress.error}
          </p>
        )}
        {completion.error && (
          <p className="error" role="alert">
            {completion.error}
          </p>
        )}
        {levels.error && (
          <p className="error" role="alert">
            {levels.error}
          </p>
        )}
        {!segments[0] && (
          <section className="learn-repertoire" aria-label="My repertoire">
            <h2>
              <button
                type="button"
                className="learn-repertoire-toggle"
                aria-expanded={repertoireOpen}
                aria-controls="repertoire-content"
                onClick={() => setRepertoireOpen((open) => !open)}
              >
                My repertoire
                {!repertoire.error && (
                  <span
                    className="pill"
                    aria-label={`${repertoire.saved.length} saved opening${repertoire.saved.length === 1 ? '' : 's'}`}
                  >
                    {repertoire.saved.length}
                  </span>
                )}
                <span className="learn-repertoire-action" aria-hidden="true">
                  {repertoireOpen ? 'Hide' : 'Show'}
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor">
                    <path d={repertoireOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} strokeWidth="2" />
                  </svg>
                </span>
              </button>
            </h2>
            <div id="repertoire-content" hidden={!repertoireOpen}>
              {repertoire.saved.length === 0 ? (
                <p className="muted">Add openings to your repertoire to see them here.</p>
              ) : (
                <>
                  <div className="learn-cards learn-repertoire-cards">
                    {repertoire.saved.map((entry) => {
                      const line = openingLines.find((item) => item.id === entry.id)
                      if (!line)
                        return (
                          <p key={`${entry.side}|${entry.id}`}>A saved opening is no longer available.</p>
                        )
                      const result = progress.entries.find(
                        (item) => item.id === entry.id && item.side === entry.side,
                      )
                      const groupName = line.name.split(/[:,]/, 1)[0]!.trim()
                      const recommended = Object.values(recommendedGroups).some((names) =>
                        names.some((name) => name === groupName),
                      )
                      const pieceMove = recommended
                        ? firstOpeningPiece(groupName, entry.side).move
                        : openingGame(line).moves.find(
                            (move) => move.color === entry.side && /^[KQRBN]/.test(move.san),
                          )
                      return (
                        <article
                          className="learn-card learn-card-compact learn-opening-card"
                          key={`${entry.side}|${entry.id}`}
                        >
                          <div className="learn-card-heading">
                            {pieceMove && <OpeningPieceIcon move={pieceMove.san} side={entry.side} />}
                            <strong>{groupName}</strong>
                            <RepertoireStar
                              name={groupName}
                              side={entry.side}
                              saved
                              disabled={!!repertoire.error}
                              onClick={() => toggleSaved(line.id, entry.side)}
                            />
                          </div>
                          <div className="learn-card-tags">
                            <OpeningMoveBadge line={line} side={entry.side} />
                          </div>
                          <p className="learn-card-progress">
                            {entry.side === 'w' ? 'White' : 'Black'} ·{' '}
                            {result
                              ? `${Math.round((result.correct / result.total) * 100)}% first try (${result.correct}/${result.total})`
                              : 'Not practiced yet'}
                          </p>
                          <button
                            type="button"
                            className="cta"
                            aria-label={`Train ${groupName} as ${entry.side === 'w' ? 'White' : 'Black'}`}
                            onClick={() => {
                              navigate(openingUrl(groupName, entry.side, recommended ? undefined : line))
                            }}
                          >
                            Train
                          </button>
                        </article>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
        )}
        {pendingRemoval && (
          <RemoveOpeningDialog
            opening={pendingRemoval}
            onClose={() => setPendingRemoval(null)}
            onConfirm={() =>
              saveRepertoire(
                repertoire.saved.filter(
                  (entry) => entry.id !== pendingRemoval.id || entry.side !== pendingRemoval.side,
                ),
              )
            }
          />
        )}
        {invalidRoute ? (
          <p role="alert">
            This opening or line could not be found. <a href="#/openings">Back to openings</a>
          </p>
        ) : group && !selected ? (
          <section aria-label="Opening variations">
            {openingProfiles[group.name] && (
              <p className="muted">{openingProfiles[group.name]!.description}</p>
            )}
            <div className="learn-picker">
              <span>Play as</span>
              <Segmented
                label="Play as"
                value={side}
                options={[
                  { value: 'w', label: 'White' },
                  { value: 'b', label: 'Black' },
                ]}
                onChange={(value) => {
                  navigate(openingUrl(group.name, value))
                }}
              />
            </div>
            <p className="muted">
              {lines.length} {lines.length === 1 ? 'line' : 'lines'}
              {lineGroups.length !== lines.length && ` · ${lineGroups.length} named variations`}
            </p>
            <div className="learn-cards learn-line-cards" aria-label="Opening lines">
              {lineGroups.map((sameName) => {
                const line = sameName[0]!
                const main = curatedOpeningIds.has(line.id)
                const lineProgress = (item: OpeningLine) => {
                  const completed = progress.entries.some(
                    (entry) => entry.id === item.id && entry.side === side,
                  )
                  const entry = completion.entries.find(
                    (entry) => entry.id === item.id && entry.side === side,
                  )
                  return completed ? 100 : entry ? Math.round((entry.done / entry.total) * 100) : 0
                }
                const percent = lineProgress(line)
                return (
                  <article className="learn-card learn-line-card" key={line.id}>
                    <h2>{main ? 'Main line' : line.name}</h2>
                    {main && (
                      <>
                        <strong>{line.name}</strong>
                        <p className="muted">
                          A selected main-line variation; other variations have their own main lines.
                        </p>
                      </>
                    )}
                    <p className="learn-card-description">
                      {curatedOpeningDescriptions.get(line.id) ??
                        'An explanation is not available for this line yet.'}
                    </p>
                    <p className="muted">
                      {line.eco} · {line.types.length ? line.types.join(', ') : 'Type not classified'}
                    </p>
                    <p className="learn-line-moves">{line.pgn}</p>
                    <p className="learn-card-progress">Progress · {percent}%</p>
                    <progress max={100} value={percent} aria-label={`${line.name} progress`} />
                    <a className="cta" href={openingUrl(group.name, side, line)}>
                      Train
                    </a>
                    {sameName.length > 1 && (
                      <details className="learn-line-alternatives">
                        <summary>
                          {sameName.length - 1} more{' '}
                          {sameName.length === 2 ? 'continuation' : 'continuations'}
                        </summary>
                        {sameName.slice(1).map((alternative) => {
                          const alternativePercent = lineProgress(alternative)
                          return (
                            <div className="learn-line-alternative" key={alternative.id}>
                              <p className="learn-line-moves">{alternative.pgn}</p>
                              <p className="learn-card-progress">Progress · {alternativePercent}%</p>
                              <progress
                                max={100}
                                value={alternativePercent}
                                aria-label={`${alternative.name}, ${alternative.pgn} progress`}
                              />
                              <a className="cta" href={openingUrl(group.name, side, alternative)}>
                                Train
                              </a>
                            </div>
                          )
                        })}
                      </details>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        ) : !group ? (
          <>
            {repertoire.saved.length === 0 && (
              <section className="learn-starter" aria-labelledby="starter-title">
                <h2 id="starter-title">New to openings?</h2>
                <p className="muted">
                  Use our recommended starter repertoire: a setup for White and a defense against each common
                  first move.
                </p>
                <ul>
                  {STARTER_OPENINGS.map((opening) => (
                    <li key={opening.name}>
                      <strong>{opening.name}</strong>
                      <span>{opening.label}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="cta"
                  disabled={!!repertoire.error || missingStarter.length === 0}
                  onClick={() =>
                    saveRepertoire([
                      ...repertoire.saved,
                      ...missingStarter.map((opening) => ({
                        id: recommendations.find(
                          (item) => item.group.name === opening.name && item.side === opening.side,
                        )!.group.lines[0]!.id,
                        side: opening.side,
                      })),
                    ])
                  }
                >
                  {missingStarter.length === 0 ? 'Starter repertoire added' : 'Add starter repertoire'}
                </button>
              </section>
            )}
            <div className="learn-filters">
              <div>
                <span>Play as</span>
                <Segmented
                  label="Filter by side"
                  value={sideFilter}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'w', label: 'White' },
                    { value: 'b', label: 'Black' },
                  ]}
                  onChange={setSideFilter}
                />
              </div>
              <label>
                Level
                <select value={level} onChange={(event) => setLevel(event.target.value as LevelFilter)}>
                  {(['Any level', 'Beginner', 'Club', 'Expert'] as const).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Style
                <select value={style} onChange={(event) => setStyle(event.target.value as StyleFilter)}>
                  {(['Any style', 'Solid', 'Aggressive'] as const).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="learn-list-heading">
              <h2>
                {sideFilter === 'all'
                  ? 'All openings'
                  : `Openings for ${sideFilter === 'w' ? 'White' : 'Black'}`}
              </h2>
            </div>
            <div className="learn-filter-summary">
              <span>
                Showing {matches.length} of {recommendations.length}
              </span>
              {hasFilters && (
                <>
                  <span className="learn-active-filters" role="group" aria-label="Active filters">
                    {sideFilter !== 'all' && (
                      <span className="pill">Side: {sideFilter === 'w' ? 'White' : 'Black'}</span>
                    )}
                    {level !== 'Any level' && <span className="pill">Level: {level}</span>}
                    {style !== 'Any style' && <span className="pill">Style: {style}</span>}
                  </span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setSideFilter('all')
                      setLevel('Any level')
                      setStyle('Any style')
                    }}
                  >
                    × Reset
                  </button>
                </>
              )}
            </div>
            <div className="learn-cards" aria-label="Openings">
              {matches.length === 0 && (
                <p className="learn-empty" role="status">
                  No openings for the selected filters. Try changing or resetting them.
                </p>
              )}
              {matches.map(({ group: item, side: cardSide }) => {
                const count = item.lines.length
                const profile = openingProfiles[item.name]!
                const example = firstOpeningPiece(item.name, cardSide)
                const line = item.lines[0]!
                const cardSaved = repertoire.saved.some(
                  (entry) => entry.id === line.id && entry.side === cardSide,
                )
                return (
                  <article className="learn-card learn-opening-card" key={`${cardSide}|${item.name}`}>
                    <span className="learn-card-heading">
                      <OpeningPieceIcon move={example.move.san} side={cardSide} />
                      <strong>{item.name}</strong>
                      <RepertoireStar
                        name={item.name}
                        side={cardSide}
                        saved={cardSaved}
                        disabled={!!repertoire.error}
                        onClick={() => toggleSaved(line.id, cardSide)}
                      />
                    </span>
                    <span className="learn-card-tags">
                      <OpeningMoveBadge line={line} side={cardSide} />
                      <span>{profile.level}</span>
                      <span>{profile.style}</span>
                      <span>
                        {count} {count === 1 ? 'line' : 'lines'}
                      </span>
                    </span>
                    <span className="learn-card-description">{profile.description}</span>
                    <button
                      type="button"
                      className="cta"
                      onClick={() => {
                        navigate(openingUrl(item.name, cardSide))
                      }}
                    >
                      Train
                    </button>
                  </article>
                )
              })}
            </div>
          </>
        ) : null}
        {selected && !invalidRoute && (
          <section className="learn-details" aria-label="Selected opening">
            <p>
              {selected.eco} · {selected.types.length ? selected.types.join(', ') : 'Type not classified'}
            </p>
            <div className="learn-actions">
              <Segmented
                label="Play as"
                value={side}
                options={[
                  { value: 'w', label: 'White' },
                  { value: 'b', label: 'Black' },
                ]}
                onChange={(value) => {
                  if (group) navigate(openingUrl(group.name, value, selected))
                }}
              />
              {!saved && (
                <button
                  type="button"
                  className="secondary"
                  disabled={!!repertoire.error}
                  onClick={() => toggleSaved(selected.id, side)}
                >
                  Add to repertoire
                </button>
              )}
            </div>
            <OpeningBoard
              key={`${selected.id}|${side}`}
              line={selected}
              side={side}
              level={levels.entries.find((entry) => entry.id === selected.id && entry.side === side)}
              levelError={!!levels.error}
              onLevelChange={recordLevel}
              onComplete={recordPractice}
              onAdvance={recordCompletion}
            />
          </section>
        )}
      </main>
    </>
  )
}

function OpeningMoveBadge({ line, side }: { line: OpeningLine; side: Side }) {
  const moves = openingGame(line).moves
  const firstMove =
    side === 'w' ? `1.${moves[0]!.san}${moves[1] ? ` ${moves[1].san}` : ''}` : `vs 1.${moves[0]!.san}`
  return (
    <span className="learn-move-badge">
      {side === 'w' ? 'White' : 'Black'} · {firstMove}
    </span>
  )
}

function RemoveOpeningDialog({
  opening,
  onClose,
  onConfirm,
}: {
  opening: Saved & { name: string }
  onClose: () => void
  onConfirm: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current!
    if (!dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog ref={ref} className="engine-dialog" aria-labelledby="remove-opening-title" onClose={onClose}>
      <h2 id="remove-opening-title">Remove {opening.name} from your repertoire?</h2>
      <p className="muted">
        Remove the {opening.side === 'w' ? 'White' : 'Black'} line. Your practice progress will be kept.
      </p>
      <div className="dialog-actions">
        <button type="button" className="ghost" autoFocus onClick={() => ref.current?.close()}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            onConfirm()
            ref.current?.close()
          }}
        >
          Remove
        </button>
      </div>
    </dialog>
  )
}

function RepertoireStar({
  name,
  side,
  saved,
  disabled,
  onClick,
}: {
  name: string
  side: Side
  saved: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="icon learn-star"
      aria-label={`${name} as ${side === 'w' ? 'White' : 'Black'} in repertoire`}
      aria-pressed={saved}
      title={saved ? 'Remove from repertoire' : 'Add to repertoire'}
      disabled={disabled}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 24 24"
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m12 2.5 2.9 5.9 6.5 1-4.7 4.5 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.5 6.5-1L12 2.5Z" />
      </svg>
    </button>
  )
}

function OpeningPieceIcon({ move, side }: { move: string; side: Side }) {
  return (
    <span
      className="learn-card-icon"
      role="img"
      aria-label={`First ${side === 'w' ? 'white' : 'black'} piece in an example: ${PIECE_NAMES[move[0]!]} (${move})`}
    >
      <OpeningPiece piece={move[0]!} />
    </span>
  )
}

function OpeningPiece({ piece }: { piece: string }) {
  const paths: Record<string, string> = {
    K: 'M12 2v5m-2.5-2.5h5M7 20h10l-1-3 2-6c.5-2-1-3.5-3-3.5-1.3 0-2.3.8-3 2-.7-1.2-1.7-2-3-2-2 0-3.5 1.5-3 3.5l2 6-1 3Zm-1 0h12v2H6z',
    Q: 'M5 19 3 8l5 4 4-7 4 7 5-4-2 11H5Zm-1 0h16v3H4z',
    R: 'M6 3v4h3V3h6v4h3V3h3v7l-2 2v7H5v-7l-2-2V3h3ZM4 19h16v3H4z',
    B: 'M12 3c-1.5 2-4 4.5-4 7a4 4 0 0 0 8 0c0-2.5-2.5-5-4-7Zm2 5-3 3m-1 3-2 5h8l-2-5M6 19h12v3H6z',
    N: 'M5 19c0-4 2-6 5-8L8 9l2-4 3 1 2-3 2 4c2 2 3 5 3 12H5Zm-1 0h17v3H4zM14 9h.01',
  }
  const path = paths[piece]
  if (!path) throw new Error(`Unknown opening piece: ${piece}`)
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

function OpeningBoard({
  line,
  side,
  level: savedLevel,
  levelError,
  onLevelChange,
  onComplete,
  onAdvance,
}: {
  line: OpeningLine
  side: Side
  level: LevelProgress | undefined
  levelError: boolean
  onLevelChange: (id: string, side: Side, level: TrainingLevel, mastered: boolean) => boolean
  onComplete: (id: string, side: Side, correct: number, total: number) => void
  onAdvance: (id: string, side: Side, done: number, total: number) => void
}) {
  const game = useMemo(() => openingGame(line), [line])
  const squares = BOARDS[usePrefs().board]
  const level = savedLevel?.level ?? 0
  const [phase, setPhase] = useState<'ready' | 'playing' | 'result'>('ready')
  const [result, setResult] = useState('')
  const [ply, setPly] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [wrong, setWrong] = useState<{ fen: string; uci: string } | null>(null)
  const [attempt, setAttempt] = useState<'wrong' | null>(null)
  const [missedPlies, setMissedPlies] = useState<number[]>([])
  const total = game.moves.filter((move) => move.color === side).length
  const finished = ply >= game.moves.length
  const opponentTurn = phase === 'playing' && level > 0 && !finished && game.moves[ply]?.color !== side
  const canPlay = phase === 'playing' && level > 0 && !finished && !opponentTurn && !wrong
  const fen = wrong?.fen ?? game.fens[ply]!
  const last = wrong?.uci ?? game.moves[ply - 1]?.uci
  const dots = canPlay && picked ? targets(fen, picked) : []
  const hint = canPlay && level < 3 ? game.moves[ply]!.uci : undefined
  const arrows =
    hint && level === 1
      ? [{ startSquare: hint.slice(0, 2), endSquare: hint.slice(2, 4), color: '#2E8B62' }]
      : []

  const finishPractice = useCallback(() => {
    onComplete(line.id, side, total - missedPlies.length, total)
    const nextLevel: TrainingLevel =
      missedPlies.length > 0 ? (level === 1 ? 0 : level === 2 ? 1 : 2) : level === 1 ? 2 : 3
    const mastered = level === 3 && missedPlies.length === 0
    if (onLevelChange(line.id, side, nextLevel, mastered)) {
      setResult(
        mastered
          ? 'Line mastered! You can practice level 3 again.'
          : missedPlies.length > 0
            ? `Attempt complete with mistakes. Return to level ${nextLevel}.`
            : `Level ${level} complete! Continue to level ${nextLevel}.`,
      )
    } else {
      setResult('Your attempt finished, but the training level could not be saved.')
    }
    setPhase('result')
  }, [level, line.id, missedPlies, onComplete, onLevelChange, side, total])

  useEffect(() => {
    if (phase !== 'playing' || level !== 0 || finished) return
    const timer = window.setTimeout(() => {
      if (ply + 1 === game.moves.length) {
        const saved = onLevelChange(line.id, side, 1, false)
        setResult(
          saved
            ? 'Line viewed! Continue to level 1.'
            : 'The line finished, but the training level could not be saved.',
        )
        setPhase('result')
      }
      setPly((current) => current + 1)
    }, 650)
    return () => window.clearTimeout(timer)
  }, [phase, level, finished, ply, game.moves.length, onLevelChange, line.id, side])

  useEffect(() => {
    if (!opponentTurn || wrong) return
    const timer = window.setTimeout(() => {
      if (ply + 1 === game.moves.length) finishPractice()
      setPly((current) => current + 1)
    }, 650)
    return () => window.clearTimeout(timer)
  }, [opponentTurn, wrong, ply, game.moves.length, finishPractice])

  useEffect(() => {
    if (!wrong) return
    const timer = window.setTimeout(() => setWrong(null), 700)
    return () => window.clearTimeout(timer)
  }, [wrong])

  const tryMove = (from: string, to: string) => {
    if (!canPlay) return false
    const expected = game.moves[ply]!
    const promotion = expected.uci.slice(0, 4) === from + to ? expected.uci[4] : undefined
    const next = play(explore(fen), from, to, promotion)
    if (!next) return false
    const uci = next.moves[0]!
    setPicked(null)
    if (uci === expected.uci) {
      setAttempt(null)
      const done = game.moves.slice(0, ply + 1).filter((move) => move.color === side).length
      onAdvance(line.id, side, done, total)
      if (ply + 1 === game.moves.length) finishPractice()
      setPly(ply + 1)
    } else {
      setAttempt('wrong')
      setMissedPlies((missed) => (missed.includes(ply) ? missed : [...missed, ply]))
      setWrong({ fen: fenOf(next), uci })
    }
    return true
  }

  return (
    <>
      <div className="learn-level" aria-label="Training level">
        <div>
          <strong>Level {level} of 3</strong>
          <span>
            {
              ['View the line', 'Practice with arrows', 'Practice with piece hints', 'Play independently'][
                level
              ]
            }
          </span>
        </div>
        {savedLevel?.mastered && <span className="pill">Mastered</span>}
        <progress max={3} value={level} aria-label="Training level progress" />
      </div>
      <div className="stage train-stage">
        <section className="boardcol" aria-label="Opening board">
          <div
            className="board"
            role="group"
            aria-label={`Board, ${fen.split(' ')[1] === 'w' ? 'White' : 'Black'} to move`}
          >
            <div>
              <VisibleChessboard
                active
                options={{
                  position: fen,
                  boardOrientation: side === 'w' ? 'white' : 'black',
                  pieces: NAMED_PIECES,
                  allowDragging: canPlay,
                  dropSquareStyle: { boxShadow: 'none' },
                  animationDurationInMs: reducedMotion() ? 0 : 160,
                  lightSquareStyle: { backgroundColor: squares.light },
                  darkSquareStyle: { backgroundColor: squares.dark },
                  onPieceDrag: ({ piece, square }) => setPicked(piece.pieceType[0] === side ? square : null),
                  onPieceDragCancel: () => setPicked(null),
                  onPieceDrop: ({ sourceSquare, targetSquare }) =>
                    targetSquare !== null && tryMove(sourceSquare, targetSquare),
                  onSquareClick: ({ piece, square }) => {
                    if (!canPlay) return
                    if (picked && dots.includes(square) && tryMove(picked, square)) return
                    setPicked(piece?.pieceType[0] === side && square !== picked ? square : null)
                  },
                  arrows,
                  squareRenderer: ({ piece, square, children }) => {
                    const highlighted =
                      last?.slice(0, 2) === square || last?.slice(2, 4) === square || picked === square
                    const target = dots.includes(square)
                    return (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          position: 'relative',
                          backgroundColor: highlighted
                            ? isLight(square)
                              ? squares.hlLight
                              : squares.hlDark
                            : undefined,
                        }}
                      >
                        {children}
                        {hint?.slice(0, 2) === square && level === 2 && (
                          <span className="learn-piece-hint" aria-hidden="true" />
                        )}
                        {target && (
                          <LegalMoveMarker capture={!!piece && piece.pieceType[0] !== side} hovered={false} />
                        )}
                        {wrong?.uci.slice(2, 4) === square && (
                          <span className="wrong-move-marker" role="img" aria-label="Incorrect move">
                            ×
                          </span>
                        )}
                      </div>
                    )
                  },
                }}
              />
            </div>
          </div>
        </section>
        <div className="stage-side train-panel">
          {level === 0 ? (
            <>
              <h3>View the line</h3>
              <p className="muted">
                Watch the moves play automatically, or step through them before starting.
              </p>
              <div className="learn-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={phase === 'playing' || ply === 0}
                  onClick={() => setPly(ply - 1)}
                >
                  Previous move
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={phase === 'playing' || finished}
                  onClick={() => setPly(ply + 1)}
                >
                  Next move
                </button>
              </div>
              <div className="learn-moves" aria-label="Opening moves">
                {game.moves.map((move, index) => (
                  <button
                    key={move.ply}
                    type="button"
                    disabled={phase === 'playing'}
                    aria-current={ply === index + 1 ? 'step' : undefined}
                    onClick={() => setPly(index + 1)}
                  >
                    {move.color === 'w' ? `${move.number}. ` : ''}
                    {move.san}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h3>Practice as {side === 'w' ? 'White' : 'Black'}</h3>
              {phase === 'playing' && (
                <p role="status">
                  {opponentTurn
                    ? 'Opponent plays…'
                    : attempt === 'wrong'
                      ? 'Incorrect move. Try again.'
                      : 'Your move.'}
                </p>
              )}
              {hint && (
                <p className="muted">
                  {level === 1
                    ? `Hint: ${hint.slice(0, 2)} to ${hint.slice(2, 4)}.`
                    : `Hint: move the piece on ${hint.slice(0, 2)}.`}
                </p>
              )}
              <p className="muted">
                {ply} of {game.moves.length} moves played
              </p>
              <progress max={game.moves.length} value={ply} aria-label="Practice progress" />
              {total === 0 && (
                <p role="status">
                  This line has no moves for {side === 'w' ? 'White' : 'Black'}. Choose another side or line.
                </p>
              )}
            </>
          )}
          {phase === 'result' && <p role="status">{result}</p>}
          {phase !== 'playing' ? (
            <button
              type="button"
              className="cta"
              disabled={levelError || (level > 0 && total === 0)}
              onClick={() => {
                setPly(0)
                setPicked(null)
                setWrong(null)
                setAttempt(null)
                setMissedPlies([])
                setResult('')
                setPhase('playing')
              }}
            >
              {level === 0 ? 'Start playback' : `Start level ${level}`}
            </button>
          ) : level > 0 ? (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setPly(0)
                setPicked(null)
                setWrong(null)
                setAttempt(null)
                setMissedPlies([])
                setPhase('ready')
              }}
            >
              Restart
            </button>
          ) : null}
        </div>
      </div>
    </>
  )
}
