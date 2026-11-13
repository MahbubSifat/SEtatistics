import { useEffect, useState } from 'react'
import { deleteStudent, listStudents } from '../api/students'
import { useToast } from '../context/ToastContext'
import useDebounce from '../hooks/useDebounce'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import StudentTable from '../features/students/StudentTable'
import StudentFormModal from '../features/students/StudentFormModal'
import '../features/leaderboard/leaderboard.css' // hero ও state style এখান থেকে নিচ্ছি
import '../features/students/students.css'

const ACCOUNT_KEYS = ['codeforces_id', 'leetcode_id', 'codechef_id', 'beecrowd_id']

export default function StudentsPage() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const query = useDebounce(search.trim(), 300)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ status: 'loading', rows: [], error: '' })
  const [form, setForm] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let ignore = false
    // আগের list থাকলে সেটাই দেখাই, skeleton এ ঝলক দেব না
    setState((s) => (s.status === 'ready' ? s : { ...s, status: 'loading', error: '' }))
    listStudents(query)
      .then((rows) => {
        if (!ignore) setState({ status: 'ready', rows, error: '' })
      })
      .catch((err) => {
        if (!ignore) setState({ status: 'error', rows: [], error: err.message })
      })
    return () => {
      ignore = true
    }
  }, [query, attempt])

  function handleSaved(saved, wasEdit) {
    setForm(null)
    setAttempt((n) => n + 1)
    const hint = !wasEdit && ACCOUNT_KEYS.some((k) => saved[k]) ? '. Run Sync to fetch their solved counts.' : ''
    toast(`${saved.name} ${wasEdit ? 'updated' : 'added'}${hint}`)
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteStudent(toDelete.id)
      toast(`${toDelete.name} deleted`)
      setAttempt((n) => n + 1)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleting(false)
      setToDelete(null)
    }
  }

  const n = state.rows.length
  const subline =
    state.status !== 'ready'
      ? 'Add, edit and manage the students being tracked.'
      : query
        ? `${n} ${n === 1 ? 'match' : 'matches'} for “${query}”`
        : `${n} registered ${n === 1 ? 'student' : 'students'}`

  return (
    <main>
      <section className="lb-hero">
        <div className="container">
          <p className="lb-hero__eyebrow">STUDENT REGISTER</p>
          <h1 className="lb-hero__title">Students</h1>
          <p className="lb-hero__sub">{subline}</p>
        </div>
      </section>

      <div className="container st-body">
        <div className="st-bar">
          <input
            className="st-search"
            type="search"
            placeholder="Search by name or student ID…"
            aria-label="Search students by name or student ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button onClick={() => setForm({ mode: 'add' })}>Add student</Button>
        </div>

        <StudentTable
          status={state.status}
          rows={state.rows}
          error={state.error}
          query={query}
          onRetry={() => setAttempt((x) => x + 1)}
          onEdit={(student) => setForm({ mode: 'edit', student })}
          onDelete={setToDelete}
        />
      </div>

      <StudentFormModal state={form} onClose={() => setForm(null)} onSaved={handleSaved} />

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete student?"
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      >
        {toDelete && (
          <p>
            <strong>{toDelete.name}</strong> ({toDelete.student_id}) will be removed together with their
            platform accounts and all solved-problem data. This cannot be undone.
          </p>
        )}
      </ConfirmDialog>
    </main>
  )
}