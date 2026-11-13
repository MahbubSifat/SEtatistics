import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Button from '../ui/Button'
import './Masthead.css'

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/students', label: 'Students' },
  { to: '/import', label: 'Import' },
]

export default function Masthead() {
  const { user, logout } = useAuth()

  return (
    <header className="masthead">
      <div className="container masthead__inner">
        <span className="masthead__brand">CP Tracker</span>
        <nav className="masthead__nav" aria-label="Main">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className="masthead__link">
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="masthead__actions">
          <span className="masthead__user">{user?.name}</span>
          <Button variant="ghost-light" onClick={logout}>Logout</Button>
        </div>
      </div>
    </header>
  )
}