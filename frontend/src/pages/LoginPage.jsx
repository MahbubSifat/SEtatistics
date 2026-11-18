import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import usePageTitle from '../hooks/usePageTitle'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Icon from '../components/ui/Icon'
import Logo from '../components/ui/Logo'
import ThemeToggle from '../components/ui/ThemeToggle'
import './LoginPage.css'

const PLATFORMS = ['Codeforces', 'LeetCode', 'CodeChef', 'beecrowd']
const BARS = [24, 21, 19, 15, 11] // শুধু সাজানোর জন্য, আসল data না

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
    <main className="auth">
      <div className="auth__glow" aria-hidden="true" />

      <section className="auth__stage">
        <header className="auth__top">
          <Logo />
          <ThemeToggle />
        </header>

        <div className="auth__hero">
          <p className="auth__eyebrow">
            <span className="auth__pulse" aria-hidden="true" />
            Competitive programming tracker
          </p>
          <h1 className="auth__title">
            Solve.<br />Rank.<br /><span>Repeat.</span>
          </h1>
          <p className="auth__lead">
            One place to follow your department’s progress on Codeforces, LeetCode, CodeChef and beecrowd.
          </p>
          <ul className="auth__platforms" aria-label="Supported platforms">
            {PLATFORMS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>

        <div className="auth__board" aria-hidden="true">
          <div className="auth__board-head">
            <span>Leaderboard</span>
            <span>This week</span>
          </div>
          {BARS.map((v, i) => (
            <div key={v} className="auth__row" style={{ '--w': `${v * 4}%`, '--i': i }}>
              <span className="auth__rank">0{i + 1}</span>
              <span className="auth__track"><span className="auth__fill" /></span>
              <span className="auth__val">{v}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="auth__panel">
        <form className="auth__card" onSubmit={handleSubmit}>
          <div className="auth__card-head">
            <h2>Welcome back</h2>
            <p>Sign in to manage students and follow their progress.</p>
          </div>

          {error && (
            <p className="auth__error" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </p>
          )}

          <Input
            id="email" label="Email" type="email" icon="mail" required
            autoComplete="username" placeholder="Enter your email"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            id="password" label="Password" icon="lock" required
            autoComplete="current-password" placeholder="Enter your password"
            type={showPw ? 'text' : 'password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            suffix={
              <button
                type="button" className="field__toggle"
                aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}
                onClick={() => setShowPw((v) => !v)}
              >
                <Icon name={showPw ? 'eye-off' : 'eye'} size={18} />
              </button>
            }
          />

          <Button type="submit" loading={loading} className="auth__submit">
            Sign in <Icon name="arrow-right" size={18} />
          </Button>
        </form>

        <p className="auth__foot">Dept. of Software Engineering · UFTB</p>
      </section>
    </main>
  )
}