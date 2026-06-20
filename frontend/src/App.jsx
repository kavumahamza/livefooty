import { useState } from 'react'
import { FixturesBrowser } from './components/FixturesBrowser.jsx'
import './App.css'

function App() {
  // Task 4.5 will wire full routing; for now we just track selected match ID.
  const [selectedMatchId, setSelectedMatchId] = useState(null)

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-logo">⚽ Football Live</span>
        {selectedMatchId && (
          <button
            className="app-back-btn"
            onClick={() => setSelectedMatchId(null)}
            type="button"
          >
            ← Back
          </button>
        )}
      </header>

      {selectedMatchId == null ? (
        <FixturesBrowser onSelectMatch={setSelectedMatchId} />
      ) : (
        <div style={{ padding: '1rem', color: 'var(--muted)' }}>
          Match center for fixture #{selectedMatchId} — coming in Task 4.4.
        </div>
      )}
    </div>
  )
}

export default App
