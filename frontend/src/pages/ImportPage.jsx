import { useState } from 'react'
import { Link } from 'react-router-dom'
import { confirmImport, uploadExcel } from '../api/importExcel'
import { useToast } from '../context/ToastContext'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import FileDropzone from '../features/import/FileDropzone'
import ImportPreviewTable from '../features/import/ImportPreviewTable'
import '../features/import/import.css'

const STEPS = ['Upload', 'Preview', 'Done']
const REQUIRED = ['student_id', 'name', 'batch', 'email']
const OPTIONAL = ['codeforces_id', 'leetcode_id', 'codechef_id', 'beecrowd_id']

export default function ImportPage() {
  const toast = useToast()
  const [phase, setPhase] = useState('upload') // upload | uploading | preview | importing | done
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const step = phase === 'done' ? 2 : phase === 'preview' || phase === 'importing' ? 1 : 0

  async function handleFile(file) {
    setError('')
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('Please choose an .xlsx Excel file.')
      return
    }
    setFileName(file.name)
    setPhase('uploading')
    try {
      setPreview(await uploadExcel(file))
      setPhase('preview')
    } catch (err) {
      setError(err.message)
      setPhase('upload')
    }
  }

  async function handleConfirm() {
    setError('')
    setPhase('importing')
    try {
      const r = await confirmImport(preview.import_id)
      setResult(r)
      setPhase('done')
      toast(`${r.imported} ${r.imported === 1 ? 'student' : 'students'} imported`)
    } catch (err) {
      if (err.status === 404) {
        setError('This preview has expired (the server may have restarted). Please upload the file again.')
        setPreview(null)
        setPhase('upload')
      } else {
        setError(err.message)
        setPhase('preview')
      }
    }
  }

  function reset() {
    setPhase('upload')
    setPreview(null)
    setResult(null)
    setError('')
    setFileName('')
  }

  const bad = preview?.error_count ?? 0
  const one = bad === 1

  return (
    <main className="imp container container--wide">
      <header className="imp__head">
        <h1 className="imp__title">Import students</h1>
        <p className="imp__sub">Upload an Excel file, review it, then confirm. Nothing is saved until you confirm.</p>
      </header>

      <ol className="imp__steps" aria-label="Import progress">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`imp__step${i === step ? ' is-current' : i < step ? ' is-done' : ''}`}
            aria-current={i === step ? 'step' : undefined}
          >
            <span className="imp__n num">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {error && (
        <p className="imp__error" role="alert">
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </p>
      )}

      {(phase === 'upload' || phase === 'uploading') && (
        <>
          <FileDropzone onFile={handleFile} disabled={phase === 'uploading'} />
          {phase === 'uploading' && <p className="imp__busy" role="status">Reading {fileName}…</p>}

          <div className="imp__guide">
            <div className="imp__guide-card">
              <h2>Required columns</h2>
              <div className="imp__codes">{REQUIRED.map((c) => <code key={c}>{c}</code>)}</div>
            </div>
            <div className="imp__guide-card">
              <h2>Optional columns</h2>
              <div className="imp__codes">{OPTIONAL.map((c) => <code key={c}>{c}</code>)}</div>
            </div>
            <p className="imp__guide-note">
              Capital letters and spaces in headings are fixed automatically (Student ID becomes student_id).
              Every Student ID must be unique.
            </p>
          </div>
        </>
      )}

      {(phase === 'preview' || phase === 'importing') && preview && (
        <>
          <div className="imp__summary">
            <div><span className="imp__summary-n">{preview.total_rows}</span><span>rows read</span></div>
            <div><span className="imp__summary-n imp__summary-n--ok">{preview.valid_count}</span><span>ready to import</span></div>
            <div><span className={`imp__summary-n${bad ? ' imp__summary-n--bad' : ''}`}>{bad}</span><span>with problems</span></div>
          </div>

          {bad > 0 && (
            <p className="imp__note">
              {bad} {one ? 'row has' : 'rows have'} problems and will be skipped. Fix {one ? 'it' : 'them'} in Excel and
              upload again if you need {one ? 'it' : 'them'}.
            </p>
          )}

          <ImportPreviewTable rows={preview.rows} />

          <div className="imp__actions">
            <Button variant="ghost" onClick={reset} disabled={phase === 'importing'}>Cancel</Button>
            <Button onClick={handleConfirm} loading={phase === 'importing'} disabled={preview.valid_count === 0}>
              Import {preview.valid_count} {preview.valid_count === 1 ? 'student' : 'students'}
            </Button>
          </div>
        </>
      )}

      {phase === 'done' && result && (
        <div className="imp__done">
          <span className="imp__done-icon" aria-hidden="true"><Icon name="check" size={28} /></span>
          <span className="imp__done-n">{result.imported}</span>
          <p className="imp__done-label">{result.imported === 1 ? 'student imported' : 'students imported'}</p>
          {result.skipped > 0 && <p className="imp__done-skipped">{result.skipped} skipped</p>}
          <p className="imp__done-hint">Add their platform usernames if missing, then run Sync from the top bar.</p>
          <div className="imp__actions imp__actions--center">
            <Button variant="ghost" onClick={reset}>Import another file</Button>
            <Link to="/students" className="btn btn--primary">View students</Link>
          </div>
        </div>
      )}
    </main>
  )
}