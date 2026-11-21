import { useEffect, useState } from 'react'
import { getLeaderboard } from '../api/leaderboard'
import { getSummary } from '../api/dashboard'
import { useSync } from '../context/SyncContext'
import useCountUp from '../hooks/useCountUp'
import Segmented from '../components/ui/Segmented'
import Pagination from '../components/ui/Pagination'
import StandingsTable from '../features/dashboard/StandingsTable'
import { PERIODS } from '../features/leaderboard/periods'
import { PLATFORMS } from '../features/shared/platforms'
import '../features/dashboard/dashboard.css'

const PAGE_SIZE = 20
const PERIOD_OPTIONS = PERIODS.map((p) => ({ value: p.value, label: p.label }))
const MODE_OPTIONS = [
  { value: 'solved', label: 'Solved' },
  { value: 'rank', label: 'Rank' },
]
const RANK_BY = [{ value: 'all', label: 'Overall' }, ...PLATFORMS.map((p) => ({ value: p.key, label: p.name }))]

function Stat({ label, value }) {
  const n = useCountUp(value)
  return (
    <div className="dash__stat">
      <dd className="num">{value == null ? '—' : n.toLocaleString('en-US')}</dd>
      <dt>{label}</dt>
    </div>
  )
}

export default function DashboardPage() {
  const { version, running, status: sync } = useSync()
  const [period, setPeriod] = useState('all-time')
  const [mode, setMode] = useState('solved')
  const [rankBy, setRankBy] = useState('all')
  const [page, setPage] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [board, setBoard] = useState({ status: 'loading', rows: [], asOf: null, error: '' })
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let ignore = false
    setBoard((b) => ({ ...b, status: 'loading', error: '' }))
    const options = mode === 'rank' ? { sort: 'rating', platform: rankBy } : {}
    getLeaderboard(period, options)
      .then((data) => {
        if (!ignore) setBoard({ status: 'ready', rows: data.rows, asOf: data.as_of_day, error: '' })
      })
      .catch((err) => {
        if (!ignore) setBoard({ status: 'error', rows: [], asOf: null, error: err.message })
      })
    return () => {
      ignore = true
    }
  }, [period, mode, rankBy, attempt, version])

  useEffect(() => {
    let ignore = false
    getSummary()
      .then((data) => {
        if (!ignore) setSummary(data)
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [attempt, version])

  const total = board.rows.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = board.rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const meta = PERIODS.find((p) => p.value === period)

  const lastSynced = sync?.finished_at
  const syncLine =
    (running ? 'Sync in progress…' : lastSynced ? `Last synced ${lastSynced} · Dhaka time` : 'Not synced since the server started') +
    (period === 'this-day' && board.asOf ? ` · This Day = ${board.asOf}` : '')

  const ctx = { mode, period, periodColumn: meta.column }
  const rankByName = RANK_BY.find((o) => o.value === rankBy)?.label

  return (
    <main className="dash container container--wide">
      <header className="dash__head">
        <div>
          <h1 className="dash__title">Leaderboard</h1>
          <p className="dash__sub num">{syncLine}</p>
        </div>
        <dl className="dash__stats">
          <Stat label="Students" value={summary?.total_students} />
          <Stat label="Solved" value={summary?.total_solved} />
          <Stat label="Today" value={summary?.today_solved} />
        </dl>
      </header>

      <div className="dash__toolbar">
        <Segmented
          label="Time period"
          options={PERIOD_OPTIONS}
          value={period}
          onChange={(v) => {
            setPeriod(v)
            setPage(0)
          }}
        />
        <div className="dash__tools">
          {mode === 'rank' && (
            <Segmented
              label="Rank by"
              options={RANK_BY}
              value={rankBy}
              onChange={(v) => {
                setRankBy(v)
                setPage(0)
              }}
            />
          )}
          <Segmented
            label="Show values as"
            options={MODE_OPTIONS}
            value={mode}
            onChange={(v) => {
              setMode(v)
              setPage(0)
            }}
          />
        </div>
      </div>

      {mode === 'rank' && (
        <p className="dash__note">
          Contest ratings from each platform. Ordered by {rankBy === 'all' ? 'total problems solved' : `${rankByName} rating`}.
        </p>
      )}

      <StandingsTable
        status={board.status}
        rows={pageRows}
        error={board.error}
        ctx={ctx}
        onRetry={() => setAttempt((n) => n + 1)}
      />

      {total > 0 && <Pagination page={safePage} pageSize={PAGE_SIZE} total={total} onChange={setPage} />}
    </main>
  )
}