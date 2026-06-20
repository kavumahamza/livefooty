import { useState, useMemo } from 'react'
import { usePoll } from './api/poll.js'
import { buildCompetitions } from './components/competitions.js'
import { FixturesBrowser } from './components/FixturesBrowser.jsx'
import { LiveScoreList } from './components/LiveScoreList.jsx'
import { MatchCenter } from './components/MatchCenter.jsx'
import { CompetitionsNav } from './components/CompetitionsNav.jsx'
import './App.css'

function App() {
  const [selectedMatchId, setSelectedMatchId] = useState(null)
  const [selectedLeagueId, setSelectedLeagueId] = useState(null)

  // Full (unfiltered) fixtures poll — used to build the competitions nav.
  // Separate from FixturesBrowser's own filtered poll.
  const { data: navData, loading: navLoading } = usePoll('/api/fixtures', 30000)

  const competitions = useMemo(
    () => buildCompetitions(navData?.fixtures),
    [navData?.fixtures]
  )

  // Derive the selected league name for the section header
  const selectedLeagueName = useMemo(() => {
    if (selectedLeagueId == null) return null
    const all = [...(competitions.featured), ...(competitions.others)]
    return all.find((c) => c.league_id === selectedLeagueId)?.league ?? null
  }, [selectedLeagueId, competitions])

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-wordmark">
          <span className="app-wordmark-icon" aria-hidden="true">&#x26BD;</span>
          <span className="app-wordmark-text">LiveFooty</span>
        </span>
        <span className="app-header-live" aria-hidden="true">
          <span className="live-dot" />
          Live
        </span>
      </header>

      {selectedMatchId != null ? (
        /* ── Match Center view (no sidebar) ── */
        <div className="app-content app-view">
          <MatchCenter
            fixtureId={selectedMatchId}
            onBack={() => setSelectedMatchId(null)}
          />
        </div>
      ) : (
        /* ── Home view with competitions nav ── */
        <div className="app-home-layout">
          {/* Competitions nav: sidebar on desktop, chip rail on mobile */}
          <CompetitionsNav
            competitions={competitions}
            selectedLeagueId={selectedLeagueId}
            onSelect={setSelectedLeagueId}
            loading={navLoading && navData == null}
          />

          {/* Main content column */}
          <div className="app-content app-view">
            {/* Live Now section — polls /api/live every 20s */}
            <LiveScoreList
              onSelectMatch={setSelectedMatchId}
              selectedLeagueId={selectedLeagueId}
            />

            <div className="app-section-divider" aria-hidden="true" />

            <div className="app-section-label">
              {selectedLeagueName ? selectedLeagueName : 'All Fixtures'}
            </div>
            <FixturesBrowser
              onSelectMatch={setSelectedMatchId}
              leagueFilter={selectedLeagueId}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
