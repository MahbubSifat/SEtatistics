import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSync } from '../context/SyncContext'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import ProfileHeader from '../features/student/ProfileHeader'
import PeriodStrip from '../features/student/PeriodStrip'
import PlatformTable from '../features/student/PlatformTable'
import ProgressChart from '../features/student/ProgressChart'
import useStudentProfile from '../features/student/useStudentProfile'
import '../features/student/student.css'

export default function StudentDetailPage() {
  const { id } = useParams()
  const { version } = useSync()
  const [attempt, setAttempt] = useState(0)
  const { status, profile, history, error } = useStudentProfile(id, version, attempt)

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
        <Link to="/" className="btn btn--ghost">Back to leaderboard</Link>
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
    const me = profile.student
    body = (
      <div className="sp">
        <ProfileHeader me={me} standing={profile.standing} />
        <PeriodStrip solved={me.solved} />
        <PlatformTable platforms={me.platforms} />
        {history ? (
          <ProgressChart history={history} />
        ) : (
          <div className="sp-state"><p>The progress graph could not be loaded right now.</p></div>
        )}
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