import { useState } from 'react'
import { FixturesBrowser } from './components/FixturesBrowser.jsx'
import { LiveScoreList } from './components/LiveScoreList.jsx'
import { MatchCenter } from './components/MatchCenter.jsx'
import './App.css'

function App() {
  const [selectedMatchId, setSelectedMatchId] = useState(null)

  // Full-page swap: when a match is selected, show MatchCenter.
  // Both views share the sticky broadcast header.
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-wordmark" role="img" aria-label="LiveFooty home">
          <span className="app-wordmark-icon" aria-hidden="true">&#x26BD;</span>
          <span className="app-wordmark-text">LiveFooty</span>
        </span>
        <span className="app-header-live" aria-hidden="true">
          <span className="live-dot" />
          Live
        </span>
      </header>

      {selectedMatchId != null ? (
        /* ── Match Center view ── */
        <div className="app-content app-view">
          <MatchCenter
            fixtureId={selectedMatchId}
            onBack={() => setSelectedMatchId(null)}
          />
        </div>
      ) : (
        /* ── Home view ── */
        <div className="app-content app-view">
          {/* Live Now section — polls /api/live every 20s */}
          <LiveScoreList onSelectMatch={setSelectedMatchId} />

          <div className="app-section-divider" aria-hidden="true" />

          <div className="app-section-label">All Fixtures</div>
          <FixturesBrowser onSelectMatch={setSelectedMatchId} />
        </div>
      )}
    </div>
  )
}

export default App
