import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { createStudent, updateStudent } from '../../api/students'
import './students.css'

const CORE = [
  { name: 'student_id', label: 'Student ID', required: true },
  { name: 'name', label: 'Full name', required: true },
  { name: 'batch', label: 'Batch', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
]
const PLATFORMS = [
  { name: 'codeforces_id', label: 'Codeforces' },
  { name: 'leetcode_id', label: 'LeetCode' },
  { name: 'codechef_id', label: 'CodeChef' },
  { name: 'beecrowd_id', label: 'beecrowd' },
]
const ALL = [...CORE, ...PLATFORMS]

const toValues = (student) => Object.fromEntries(ALL.map((f) => [f.name, student?.[f.name] ?? '']))

function StudentForm({ student, onClose, onSaved }) {
  const isEdit = Boolean(student)
  const [values, setValues] = useState(() => toValues(student))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }))

  // edit এ কোন field বদলেছে
  const changed = isEdit ? ALL.filter((f) => values[f.name].trim() !== (student[f.name] ?? '')) : []
  // আগে ID ছিল, এখন বদলানো বা মোছা: পুরোনো solved data মুছে যাবে
  const risky = PLATFORMS.filter((f) => changed.includes(f) && (student[f.name] ?? '') !== '')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const trimmed = Object.fromEntries(ALL.map((f) => [f.name, values[f.name].trim()]))
    setSaving(true)
    try {
      let saved
      if (isEdit) {
        const diff = Object.fromEntries(changed.map((f) => [f.name, trimmed[f.name]]))
        if (Object.keys(diff).length === 0) {
          onClose()
          return
        }
        saved = await updateStudent(student.id, diff)
      } else {
        const body = Object.fromEntries(ALL.filter((f) => f.required || trimmed[f.name] !== '').map((f) => [f.name, trimmed[f.name]]))
        saved = await createStudent(body)
      }
      onSaved(saved, isEdit)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="st-form" onSubmit={handleSubmit}>
      {error && <p className="st-form__full st-error" role="alert">{error}</p>}

      {CORE.map((f) => (
        <Input key={f.name} id={`f-${f.name}`} label={f.label} type={f.type} required={f.required}
               value={values[f.name]} onChange={set(f.name)} />
      ))}

      <p className="st-form__full st-form__section">Platform usernames (optional)</p>
      {PLATFORMS.map((f) => (
        <Input key={f.name} id={`f-${f.name}`} label={f.label}
               value={values[f.name]} onChange={set(f.name)} autoComplete="off" />
      ))}

      {risky.length > 0 && (
        <p className="st-form__full st-warn" role="status">
          Changing or removing {risky.map((f) => f.label).join(', ')} deletes the solved data already
          collected for that account. Run Sync again after saving.
        </p>
      )}

      <div className="st-form__full modal__actions">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{isEdit ? 'Save changes' : 'Add student'}</Button>
      </div>
    </form>
  )
}

// state: null (বন্ধ) | { mode: 'add' } | { mode: 'edit', student }
export default function StudentFormModal({ state, onClose, onSaved }) {
  const isEdit = state?.mode === 'edit'
  return (
    <Modal open={state !== null} title={isEdit ? 'Edit student' : 'Add student'} onClose={onClose}>
      <StudentForm student={isEdit ? state.student : null} onClose={onClose} onSaved={onSaved} />
    </Modal>
  )
}