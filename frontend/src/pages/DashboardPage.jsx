import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSummary } from '../api/dashboard'
import { useSync } from '../context/SyncContext'
import useCountUp from '../hooks/useCountUp'
import LeaderboardTable from '../features/leaderboard/LeaderboardTable'
import '../features/leaderboard/leaderboard.css'
import './DashboardPage.css'

function Figure({ label, value, index, gold }) {
  const counted = useCountUp(value)
  return (
    <div className={`dash-figure${gold ? ' dash-figure--gold' : ''}`} style={{ '--i': index }}>
      <span className="dash-figure__value">{value == null ? '—' : counted.toLocaleString('en-US')}</span>
      <span className="dash-figure__label">{label}</span>
    </div>
  )
}

// BR-08: তারিখ Dhaka সময়ে
const today = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Dhaka',
}).format(new Date())

export default function DashboardPage() {
  const { version, running, status: sync } = useSync()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ status: 'loading', data: null, error: '' })

  useEffect(() => {
    let ignore = false
    // আগের data থাকলে সেটা দেখাতে থাকি, নতুন এলে বদলে দিই
    setState((s) => (s.data ? s : { ...s, status: 'loading', error: '' }))
    getSummary()
      .then((data) => {
        if (!ignore) setState({ status: 'ready', data, error: '' })
      })
      .catch((err) => {
        if (!ignore) setState((s) => ({ ...s, status: s.data ? 'ready' : 'error', error: err.message }))
      })
    return () => {
      ignore = true
    }
  }, [version, attempt])

  const d = state.data
  const lastSynced = sync?.finished_at
  const syncLine = running
    ? 'Sync in progress…'
    : lastSynced
      ? `Last synced ${lastSynced} (Dhaka time)`
      : 'Not synced since the server started'

  return (
    <main>
      <section className="lb-hero dash-hero">
        <div className="container">
          <p className="lb-hero__eyebrow">OVERVIEW · {today.toUpperCase()}</p>
          <h1 className="lb-hero__title">The department, at a glance.</h1>

          <div className="dash-figures">
            <Figure index={0} label="Registered students" value={d?.total_students} />
            <Figure index={1} label="Problems solved" value={d?.total_solved} />
            <Figure index={2} label="Solved today" value={d?.today_solved} gold />
          </div>

          <p className="dash-sync">{syncLine}</p>
        </div>
      </section>

      <div className="container dash-body">
        <div className="dash-head">
          <h2>Top 10 · all time</h2>
          <Link to="/leaderboard" className="dash-link">Full leaderboard →</Link>
        </div>

        <LeaderboardTable
          status={state.status}
          rows={d?.leaderboard ?? []}
          error={state.error}
          periodColumn="All time"
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    </main>
  )
}