import { usePoll } from './api/poll.js'
import './App.css'

function App() {
  const { data, lastUpdatedAt, error, loading } = usePoll('/api/live', 20000)

  const matchCount = Array.isArray(data) ? data.length : null

  return (
    <div style={{ fontFamily: 'monospace', padding: '1rem' }}>
      <h1>Football Live — polling /api/live every 20s</h1>
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}
      {lastUpdatedAt && (
        <p>Last updated: {new Date(lastUpdatedAt).toISOString()}</p>
      )}
      {matchCount !== null && <p>Live matches: {matchCount}</p>}
      {data && (
        <pre style={{ fontSize: '0.75rem', overflowX: 'auto' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default App
