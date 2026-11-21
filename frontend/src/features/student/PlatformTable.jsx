import { PLATFORMS } from '../shared/platforms'
import RatingCell from '../shared/RatingCell'

const COLS = [
  { key: 'this-day', label: 'Today' },
  { key: 'last-week', label: '7 days' },
  { key: 'last-month', label: '30 days' },
]

export default function PlatformTable({ platforms }) {
  return (
    <section className="sp-card">
      <header className="sp-card__head">
        <h2>Platforms</h2>
        <span className="sp-card__hint num">Problems solved per platform</span>
      </header>
      <div className="sp-scroll">
        <table className="pt">
          <thead>
            <tr>
              <th scope="col">Platform</th>
              <th scope="col" className="pt__user">Username</th>
              <th scope="col" className="num-h">All time</th>
              {COLS.map((c) => (
                <th key={c.key} scope="col" className="num-h">{c.label}</th>
              ))}
              <th scope="col" className="num-h">Contest</th>
            </tr>
          </thead>
          <tbody>
            {PLATFORMS.map((p) => {
              const d = platforms?.[p.key]
              const linked = Boolean(d?.username)
              return (
                <tr key={p.key}>
                  <th scope="row" className="pt__name">
                    <span className="pt__tag num">{p.short}</span>
                    {p.name}
                  </th>
                  <td className="pt__user num">
                    {linked ? (
                      <a className="pt__link" href={d.url} target="_blank" rel="noopener noreferrer">{d.username}</a>
                    ) : (
                      <span className="pt__none">Not linked</span>
                    )}
                    {d?.error ? <span className="pt__err" title={d.error}>sync error</span> : null}
                  </td>
                  <td className="num pt__n">{linked ? d.solved?.['all-time'] ?? 0 : '—'}</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="num pt__n">{linked ? d.solved?.[c.key] ?? 0 : '—'}</td>
                  ))}
                  <td className="num pt__n">{linked ? <RatingCell platformKey={p.key} data={d} /> : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}