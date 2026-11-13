import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getStudentStatistics } from '../api/students'
import { useSync } from '../context/SyncContext'
import useCountUp from '../hooks/useCountUp'
import Button from '../components/ui/Button'
import '../features/leaderboard/leaderboard.css'
import './StudentDetailPage.css'

const PERIODS = [
  { key: 'last-day', label: 'Today' },
  { key: 'last-week', label: 'Last 7 days' },
  { key: 'last-month', label: 'Last 30 days' },
  { key: 'all-time', label: 'All time' },
]

const PLATFORMS = [
  { key: 'codeforces', name: 'Codeforces' },
  { key: 'leetcode', name: 'LeetCode' },
  { key: 'codechef', name: 'CodeChef' },
  { key: 'beecrowd', name: 'beecrowd', unsynced: true },
]

function PeriodStat({ label, value }) {
  const counted = useCountUp(value)
  return (
    <div className="sd-stat">
      <span className="sd-stat__value">{counted.toLocaleString('en-US')}</span>
      <span className="sd-stat__label">{label}</span>
    </div>
  )
}

export default function StudentDetailPage() {
  const { id } = useParams()
  const { version } = useSync()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ status: 'loading', data: null, error: '' })

  useEffect(() => {
    let ignore = false
    // একই student এর data থাকলে সেটাই দেখাই (sync এর পর নতুনটা এলে বদলে যাবে)
    setState((s) =>
      s.data && String(s.data.student.id) === id ? s : { status: 'loading', data: null, error: '' },
    )
    getStudentStatistics(id)
      .then((data) => {
        if (!ignore) setState({ status: 'ready', data, error: '' })
      })
      .catch((err) => {
        if (!ignore) {
          setState({ status: err.status === 404 ? 'missing' : 'error', data: null, error: err.message })
        }
      })
    return () => {
      ignore = true
    }
  }, [id, version, attempt])

  const { status, data, error } = state
  const student = data?.student
  const platformMax = data ? Math.max(1, ...PLATFORMS.map((p) => data.by_platform[p.key] ?? 0)) : 1
  const total = useCountUp(data?.total_solved)

  return (
    <main>
      <section className="lb-hero sd-hero">
        <div className="container">
          <Link to="/students" className="sd-back">← Students</Link>

          {status === 'ready' && (
            <>
              <p className="lb-hero__eyebrow">
                {student.student_id} · BATCH {student.batch}
              </p>
              <h1 className="lb-hero__title">{student.name}</h1>
              <div className="sd-total">
                <span className="sd-total__value">{total.toLocaleString('en-US')}</span>
                <span className="sd-total__label">problems solved in total</span>
              </div>
            </>
          )}

          {status === 'loading' && <h1 className="lb-hero__title">Loading…</h1>}
          {status === 'missing' && <h1 className="lb-hero__title">Student not found</h1>}
          {status === 'error' && <h1 className="lb-hero__title">Something went wrong</h1>}
        </div>
      </section>

      <div className="container sd-body">
        {status === 'error' && (
          <div className="lb-state" role="alert">
            <p>{error}</p>
            <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
          </div>
        )}

        {status === 'missing' && (
          <div className="lb-state">
            <p>This student does not exist, or was deleted.</p>
            <Link to="/students" className="row-link">Back to students</Link>
          </div>
        )}

        {status === 'ready' && (
          <>
            <div className="sd-periods">
              {PERIODS.map((p) => (
                <PeriodStat key={p.key} label={p.label} value={data.periods[p.key] ?? 0} />
              ))}
            </div>

            {data.total_solved === 0 && (
              <p className="lb-note">
                No solved problems recorded yet. Make sure platform usernames are set, then run Sync.
              </p>
            )}

            <h2 className="sd-h2">By platform</h2>
            <ul className="sd-platforms">
              {PLATFORMS.map((p, i) => {
                const n = data.by_platform[p.key] ?? 0
                return (
                  <li key={p.key} className={`sd-platform${p.unsynced ? ' sd-platform--muted' : ''}`}>
                    <span className="sd-platform__name">{p.name}</span>
                    <span className="sd-platform__track" aria-hidden="true">
                      <span className="sd-platform__fill" style={{ '--w': `${(n / platformMax) * 100}%`, '--i': i }} />
                    </span>
                    <span className="sd-platform__num">{p.unsynced ? '—' : n}</span>
                  </li>
                )
              })}
            </ul>
            <p className="lb-legend">beecrowd usernames are saved, but beecrowd is not synced yet.</p>
          </>
        )}
      </div>
    </main>
  )
}