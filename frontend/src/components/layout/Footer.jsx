import { NavLink } from 'react-router-dom'
import Icon from '../ui/Icon'
import Logo from '../ui/Logo'
import { DEPARTMENT, DEVELOPERS, SUPERVISOR, TAGLINE } from '../../config/team'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container container--wide">
        <div className="footer__top">
          <Logo tagline={TAGLINE} />
          <nav className="footer__nav" aria-label="Footer">
            <NavLink to="/" end>Leaderboard</NavLink>
            <NavLink to="/students">Students</NavLink>
          </nav>
        </div>

        <p className="footer__sup">
          Supervised by <strong>{SUPERVISOR.name}</strong>
        </p>

        <div className="footer__devs">
          <span className="footer__label">Developed by</span>
          <ul className="footer__list">
            {DEVELOPERS.map((d) => (
              <li key={d.studentId}>
                <a
                  className="dev-link"
                  href={d.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${d.name}, ${d.role}. LinkedIn profile, opens in a new tab`}
                >
                  <span className="dev-link__name">{d.name}</span>
                  <span className="dev-link__meta num">{d.studentId} · {d.role}</span>
                  <Icon name="external" size={12} className="dev-link__go" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="footer__bottom">
          © {new Date().getFullYear()} {DEPARTMENT}. All rights reserved.
        </div>
      </div>
    </footer>
  )
}