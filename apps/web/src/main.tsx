import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/schibsted-grotesk'
import './prefs'
import './styles.css'
import { App } from './App'
import { registerServiceWorker } from './offline'
import { getPrefs, setPrefs } from './prefs'
import { fullEngine } from './services'

// The browser may have cleared the downloaded engine: fall back to the standard one rather than fail.
if (getPrefs().engine === 'accurate') {
  void (fullEngine?.installed() ?? Promise.resolve(false)).then(
    (ok) => ok || setPrefs({ engine: 'standard' }),
  )
}

async function start(): Promise<void> {
  let lichessLoginError: string | null = null
  try {
    const { finishLichessLogin } = await import('./services/lichess-auth')
    await finishLichessLogin()
  } catch (error) {
    lichessLoginError = error instanceof Error ? error.message : 'Lichess login failed.'
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App lichessLoginError={lichessLoginError} />
    </StrictMode>,
  )

  registerServiceWorker()
}

void start()
