import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSync } from '../context/SyncContext'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import ProfileHeader from '../features/student/ProfileHeader'
import PeriodStrip from '../features/student/PeriodStrip'
import PlatformTable from '../features/student/PlatformTable'
import CompareChart from '../features/student/CompareChart'
import useStudentProfile from '../features/student/useStudentProfile'
import { buildComparison } from '../features/student/utils'
import '../features/student/student.css'

export default function StudentDetailPage() {
  const { id } = useParams()
  const { version } = useSync()
  const [attempt, setAttempt] = useState(0)
  const [mode, setMode] = useState('solved')
  const { status, stats, student, boards, error } = useStudentProfile(id, version, attempt)

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
    const me = allTime.find((r) => r.id === sid)
    const rank = me?.rank ?? null

    body = (
      <div className="sp">
        <ProfileHeader info={stats.student} student={student} rank={rank} total={allTime.length} />
        <PeriodStrip periods={stats.periods} total={stats.total_solved} />
        <PlatformTable id={sid} student={student} byPlatform={stats.by_platform} rows={allTime} />
        <CompareChart
          items={buildComparison(sid, boards)}
          mode={mode}
          onModeChange={setMode}
          youLeadsAllTime={rank === 1}
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