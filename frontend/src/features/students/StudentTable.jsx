import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import StudentAvatar from '../../components/ui/StudentAvatar'
import { isDeveloper } from '../../config/team'
import './students.css'

const ACCOUNTS = [
  { key: 'codeforces_id', short: 'CF', name: 'Codeforces' },
  { key: 'leetcode_id', short: 'LC', name: 'LeetCode' },
  { key: 'codechef_id', short: 'CC', name: 'CodeChef' },
  { key: 'beecrowd_id', short: 'BC', name: 'beecrowd' },
]

function Head() {
  return (
    <thead>
      <tr>
        <th scope="col">Student</th>
        <th scope="col" className="stt__col-id">Student ID</th>
        <th scope="col" className="stt__col-batch">Batch</th>
        <th scope="col" className="stt__col-acc">Platform accounts</th>
        <th scope="col"><span className="visually-hidden">Actions</span></th>
      </tr>
    </thead>
  )
}

export default function StudentTable({ status, rows, error, query, onRetry, onEdit, onDelete }) {
  if (status === 'error') {
    return (
      <div className="stt__state" role="alert">
        <p>{error}</p>
        <Button variant="ghost" onClick={onRetry}>Try again</Button>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="stt__card" aria-busy="true">
        <table className="stt">
          <Head />
          <tbody>
            {[0, 1, 2, 3, 4].map((i) => (
              <tr key={i}>
                <td><span className="stt__skel" /></td>
                <td className="stt__col-id"><span className="stt__skel" /></td>
                <td className="stt__col-batch"><span className="stt__skel" /></td>
                <td className="stt__col-acc"><span className="stt__skel" /></td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="stt__state">
        <p>{query ? `No students match “${query}”.` : 'No students yet. Add one, or import an Excel file.'}</p>
      </div>
    )
  }

  return (
    <div className="stt__card">
      <table className="stt">
        <Head />
        <tbody>
          {rows.map((s, i) => {
            const accounts = ACCOUNTS.filter((a) => s[a.key])
            return (
              <tr key={s.id} className="stt__row" style={{ '--i': Math.min(i, 12) }}>
                <td>
                  <div className="stt__student">
                    <StudentAvatar name={s.name} developer={isDeveloper(s.student_id)} size={40} />
                    <div className="stt__who">
                      <Link to={`/students/${s.id}`} className="stt__link">{s.name}</Link>
                      <span className="stt__email">{s.email}</span>
                      <span className="stt__meta">{s.student_id} · Batch {s.batch}</span>
                    </div>
                  </div>
                </td>
                <td className="stt__col-id stt__mono num">{s.student_id}</td>
                <td className="stt__col-batch stt__mono num">{s.batch}</td>
                <td className="stt__col-acc">
                  <div className="stt__chips">
                    {accounts.length > 0 ? (
                      accounts.map((a) => (
                        <span key={a.key} className="stt__chip" title={`${a.name}: ${s[a.key]}`}>
                          <b>{a.short}</b>
                          <span>{s[a.key]}</span>
                        </span>
                      ))
                    ) : (
                      <span className="stt__none">No platform accounts</span>
                    )}
                  </div>
                </td>
                <td className="stt__actions">
                  <button type="button" className="stt__icon" onClick={() => onEdit(s)} aria-label={`Edit ${s.name}`} title="Edit">
                    <Icon name="edit" size={17} />
                  </button>
                  <button type="button" className="stt__icon stt__icon--del" onClick={() => onDelete(s)} aria-label={`Delete ${s.name}`} title="Delete">
                    <Icon name="trash" size={17} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}