import Icon from '../../components/ui/Icon'
import DevBadge from '../../components/ui/DevBadge'
import StudentAvatar from '../../components/ui/StudentAvatar'
import { developerOf, isDevStudent } from '../../config/team'
import { PLATFORMS } from '../shared/platforms'
import { ordinal, ordinalParts } from './utils'

const isHttp = (u) => /^https?:\/\//i.test(u || '')

export default function ProfileHeader({ me, standing }) {
  const dev = isDevStudent(me)
  const devInfo = developerOf(me.student_id)
  const { rank, out_of: total, medal } = standing
  const [n, suffix] = ordinalParts(rank)

  const links = [
    { key: 'github', tag: 'GH', text: 'GitHub', url: me.github_url, label: 'GitHub profile' },
    { key: 'linkedin', tag: 'IN', text: 'LinkedIn', url: me.linkedin_url || devInfo?.linkedin, label: 'LinkedIn profile' },
    ...PLATFORMS.map((p) => ({
      key: p.key,
      tag: p.short,
      text: me.platforms?.[p.key]?.username,
      url: me.platforms?.[p.key]?.url,
      label: `${p.name} profile`,
    })),
  ].filter((l) => l.text && isHttp(l.url))

  const avatarLabel = `${me.name}${medal ? `, ranked ${ordinal(rank)}` : ''}${dev ? ', developer' : ''}`

  return (
    <section className="sp-head">
      <StudentAvatar name={me.name} src={me.avatar_url} rank={medal ? rank : null} developer={dev} size={136} label={avatarLabel} />

      <div className="sp-head__main">
        <div className="sp-title">
          <h1>{me.name}</h1>
          {dev && (
            <span className="sp-dev">
              <DevBadge size={22} />
              Developer
              {devInfo && <span className="sp-dev__role">· {devInfo.role}</span>}
            </span>
          )}
        </div>
        <p className="sp-dept">{me.department ? `Department of ${me.department}` : 'Department of Software Engineering'}</p>
        <p className="sp-meta num">ID: {me.student_id} · Batch {me.batch}</p>

        {links.length > 0 && (
          <ul className="sp-links" aria-label="Profile links">
            {links.map((l) => (
              <li key={l.key}>
                <a className="sp-link" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={l.label}>
                  <span className="sp-link__tag">{l.tag}</span>
                  <span className="sp-link__text">{l.text}</span>
                  <Icon name="external" size={14} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sp-rank">
        {medal ? (
          <span className={`sp-medal sp-medal--${medal}`}>{ordinal(rank)} of {total} · all time</span>
        ) : (
          <>
            <div className="sp-rank__row" aria-label={`Ranked ${ordinal(rank)} of ${total}`}>
              <span className="sp-rank__n">{n}<sup>{suffix}</sup></span>
              <span className="sp-rank__slash" aria-hidden="true">/</span>
              <span className="sp-rank__total">{total}</span>
            </div>
            <span className="sp-rank__label">All-time rank</span>
          </>
        )}
      </div>
    </section>
  )
}