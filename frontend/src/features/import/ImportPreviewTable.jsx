import Icon from '../../components/ui/Icon'
import './import.css'

const SHORT = { codeforces_id: 'CF', leetcode_id: 'LC', codechef_id: 'CC', beecrowd_id: 'BC' }

export default function ImportPreviewTable({ rows }) {
  return (
    <div className="ip-wrap">
      <table className="ip-table">
        <thead>
          <tr>
            <th scope="col">Row</th>
            <th scope="col">Student ID</th>
            <th scope="col">Name</th>
            <th scope="col">Batch</th>
            <th scope="col">Email</th>
            <th scope="col">Platforms</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const bad = r.errors.length > 0
            const d = r.data ?? {}
            const accounts = Object.keys(SHORT).filter((k) => d[k])
            return (
              <tr key={r.row} className={bad ? 'is-bad' : ''}>
                <td className="num">{r.row}</td>
                <td className="num">{d.student_id || '—'}</td>
                <td>{d.name || '—'}</td>
                <td className="num">{d.batch || '—'}</td>
                <td>{d.email || '—'}</td>
                <td className="num">{accounts.map((k) => `${SHORT[k]} ${d[k]}`).join(' · ') || '—'}</td>
                <td>
                  {bad ? (
                    <ul className="ip-errors">
                      {r.errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="ip-ok"><Icon name="check" size={14} /> Ready</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}