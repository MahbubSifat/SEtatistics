import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import StudentAvatar from '../../components/ui/StudentAvatar'
import { isDeveloper } from '../../config/team'
import { cfClass, cfTitle } from './cf'
import './dashboard.css'
import './cf.css'

const PLATFORMS = [
  { key: 'codeforces', name: 'CodeForces', short: 'CF' },
  { key: 'leetcode', name: 'LeetCode', short: 'LC' },
  { key: 'beecrowd', name: 'Beecrowd', short: 'BC', unsynced: true },
  { key: 'codechef', name: 'CodeChef', short: 'CC' },
]

// Growth = এই period এ যত solve ÷ তার আগে যত ছিল
function growthOf(row, period) {
  if (period === 'all-time' || row.period_solved <= 0) return null
  const base = row.total_solved - row.period_solved
  if (base <= 0) return 'new'
  const pct = (row.period_solved / base) * 100
  return pct >= 10 ? String(Math.round(pct)) : pct.toFixed(1)
}

function Growth({ row, period }) {
  const g = growthOf(row, period)
  if (g === null) return <span className="dt__dash">—</span>
  if (g === 'new') return <span className="growth growth--new">New</span>
  return (
    <span className="growth">
      <Icon name="trend-up" size={14} />
      {g}%
    </span>
  )
}

// Solve mode: backend period-wise দিলে সেটা, নাহলে সব-সময়ের মোট
const solvedOf = (row, p, ctx) =>
  (ctx.period !== 'all-time' && ctx.hasPeriod ? row.period_by_platform?.[p.key] : row.by_platform?.[p.key]) ?? 0

function CfRating({ row, ctx }) {
  const handle = ctx.handleById?.[row.id]
  if (ctx.ratingsStatus === 'loading') return <span className="dt__skel dt__skel--sm" />
  if (!handle) return <span className="dt__dash">No account</span>
  if (ctx.ratingsStatus === 'error') return <span className="dt__dash">—</span>
  const info = ctx.ratings?.[handle.toLowerCase()]
  if (!info) return <span className="dt__dash" title="Handle not found on Codeforces">Not found</span>
  if (info.rating == null) return <span className="dt__dash">Unrated</span>
  return (
    <span className={`cfr ${cfClass(info.rank)}`}>
      <b className="num">{info.rating}</b>
      <small>{cfTitle(info.rank)}</small>
      {info.maxRating ? <em className="num">max {info.maxRating}</em> : null}
    </span>
  )
}

function PlatformCell({ row, p, ctx }) {
  if (p.unsynced) return <span className="dt__dash" title="Beecrowd is not synced yet">—</span>
  if (ctx.mode === 'rank') {
    if (p.key === 'codeforces') return <CfRating row={row} ctx={ctx} />
    return <span className="dt__dash" title="Contest rating needs backend support">—</span>
  }
  const periodScope = ctx.period !== 'all-time' && ctx.hasPeriod
  const top = !periodScope && row.top_in?.includes(p.key)
  return (
    <span className={`dt__val${top ? ' is-top' : ''}`} title={top ? `Top solver on ${p.name}` : undefined}>
      {solvedOf(row, p, ctx)}
    </span>
  )
}

function chipLine(row, ctx) {
  return PLATFORMS.map((p) => {
    if (p.unsynced) return `${p.short} —`
    if (ctx.mode === 'rank') {
      if (p.key !== 'codeforces') return `${p.short} —`
      const h = ctx.handleById?.[row.id]
      return `${p.short} ${(h && ctx.ratings?.[h.toLowerCase()]?.rating) ?? '—'}`
    }
    return `${p.short} ${solvedOf(row, p, ctx)}`
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
            <small className="dt__scope">{ctx.mode === 'rank' ? 'Contest' : ctx.scopeLabel}</small>
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
            <tr key={r.id} className={`dt__row${r.rank <= 3 ? ` is-top is-top-${r.rank}` : ''}`} style={{ '--i': i }}>
              <td className="dt__stand">
                <span className="dt__rank num">{String(r.rank).padStart(2, '0')}</span>
                <StudentAvatar name={r.name} rank={r.rank} developer={isDeveloper(r.student_id)} size={46} />
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
                  <td className="dt__period num">{r.period_solved}</td>
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