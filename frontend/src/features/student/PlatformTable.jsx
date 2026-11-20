import { PLATFORMS, platformBest, platformRank } from './utils'

export default function PlatformTable({ id, student, byPlatform, rows }) {
  return (
    <section className="sp-card">
      <header className="sp-card__head">
        <h2>Platforms</h2>
        <span className="sp-card__hint num">All time</span>
      </header>
      <div className="sp-scroll">
        <table className="pt">
          <thead>
            <tr>
              <th scope="col">Platform</th>
              <th scope="col" className="pt__user">Username</th>
              <th scope="col" className="num-h">Solved</th>
              <th scope="col" className="num-h">Rank</th>
              <th scope="col" className="num-h pt__best">Best</th>
              <th scope="col" className="num-h">Gap</th>
            </tr>
          </thead>
          <tbody>
            {PLATFORMS.map((p) => {
              const username = student?.[p.field] || ''
              const solved = byPlatform?.[p.key] ?? 0
              const linked = Boolean(username) && !p.unsynced
              const rank = linked ? platformRank(rows, id, p.key) : null
              const best = platformBest(rows, p.key)
              const gap = best - solved
              return (
                <tr key={p.key}>
                  <th scope="row" className="pt__name">
                    <span className="pt__tag num">{p.short}</span>
                    {p.name}
                  </th>
                  <td className="pt__user num">
                    {username || <span className="pt__none">Not linked</span>}
                  </td>
                  <td className="num pt__n">
                    {p.unsynced ? <span title="beecrowd is not synced yet">—</span> : solved}
                  </td>
                  <td className="num pt__n">
                    {rank === null ? '—' : <span className={`pt__rank${rank === 1 && solved > 0 ? ' is-top' : ''}`}>#{rank}</span>}
                  </td>
                  <td className="num pt__n pt__best">{p.unsynced ? '—' : best}</td>
                  <td className="num pt__n">
                    {rank === null ? '—' : gap === 0 ? <span className="pt__lead">Leading</span> : `−${gap}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}import { PLATFORMS, platformBest, platformRank } from './utils'
import { cfClass, cfTitle } from '../dashboard/cf'
import '../dashboard/cf.css'

const PERIOD_COLS = [
  { key: 'last-day', label: 'Today' },
  { key: 'last-week', label: '7 days' },
  { key: 'last-month', label: '30 days' },
]

function Contest({ p, username, cf }) {
  if (p.key !== 'codeforces' || !username) return '—'
  if (cf.status === 'loading') return '…'
  if (cf.status === 'error') return '—'
  const info = cf.data[username.toLowerCase()]
  if (!info) return 'Not found'
  if (info.rating == null) return 'Unrated'
  return (
    <span className={`cfr ${cfClass(info.rank)}`}>
      <b className="num">{info.rating}</b>
      <small>{cfTitle(info.rank)}</small>
    </span>
  )
}

export default function PlatformTable({ id, student, byPlatform, rows, periodsByPlatform, cf }) {
  const hasPeriods = Boolean(periodsByPlatform)

  return (
    <section className="sp-card">
      <header className="sp-card__head">
        <h2>Platforms</h2>
        <span className="sp-card__hint num">Solved = all time</span>
      </header>
      <div className="sp-scroll">
        <table className="pt">
          <thead>
            <tr>
              <th scope="col">Platform</th>
              <th scope="col" className="pt__user">Username</th>
              <th scope="col" className="num-h">Solved</th>
              {hasPeriods && PERIOD_COLS.map((c) => <th key={c.key} scope="col" className="num-h">{c.label}</th>)}
              <th scope="col" className="num-h pt__hide-sm">Rank</th>
              <th scope="col" className="num-h pt__hide-sm">Best</th>
              <th scope="col" className="num-h pt__hide-sm">Gap</th>
              <th scope="col" className="num-h">Contest</th>
            </tr>
          </thead>
          <tbody>
            {PLATFORMS.map((p) => {
              const username = student?.[p.field] || ''
              const solved = byPlatform?.[p.key] ?? 0
              const linked = Boolean(username) && !p.unsynced
              const rank = linked && rows ? platformRank(rows, id, p.key) : null
              const best = rows && !p.unsynced ? platformBest(rows, p.key) : null
              const gap = best === null ? null : best - solved
              return (
                <tr key={p.key}>
                  <th scope="row" className="pt__name">
                    <span className="pt__tag num">{p.short}</span>
                    {p.name}
                  </th>
                  <td className="pt__user num">{username || <span className="pt__none">Not linked</span>}</td>
                  <td className="num pt__n">{p.unsynced ? <span title="Beecrowd is not synced yet">—</span> : solved}</td>
                  {hasPeriods && PERIOD_COLS.map((c) => (
                    <td key={c.key} className="num pt__n">{p.unsynced ? '—' : periodsByPlatform?.[c.key]?.[p.key] ?? 0}</td>
                  ))}
                  <td className="num pt__n pt__hide-sm">
                    {rank === null ? '—' : <span className={`pt__rank${rank === 1 && solved > 0 ? ' is-top' : ''}`}>#{rank}</span>}
                  </td>
                  <td className="num pt__n pt__hide-sm">{best === null ? '—' : best}</td>
                  <td className="num pt__n pt__hide-sm">
                    {rank === null || gap === null ? '—' : gap === 0 ? <span className="pt__lead">Leading</span> : `−${gap}`}
                  </td>
                  <td className="num pt__n"><Contest p={p} username={username} cf={cf} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!hasPeriods && (
        <p className="cc__note">Platform-wise Today / 7-day / 30-day counts will appear once the backend provides them.</p>
      )}
    </section>
  )
}