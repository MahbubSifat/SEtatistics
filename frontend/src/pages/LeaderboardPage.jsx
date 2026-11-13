import { useEffect, useState     
} from 'react'
import { getLeaderboard } from '../api/leaderboard'
import PeriodTabs from '../features/leaderboard/PeriodTabs'
import LeaderboardTable from '../features/leaderboard/LeaderboardTable'
import { PERIODS } from '../features/leaderboard/periods'
import '../features/leaderboard/leaderboard.css'
import { useSync } from '../context/SyncContext'

export default function LeaderboardPage() {
    const { version } = useSync()
    const [period, setPeriod] = useState('last-week')
  const [attempt, setAttempt] = useState(0) // "Try again" এর জন্য
  const [state, setState] = useState({ status: 'loading', rows: [], error: '' })

  useEffect(() => {
    let ignore = false // দ্রুত tab বদলালে পুরোনো response বাদ দিতে
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    getLeaderboard(period)
      .then((data) => {
        if (!ignore) setState({ status: 'ready', rows: data.rows, error: '' })
      })
      .catch((err) => {
        if (!ignore) setState({ status: 'error', rows: [], error: err.message })
      })
    return () => {
      ignore = true
    }
   }, [period, attempt, version])

  const meta = PERIODS.find((p) => p.value === period)
  const allZero =
    state.status === 'ready' &&
    period !== 'all-time' &&
    state.rows.length > 0 &&
    state.rows.every((r) => r.period_solved === 0)

  return (
    <main>
      <section className="lb-hero">
        <div className="container">
          <p className="lb-hero__eyebrow">LEADERBOARD · {meta.label.toUpperCase()}</p>
          <h1 className="lb-hero__title">Who solved the most?</h1>
          <p className="lb-hero__sub">
            Ranked by problems solved in the selected period. Ties are broken by total solved.
          </p>
        </div>
      </section>

      <div className="container lb-body">
        <PeriodTabs value={period} onChange={setPeriod} />

        {allZero && (
          <p className="lb-note">
            No solves recorded in this period yet. Day, week and month counts grow after each new sync.
          </p>
        )}

        <LeaderboardTable
          status={state.status}
          rows={state.rows}
          error={state.error}
          periodColumn={meta.column}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    </main>
  )
}