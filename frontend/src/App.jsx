import { useState } from 'react'
import { FixturesBrowser } from './components/FixturesBrowser.jsx'
import { LiveScoreList } from './components/LiveScoreList.jsx'
import { MatchCenter } from './components/MatchCenter.jsx'
import './App.css'

function App() {
  const [selectedMatchId, setSelectedMatchId] = useState(null)

  // Full-page swap: when a match is selected, show MatchCenter instead of home view.
  // Both views share the sticky app-header for consistent branding.
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-logo">⚽ LiveFooty</span>
      </header>

      {selectedMatchId != null ? (
        /* ── Match Center view ── */
        <div className="app-content">
          <MatchCenter
            fixtureId={selectedMatchId}
            onBack={() => setSelectedMatchId(null)}
          />
        </div>
      ) : (
        /* ── Home view ── */
        <div className="app-content">
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
