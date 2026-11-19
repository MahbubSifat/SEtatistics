import { NavLink } from 'react-router-dom'
import Icon from '../ui/Icon'
import Logo from '../ui/Logo'
import StudentAvatar from '../ui/StudentAvatar'
import { DEPARTMENT, DEVELOPERS, SUPERVISOR } from '../../config/team'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container container--wide">
        <div className="footer__grid">
          <div className="footer__brand">
            <Logo />
            <p className="footer__sup">
              Supervised by <strong>{SUPERVISOR.name}</strong>
            </p>
          </div>

          <nav className="footer__nav" aria-label="Footer">
            <NavLink to="/" end>Leaderboard</NavLink>
            <NavLink to="/students">Students</NavLink>
          </nav>

          <div className="footer__devs">
            <p className="footer__label">Developed by</p>
            <ul className="footer__list">
              {DEVELOPERS.map((d) => (
                <li key={d.studentId}>
                  <a
                    className="dev-card"
                    href={d.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${d.name}, ${d.role}. LinkedIn profile, opens in a new tab`}
                  >
                    <StudentAvatar name={d.name} developer size={40} />
                    <span className="dev-card__text">
                      <span className="dev-card__name">{d.name}</span>
                      <span className="dev-card__meta num" title={`${d.studentId} · ${d.role}`}>
                        {d.studentId} · {d.role}
                      </span>
                    </span>
                    <Icon name="external" size={14} className="dev-card__go" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          © {new Date().getFullYear()} {DEPARTMENT}. All rights reserved.
        </div>
      </div>
    </footer>
  )
}