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
}