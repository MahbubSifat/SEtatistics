import Icon from '../../components/ui/Icon'
import StudentAvatar from '../../components/ui/StudentAvatar'
import { PLATFORMS, medalOf, ordinal, ordinalParts } from './utils'
import DevBadge from '../../components/ui/DevBadge'
import { developerOf } from '../../config/team'

const isHttp = (u) => /^https?:\/\//i.test(u || '')

export default function ProfileHeader({ info, student, rank, total }) {
  const devInfo = developerOf(info.student_id)
  const dev = devInfo !== null
  const medal = medalOf(rank)

  const platformLinks = PLATFORMS.filter((p) => student?.[p.field]).map((p) => ({
    key: p.key,
    tag: p.short,
    text: student[p.field],
    url: p.url(student[p.field]),
    label: `${p.name} profile`,
  }))
  // backend এ এই field যোগ হলে নিজে থেকেই দেখাবে
  const extraLinks = [
    { key: 'linkedin', tag: 'IN', text: 'LinkedIn', url: student?.linkedin_url || devInfo?.linkedin, label: 'LinkedIn profile' },
    { key: 'github', tag: 'GH', text: 'GitHub', url: student?.github_url, label: 'GitHub profile' },
  ].filter((l) => isHttp(l.url))
  const links = [...extraLinks, ...platformLinks]

  const [n, suffix] = rank ? ordinalParts(rank) : []
  const avatarLabel = `${info.name}${medal ? `, ranked ${ordinal(rank)}` : ''}${dev ? ', developer' : ''}`

  return (
    <section className="sp-head">
      <StudentAvatar name={info.name} rank={rank} developer={dev} size={136} label={avatarLabel} />

      <div className="sp-head__main">
        <div className="sp-title">
          <h1>{info.name}</h1>
          {dev && (
            <span className="sp-dev">
              <DevBadge size={22} />
              Developer
              <span className="sp-dev__role">· {devInfo.role}</span>
            </span>
          )}
        </div>
        <p className="sp-dept">Department of Software Engineering</p>
        <p className="sp-meta num">ID: {info.student_id} · SE Batch {info.batch}</p>

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

      {rank && (
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
      )}
    </section>
  )
}