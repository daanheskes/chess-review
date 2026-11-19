import type { PuzzlePerspective } from '@chessreview/core'
import { Suspense, lazy, useEffect, useState } from 'react'
import { Home } from './Home'
import { applyUpdate, useUpdateReady } from './offline'
import { ReviewPage } from './Review'

// Insights is a page of its own, loaded only when opened.
const InsightsPage = lazy(() => import('./Insights').then((m) => ({ default: m.InsightsPage })))
const TrainPage = lazy(() => import('./Train').then((m) => ({ default: m.TrainPage })))
const LearnPage = lazy(() => import('./Learn').then((m) => ({ default: m.LearnPage })))

// Routes live in the hash so a reload keeps you on the same review:
//   #/                      game list
//   #/review/<id>?u=<name>  one review (u = whose games you were browsing)
//   #/insights              statistics across every stored review
//   #/train[?tab=mistakes&tactic=<kind>&p=<side>&u=<name>]  puzzles or recent mistake positions
//   #/openings[/<opening>[/<line>]]  study and practice opening lines
function parse(hash: string) {
  const m = hash.match(/^#\/review\/([a-f0-9]+)(?:\?u=(.*))?$/)
  return m && m[1] ? { id: m[1], me: m[2] ? decodeURIComponent(m[2]) : null } : null
}

/** What a `#/train?tactic=<kind>&p=<side>&u=<name>` link asks for: one tactic (null for all puzzles), which side of it, and whose. */
function trainFocus(hash: string): {
  tab: 'puzzles' | 'mistakes'
  tactic: string | null
  perspective: PuzzlePerspective | null
  player: string | null
} {
  const q = new URLSearchParams(hash.split('?')[1] ?? '')
  const side = q.get('p')
  return {
    tab: q.get('tab') === 'mistakes' ? 'mistakes' : 'puzzles',
    tactic: q.get('tactic') || null,
    perspective: q.get('tactic') && (side === 'allowed' || side === 'missed') ? side : null,
    player: q.get('u') || null,
  }
}

export function App({ lichessLoginError = null }: { lichessLoginError?: string | null }) {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  const updateReady = useUpdateReady()
  const route = parse(hash)
  return (
    <>
      {lichessLoginError && (
        <p className="error" role="alert">
          {lichessLoginError}
        </p>
      )}
      {updateReady && (
        <p className="update" role="status">
          A new version of chessreview is ready.{' '}
          <button className="ghost" onClick={applyUpdate}>
            Reload
          </button>
        </p>
      )}
      {hash === '#/insights' ? (
        <Suspense fallback={null}>
          <InsightsPage />
        </Suspense>
      ) : hash === '#/train' || hash.startsWith('#/train?') ? (
        <Suspense fallback={null}>
          <TrainPage {...trainFocus(hash)} />
        </Suspense>
      ) : hash === '#/openings' ||
        hash.startsWith('#/openings/') ||
        (!hash && location.pathname.endsWith('/openings')) ? (
        <Suspense fallback={null}>
          <LearnPage
            hash={hash}
            navigate={(next) => {
              location.hash = next
              setHash(location.hash)
            }}
          />
        </Suspense>
      ) : route ? (
        <ReviewPage id={route.id} me={route.me} />
      ) : (
        <Home />
      )}
    </>
  )
}

export function openReview(id: string, me: string | null) {
  location.hash = `#/review/${id}${me ? `?u=${encodeURIComponent(me)}` : ''}`
}
