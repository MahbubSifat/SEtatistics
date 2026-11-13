import { useState } from 'react'
import { Link } from 'react-router-dom'
import { confirmImport, uploadExcel } from '../api/importExcel'
import { useToast } from '../context/ToastContext'
import Button from '../components/ui/Button'
import FileDropzone from '../features/import/FileDropzone'
import ImportPreviewTable from '../features/import/ImportPreviewTable'
import '../features/leaderboard/leaderboard.css' // hero style
import '../features/import/import.css'

const STEPS = ['Upload', 'Preview', 'Done']

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

  return (
    <main>
      <section className="lb-hero">
        <div className="container">
          <p className="lb-hero__eyebrow">BULK IMPORT</p>
          <h1 className="lb-hero__title">Import students</h1>
          <p className="lb-hero__sub">Upload an Excel file, review it, then confirm. Nothing is saved until you confirm.</p>
        </div>
      </section>

      <div className="container im-body">
        <ol className="im-steps" aria-label="Import progress">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="im-steps__n num">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>

        {error && <p className="im-error" role="alert">{error}</p>}

        {(phase === 'upload' || phase === 'uploading') && (
          <>
            <FileDropzone onFile={handleFile} disabled={phase === 'uploading'} />
            {phase === 'uploading' && <p className="im-busy" role="status">Reading {fileName}…</p>}

            <div className="im-guide">
              <div>
                <h2>Required columns</h2>
                <p className="num">student_id · name · batch · email</p>
              </div>
              <div>
                <h2>Optional columns</h2>
                <p className="num">codeforces_id · leetcode_id · codechef_id · beecrowd_id</p>
              </div>
              <p className="im-guide__note">
                Capital letters and spaces in headings are fixed automatically (Student ID becomes student_id).
                Every Student ID must be unique.
              </p>
            </div>
          </>
        )}

        {(phase === 'preview' || phase === 'importing') && preview && (
          <>
            <div className="im-summary">
              <div><span className="im-summary__n">{preview.total_rows}</span><span>rows read</span></div>
              <div><span className="im-summary__n im-summary__n--ok">{preview.valid_count}</span><span>ready to import</span></div>
              <div><span className={`im-summary__n${preview.error_count ? ' im-summary__n--bad' : ''}`}>{preview.error_count}</span><span>with problems</span></div>
            </div>

            {preview.error_count > 0 && (
              <p className="lb-note">
                {preview.error_count} {preview.error_count === 1 ? 'row has' : 'rows have'} problems and will be skipped.
                Fix {preview.error_count === 1 ? 'it' : 'them'} in Excel and upload again if you need {preview.error_count === 1 ? 'it' : 'them'}.
              </p>
            )}

            <ImportPreviewTable rows={preview.rows} />

            <div className="im-actions">
              <Button variant="ghost" onClick={reset} disabled={phase === 'importing'}>Cancel</Button>
              <Button onClick={handleConfirm} loading={phase === 'importing'} disabled={preview.valid_count === 0}>
                Import {preview.valid_count} {preview.valid_count === 1 ? 'student' : 'students'}
              </Button>
            </div>
          </>
        )}

        {phase === 'done' && result && (
          <div className="im-done">
            <span className="im-done__n">{result.imported}</span>
            <p className="im-done__label">{result.imported === 1 ? 'student imported' : 'students imported'}</p>
            {result.skipped > 0 && <p className="im-done__skipped">{result.skipped} skipped</p>}
            <p className="im-done__hint">Add their platform usernames if missing, then run Sync from the top bar.</p>
            <div className="im-actions im-actions--center">
              <Button variant="ghost" onClick={reset}>Import another file</Button>
              <Link to="/students" className="btn btn--primary">View students</Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}