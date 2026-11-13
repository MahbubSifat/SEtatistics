import Button from '../../components/ui/Button'
import './students.css'

const ACCOUNTS = [
  { key: 'codeforces_id', short: 'CF', name: 'Codeforces' },
  { key: 'leetcode_id', short: 'LC', name: 'LeetCode' },
  { key: 'codechef_id', short: 'CC', name: 'CodeChef' },
  { key: 'beecrowd_id', short: 'BC', name: 'beecrowd' },
]

function Header() {
  return (
    <div className="st-head" role="row">
      <span role="columnheader">Student ID</span>
      <span role="columnheader">Name</span>
      <span role="columnheader" className="st-batch">Batch</span>
      <span role="columnheader" className="st-accounts">Platform accounts</span>
      <span role="columnheader" className="st-actions"><span className="visually-hidden">Actions</span></span>
    </div>
  )
}

export default function StudentTable({ status, rows, error, query, onRetry, onEdit, onDelete }) {
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
      <div role="table" aria-busy="true" aria-label="Students">
        <Header />
        {[0, 1, 2, 3, 4].map((i) => (
          <div className="st-row lb-skel" role="row" key={i}>
            <span className="lb-skel__line" />
            <span className="lb-skel__line" />
            <span className="lb-skel__line st-batch" />
            <span className="lb-skel__line st-accounts" />
            <span className="lb-skel__line" />
          </div>
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="lb-state">
        <p>{query ? `No students match “${query}”.` : 'No students yet. Add one, or import an Excel file.'}</p>
      </div>
    )
  }

  return (
    <div role="table" aria-label="Students">
      <Header />
      {rows.map((s, i) => {
        const accounts = ACCOUNTS.filter((a) => s[a.key])
        return (
          <div className="st-row" role="row" key={s.id} style={{ '--i': Math.min(i, 12) }}>
            <span role="cell" className="st-id num">{s.student_id}</span>
            <span role="cell" className="st-name">
              {s.name}
              <small>{s.email}</small>
              <small className="st-meta">{s.student_id} · Batch {s.batch}</small>
            </span>
            <span role="cell" className="st-batch num">{s.batch}</span>
            <span role="cell" className="st-accounts lb-chips">
              {accounts.length > 0 ? (
                accounts.map((a) => (
                  <span key={a.key} className="lb-chip" title={`${a.name}: ${s[a.key]}`}>
                    {a.short} {s[a.key]}
                  </span>
                ))
              ) : (
                <span className="st-none">No platform accounts</span>
              )}
            </span>
            <span role="cell" className="st-actions">
              <Button variant="ghost" className="btn--sm" onClick={() => onEdit(s)} aria-label={`Edit ${s.name}`}>
                Edit
              </Button>
              <Button variant="ghost" className="btn--sm st-del" onClick={() => onDelete(s)} aria-label={`Delete ${s.name}`}>
                Delete
              </Button>
            </span>
          </div>
        )
      })}
    </div>
  )
}