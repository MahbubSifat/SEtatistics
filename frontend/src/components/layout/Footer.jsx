import { NavLink } from 'react-router-dom'
import Logo from '../ui/Logo'
import { DEVELOPERS } from '../../config/team'
import './Footer.css'

export default function Footer() {
  const names = DEVELOPERS.map((d) => d.name).filter(Boolean)

  return (
    <footer className="footer">
      <div className="container container--wide footer__inner">
        <div className="footer__brand">
          <Logo size="sm" />
          {names.length > 0 && <span className="footer__credit">Built by {names.join(', ')}</span>}
        </div>
        <nav className="footer__nav" aria-label="Footer">
          <NavLink to="/" end>Leaderboard</NavLink>
          <NavLink to="/students">Students</NavLink>
          <NavLink to="/import">Import</NavLink>
        </nav>
        <span className="footer__copy">© {new Date().getFullYear()} SEtatistics</span>
      </div>
    </footer>
  )
}