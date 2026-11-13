import Button from '../../components/ui/Button'

const PLATFORMS = [
  { key: 'codeforces', short: 'CF', name: 'Codeforces' },
  { key: 'leetcode', short: 'LC', name: 'LeetCode' },
  { key: 'codechef', short: 'CC', name: 'CodeChef' },
  { key: 'beecrowd', short: 'BC', name: 'beecrowd' },
]

function rankClass(rank) {
  if (rank === 1) return 'lb-rank--1'
  if (rank <= 3) return 'lb-rank--top'
  return ''
}

function Header({ periodColumn }) {
  return (
    <div className="lb-head" role="row">
      <span role="columnheader">Rank</span>
      <span role="columnheader">Student</span>
      <span role="columnheader" className="lb-hide">Solved by platform</span>
      <span role="columnheader" className="lb-num">{periodColumn}</span>
      <span role="columnheader" className="lb-num lb-hide">Total</span>
    </div>
  )
}

export default function LeaderboardTable({ status, rows, error, periodColumn, onRetry }) {
  if (status === 'error') {
    return (
      <div className="lb-state" role="alert">
        <p>{error}</p>
        <Button variant="ghost" onClick={onRetry}>Try again</Button>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div role="table" aria-busy="true" aria-label="Leaderboard">
        <Header periodColumn={periodColumn} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div className="lb-row lb-skel" role="row" key={i} style={{ '--i': i }}>
            <span className="lb-skel__dot" />
            <span className="lb-skel__line" />
            <span className="lb-skel__line lb-hide" />
            <span className="lb-skel__line" />
            <span className="lb-skel__line lb-hide" />
          </div>
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="lb-state">
        <p>No students yet. Add students or import an Excel file to see the leaderboard.</p>
      </div>
    )
  }

  return (
    <div role="table" aria-label="Leaderboard">
      <Header periodColumn={periodColumn} />
      {rows.map((r, i) => (
        <div className="lb-row" role="row" key={r.id} style={{ '--i': i }}>
          <span role="cell">
            <b className={`lb-rank ${rankClass(r.rank)}`}>{r.rank}</b>
          </span>
          <span role="cell" className="lb-name">
            {r.name}
            <small>{r.student_id} · Batch {r.batch}</small>
          </span>
          <span role="cell" className="lb-chips lb-hide">
            {PLATFORMS.map((p) => {
              const solved = r.by_platform?.[p.key] ?? 0
              const isTop = r.top_in?.includes(p.key)
              const unsynced = p.key === 'beecrowd'
              const title = isTop
                ? `Top solver on ${p.name}`
                : unsynced
                  ? 'beecrowd is not synced yet'
                  : p.name
              return (
                <span
                  key={p.key}
                  title={title}
                  className={`lb-chip${isTop ? ' is-top' : ''}${unsynced ? ' is-muted' : ''}`}
                >
                  {p.short} {unsynced ? '—' : solved}
                </span>
              )
            })}
          </span>
          <b role="cell" className="lb-period lb-num">{r.period_solved}</b>
          <span role="cell" className="lb-total lb-num lb-hide">{r.total_solved}</span>
        </div>
      ))}
      <p className="lb-legend">Gold chip = best solver on that platform.</p>
    </div>
  )
}