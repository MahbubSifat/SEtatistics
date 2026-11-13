import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import './LoginPage.css'
import usePageTitle from '../hooks/usePageTitle'

const PLATFORMS = ['Codeforces', 'LeetCode', 'CodeChef', 'beecrowd']
const BARS = [92, 78, 64, 51, 38] // শুধু সাজানোর জন্য, আসল data না

function ArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export default function LoginPage() {
  usePageTitle('Sign in')
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login">
      <section className="stage">
        <div className="stage__numeral" aria-hidden="true">01</div>

        <header className="stage__top">
          <span className="stage__brand">CP Tracker</span>
          <span className="stage__dept">Dept. of Software Engineering · UFTB</span>
        </header>

        <div className="stage__hero">
          <p className="stage__eyebrow">Competitive Programming · Leaderboard</p>
          <h1 className="stage__title">
            Solve.<br />Rank.<br /><em>Repeat.</em>
          </h1>
        </div>

        <ol className="stage__bars" aria-hidden="true">
          {BARS.map((w, i) => (
            <li key={i} style={{ '--w': `${w}%`, '--i': i }}>
              <span className="stage__bar-rank">0{i + 1}</span>
              <span className="stage__bar-track"><span className="stage__bar-fill" /></span>
            </li>
          ))}
        </ol>

        <div className="stage__ticker" aria-hidden="true">
          <div className="stage__ticker-track">
            {[0, 1].map((n) => (
              <span key={n}>
                {PLATFORMS.map((p) => <b key={p}>{p}</b>)}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="sheet">
        <form className="sheet__form" onSubmit={handleSubmit}>
          <p className="sheet__eyebrow">Staff access</p>
          <h2 className="sheet__title">Welcome back</h2>
          <p className="sheet__hint">Sign in to manage students and follow their progress.</p>

          {error && <p className="sheet__error" role="alert">{error}</p>}

          <Input variant="line" id="email" label="Email" type="email" required autoComplete="username"
                 value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input variant="line" id="password" label="Password" required autoComplete="current-password"
                 type={showPw ? 'text' : 'password'}
                 value={password} onChange={(e) => setPassword(e.target.value)}
                 suffix={
                   <button type="button" className="field__toggle" aria-pressed={showPw}
                           onClick={() => setShowPw((v) => !v)}>
                     {showPw ? 'Hide' : 'Show'}
                   </button>
                 } />

          <Button type="submit" loading={loading} className="sheet__submit">
            Sign in <ArrowIcon />
          </Button>
        </form>
      </section>
    </main>
  )
}