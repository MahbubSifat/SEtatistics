import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import StudentAvatar from '../../components/ui/StudentAvatar'
import RatingCell from '../shared/RatingCell'
import { PLATFORMS } from '../shared/platforms'
import { isDevStudent } from '../../config/team'
import './dashboard.css'
import './cf.css'

// Growth: backend আগের সমান সময়ের সাথে তুলনা করে দেয় (row.growth[period])
function Growth({ row, period }) {
  const g = row.growth?.[period]
  if (!g) return <span className="dt__dash">—</span>
  if (g.percent === null || g.percent === undefined) {
    return g.change > 0 ? <span className="growth growth--new">New</span> : <span className="dt__dash">—</span>
  }
  if (g.percent === 0) return <span className="growth growth--flat">0%</span>
  const up = g.percent > 0
  return (
    <span className={`growth${up ? '' : ' growth--down'}`}>
      <Icon name={up ? 'trend-up' : 'trend-down'} size={14} />
      {Math.abs(g.percent)}%
    </span>
  )
}

function PlatformCell({ row, p, ctx }) {
  const d = row.platforms?.[p.key]
  if (ctx.mode === 'rank') return <RatingCell platformKey={p.key} data={d} />
  if (!d?.username) return <span className="dt__dash" title="No account linked">—</span>
  const top = row.top_in?.includes(p.key)
  return (
    <span className={`dt__val${top ? ' is-top' : ''}`} title={top ? `Top solver on ${p.name}` : undefined}>
      {d.solved?.[ctx.period] ?? 0}
    </span>
  )
}

function chipLine(row, ctx) {
  return PLATFORMS.map((p) => {
    const d = row.platforms?.[p.key]
    if (!d?.username) return `${p.short} —`
    if (ctx.mode === 'rank') return `${p.short} ${d.rating != null ? Math.round(d.rating) : '—'}`
    return `${p.short} ${d.solved?.[ctx.period] ?? 0}`
  }).join(' · ')
}

function Head({ ctx }) {
  return (
    <thead>
      <tr>
        <th scope="col" className="dt__stand-h">Standing</th>
        <th scope="col">Name</th>
        {PLATFORMS.map((p) => (
          <th key={p.key} scope="col" className="dt__col-plat num-h">
            {p.name}
            <small className="dt__scope">{ctx.mode === 'rank' ? 'Contest' : ctx.periodColumn}</small>
          </th>
        ))}
        {ctx.mode === 'solved' && (
          <>
            <th scope="col" className="num-h">{ctx.periodColumn}</th>
            <th scope="col" className="dt__col-growth num-h">Growth</th>
          </>
        )}
      </tr>
    </thead>
  )
}

export default function StandingsTable({ status, rows, error, ctx, onRetry }) {
  if (status === 'error') {
    return (
      <div className="dt__state" role="alert">
        <p>{error}</p>
        <Button variant="ghost" onClick={onRetry}>Try again</Button>
      </div>
    )
  }

  if (status === 'loading' && rows.length === 0) {
    return (
      <div className="dt__card" aria-busy="true">
        <table className="dt">
          <Head ctx={ctx} />
          <tbody>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <tr key={i} className="dt__row">
                <td><span className="dt__skel dt__skel--dot" /></td>
                <td><span className="dt__skel" /></td>
                {PLATFORMS.map((p) => (
                  <td key={p.key} className="dt__col-plat"><span className="dt__skel" /></td>
                ))}
                {ctx.mode === 'solved' && (
                  <>
                    <td><span className="dt__skel" /></td>
                    <td className="dt__col-growth"><span className="dt__skel" /></td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="dt__state">
        <p>No students yet. Add students or import an Excel file to see the leaderboard.</p>
        <Link to="/students" className="btn btn--ghost">Go to students</Link>
      </div>
    )
  }

  return (
    <div className={`dt__card${status === 'loading' ? ' is-loading' : ''}`} aria-busy={status === 'loading'}>
      <table className="dt">
        <Head ctx={ctx} />
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={`dt__row${r.medal ? ` is-top is-top-${r.rank}` : ''}`} style={{ '--i': i }}>
              <td className="dt__stand">
                <span className="dt__rank num">{String(r.rank).padStart(2, '0')}</span>
                <StudentAvatar
                  name={r.name}
                  src={r.avatar_url}
                  rank={r.medal ? r.rank : null}
                  developer={isDevStudent(r)}
                  size={46}
                />
              </td>
              <td className="dt__name">
                <Link to={`/students/${r.id}`} className="dt__link">{r.name}</Link>
                <span className="dt__meta num">{r.student_id} · Batch {r.batch}</span>
                <span className="dt__chips num" aria-hidden="true">{chipLine(r, ctx)}</span>
              </td>
              {PLATFORMS.map((p) => (
                <td key={p.key} className="dt__col-plat dt__plat num">
                  <PlatformCell row={r} p={p} ctx={ctx} />
                </td>
              ))}
              {ctx.mode === 'solved' && (
                <>
                  <td className="dt__period num">{r.solved?.[ctx.period] ?? 0}</td>
                  <td className="dt__col-growth dt__growth"><Growth row={r} period={ctx.period} /></td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}