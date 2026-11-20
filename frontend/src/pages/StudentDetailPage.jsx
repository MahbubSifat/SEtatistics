import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSync } from '../context/SyncContext'
import useCodeforcesRatings from '../hooks/useCodeforcesRatings'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import ProfileHeader from '../features/student/ProfileHeader'
import PeriodStrip from '../features/student/PeriodStrip'
import PlatformTable from '../features/student/PlatformTable'
import ProgressChart from '../features/student/ProgressChart'
import useStudentProfile from '../features/student/useStudentProfile'
import { buildSeries, seriesFromBoards } from '../features/student/utils'
import { PERIODS } from '../features/leaderboard/periods'
import '../features/student/student.css'

export default function StudentDetailPage() {
  const { id } = useParams()
  const { version } = useSync()
  const [attempt, setAttempt] = useState(0)
  const { status, stats, student, boards, error } = useStudentProfile(id, version, attempt)
  const cf = useCodeforcesRatings(student?.codeforces_id ? [student.codeforces_id] : [], status === 'ready')

  let body
  if (status === 'loading') {
    body = (
      <div aria-busy="true" className="sp">
        <div className="sp-skel sp-skel--head" />
        <div className="sp-skel sp-skel--strip" />
        <div className="sp-skel sp-skel--card" />
      </div>
    )
  } else if (status === 'missing') {
    body = (
      <div className="sp-state">
        <p>This student does not exist, or was deleted.</p>
        <p className="num" style={{ fontSize: 12 }}>Requested id: {id}{error ? ` · ${error}` : ''}</p>
        <Link to="/students" className="btn btn--ghost">Back to students</Link>
      </div>
    )
  } else if (status === 'error') {
    body = (
      <div className="sp-state" role="alert">
        <p>{error}</p>
        <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
      </div>
    )
  } else {
    const sid = stats.student.id
    const allTime = boards['all-time']
    const me = allTime?.find((r) => r.id === sid)
    const rank = me?.rank ?? null
    const youLeads = rank === 1
    const leaderRow = allTime ? (youLeads ? allTime.find((r) => r.id !== sid) : allTime.find((r) => r.rank === 1)) : null
    const boardsReady = PERIODS.every((p) => boards[p.value])
    const leader = leaderRow && boardsReady ? seriesFromBoards(leaderRow.id, boards) : null
    const leaderLabel = leaderRow ? (youLeads ? `Runner-up · ${leaderRow.name}` : `#1 · ${leaderRow.name}`) : ''

    body = (
      <div className="sp">
        <ProfileHeader info={stats.student} student={student} rank={rank} total={allTime?.length ?? 0} />
        <PeriodStrip periods={stats.periods} total={stats.total_solved} />
        <ProgressChart
          you={buildSeries(stats.total_solved, stats.periods)}
          leader={leader}
          leaderLabel={leaderLabel}
          youLeads={youLeads}
        />
        <PlatformTable
          id={sid}
          student={student}
          byPlatform={stats.by_platform}
          rows={allTime}
          periodsByPlatform={stats.periods_by_platform}
          cf={cf}
        />
      </div>
    )
  }

  return (
    <main className="container container--wide">
      <Link to="/" className="sp__back" style={{ marginTop: 'var(--space-6)' }}>
        <Icon name="arrow-left" size={16} /> Leaderboard
      </Link>
      {body}
    </main>
  )
}