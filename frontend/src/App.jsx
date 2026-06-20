import { useState } from 'react'
import { FixturesBrowser } from './components/FixturesBrowser.jsx'
import { LiveScoreList } from './components/LiveScoreList.jsx'
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
        <>
          {/* Live Now section — polls /api/live every 20s */}
          <LiveScoreList onSelectMatch={setSelectedMatchId} />

          {/* Divider */}
          <div className="app-section-divider" aria-hidden="true" />

          {/* All Fixtures browser */}
          <div className="app-section-label">All Fixtures</div>
          <FixturesBrowser onSelectMatch={setSelectedMatchId} />
        </>
      ) : (
        <div style={{ padding: '1rem', color: 'var(--muted)' }}>
          Match center for fixture #{selectedMatchId} — coming in Task 4.4.
        </div>
      )}
    </div>
  )
}

export default App
