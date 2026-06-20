import { useState } from 'react'
import { FixturesBrowser } from './components/FixturesBrowser.jsx'
import { LiveScoreList } from './components/LiveScoreList.jsx'
import { MatchCenter } from './components/MatchCenter.jsx'
import './App.css'

function App() {
  const [selectedMatchId, setSelectedMatchId] = useState(null)

  // Full-page swap: when a match is selected, show MatchCenter instead of home view
  if (selectedMatchId != null) {
    return (
      <MatchCenter
        fixtureId={selectedMatchId}
        onBack={() => setSelectedMatchId(null)}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-logo">⚽ Football Live</span>
      </header>

      {/* Live Now section — polls /api/live every 20s */}
      <LiveScoreList onSelectMatch={setSelectedMatchId} />

      {/* Divider */}
      <div className="app-section-divider" aria-hidden="true" />

      {/* All Fixtures browser */}
      <div className="app-section-label">All Fixtures</div>
      <FixturesBrowser onSelectMatch={setSelectedMatchId} />
    </div>
  )
}

export default App
