import { useEffect, useMemo, useState } from 'react'
import { getLeaderboard } from '../api/leaderboard'
import { getSummary } from '../api/dashboard'
import { listStudents } from '../api/students'
import { useSync } from '../context/SyncContext'
import useCountUp from '../hooks/useCountUp'
import useCodeforcesRatings from '../hooks/useCodeforcesRatings'
import Segmented from '../components/ui/Segmented'
import Pagination from '../components/ui/Pagination'
import StandingsTable from '../features/dashboard/StandingsTable'
import { PERIODS } from '../features/leaderboard/periods'
import '../features/dashboard/dashboard.css'

const PAGE_SIZE = 20
const PERIOD_OPTIONS = PERIODS.map((p) => ({ value: p.value, label: p.label }))
const MODE_OPTIONS = [
  { value: 'solved', label: 'Solved' },
  { value: 'rank', label: 'Rank' },
]

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
  const [page, setPage] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [board, setBoard] = useState({ status: 'loading', rows: [], error: '' })
  const [summary, setSummary] = useState(null)
  const [students, setStudents] = useState(null)

  useEffect(() => {
    let ignore = false
    setBoard((b) => ({ ...b, status: 'loading', error: '' }))
    getLeaderboard(period)
      .then((data) => {
        if (!ignore) setBoard({ status: 'ready', rows: data.rows, error: '' })
      })
      .catch((err) => {
        if (!ignore) setBoard({ status: 'error', rows: [], error: err.message })
      })
    return () => {
      ignore = true
    }
  }, [period, attempt, version])

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

  // Rank mode এ Codeforces username লাগে (students list থেকে, একবারই আনি)
  useEffect(() => {
    if (mode !== 'rank' || students !== null) return undefined
    let ignore = false
    listStudents()
      .then((rows) => {
        if (!ignore) setStudents(rows)
      })
      .catch(() => {
        if (!ignore) setStudents([])
      })
    return () => {
      ignore = true
    }
  }, [mode, students])

  const total = board.rows.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = board.rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const meta = PERIODS.find((p) => p.value === period)

  const handleById = useMemo(
    () => Object.fromEntries((students ?? []).map((s) => [s.id, s.codeforces_id || ''])),
    [students],
  )
  const handles = mode === 'rank' ? pageRows.map((r) => handleById[r.id]).filter(Boolean) : []
  const cf = useCodeforcesRatings(handles, mode === 'rank' && students !== null)
  const ratingsStatus = mode === 'rank' && students === null ? 'loading' : cf.status === 'idle' ? 'ready' : cf.status

  const hasPeriod = board.rows.some((r) => r.period_by_platform)
  const scopeLabel = period === 'all-time' || !hasPeriod ? 'All time' : meta.column

  const lastSynced = sync?.finished_at
  const syncLine = running
    ? 'Sync in progress…'
    : lastSynced
      ? `Last synced ${lastSynced} · Dhaka time`
      : 'Not synced since the server started'

  const ctx = {
    mode,
    period,
    periodColumn: meta.column,
    scopeLabel,
    hasPeriod,
    handleById,
    ratings: cf.data,
    ratingsStatus,
  }

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
        <Segmented label="Show values as" options={MODE_OPTIONS} value={mode} onChange={setMode} />
      </div>

      {mode === 'rank' && (
        <p className="dash__note">
          Contest performance comes from Codeforces (rating and title). LeetCode, CodeChef and Beecrowd ratings need backend support.
          {cf.status === 'error' && ` Could not load Codeforces data: ${cf.error}.`}
        </p>
      )}
      {mode === 'solved' && period !== 'all-time' && !hasPeriod && (
        <p className="dash__note">
          Platform columns show all-time totals. Platform-wise counts for this period need backend support.
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