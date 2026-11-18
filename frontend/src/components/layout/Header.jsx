import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useSync } from '../../context/SyncContext'
import Icon from '../ui/Icon'
import ThemeToggle from '../ui/ThemeToggle'
import SyncButton from '../../features/sync/SyncButton'
import './Header.css'

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/students', label: 'Students' },
  { to: '/import', label: 'Import' },
]

const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

export default function Header() {
  const { user, logout } = useAuth()
  const { running, status } = useSync()
  const pct = running && status?.total ? Math.round((status.done / status.total) * 100) : 0

  return (
    <header className="header">
      <div className="container container--wide header__inner">
        <div className="header__brand">
          <span className="header__mark" aria-hidden="true"><Icon name="code" size={18} /></span>
          <span className="header__dept">Department of Software Engineering, UFTB</span>
        </div>

        <nav className="header__nav" aria-label="Main">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className="header__link">
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="header__actions">
          <SyncButton />
          <ThemeToggle />
          <div className="header__user">
            <span className="header__avatar" aria-hidden="true">{initials(user?.name)}</span>
            <span className="header__name">{user?.name}</span>
          </div>
          <button type="button" className="header__icon-btn" onClick={logout} aria-label="Log out" title="Log out">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </div>

      {running && (
        <div
          className="header__progress"
          role="progressbar"
          aria-label="Sync progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      )}
    </header>
  )
}