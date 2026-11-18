import { useEffect, useMemo, useState } from 'react'
import { getLeaderboard } from '../api/leaderboard'
import { getSummary } from '../api/dashboard'
import { useSync } from '../context/SyncContext'
import useCountUp from '../hooks/useCountUp'
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
const PLATFORM_KEYS = ['codeforces', 'leetcode', 'beecrowd', 'codechef']

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

  // Leaderboard: period বদলালে বা sync শেষ হলে আবার আনে
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

  // Summary (মোট ছাত্র, মোট solve, আজকের solve)
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

  // Rank mode: প্রতিটা platform এ সবার মধ্যে অবস্থান
  const ranks = useMemo(() => {
    const out = {}
    board.rows.forEach((r) => {
      out[r.id] = {}
    })
    PLATFORM_KEYS.forEach((key) => {
      const vals = board.rows.map((r) => r.by_platform?.[key] ?? 0)
      board.rows.forEach((r, i) => {
        out[r.id][key] = 1 + vals.filter((v) => v > vals[i]).length
      })
    })
    return out
  }, [board.rows])

  const total = board.rows.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = board.rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const meta = PERIODS.find((p) => p.value === period)

  const lastSynced = sync?.finished_at
  const syncLine = running
    ? 'Sync in progress…'
    : lastSynced
      ? `Last synced ${lastSynced} · Dhaka time`
      : 'Not synced since the server started'

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

      <StandingsTable
        status={board.status}
        rows={pageRows}
        error={board.error}
        period={period}
        periodColumn={meta.column}
        mode={mode}
        ranks={ranks}
        onRetry={() => setAttempt((n) => n + 1)}
      />

      {total > 0 && <Pagination page={safePage} pageSize={PAGE_SIZE} total={total} onChange={setPage} />}
    </main>
  )
}