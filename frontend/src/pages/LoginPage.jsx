import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import './LoginPage.css'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      <section className="login__panel">
        <p className="login__eyebrow">COMPETITIVE PROGRAMMING</p>
        <h1 className="login__title">Student Tracker</h1>
        <p className="login__lead">
          Codeforces, LeetCode, CodeChef and beecrowd progress, ranked in one place.
        </p>
      </section>

      <section className="login__form-wrap">
        <form className="login__form" onSubmit={handleSubmit}>
          <h2>Sign in</h2>
          <p className="login__hint">For teachers and admins</p>

          {error && <p className="login__error" role="alert">{error}</p>}

          <Input id="email" label="Email" type="email" required autoComplete="username"
                 value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input id="password" label="Password" type="password" required autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)} />

          <Button type="submit" loading={loading}>Sign in</Button>
        </form>
      </section>
    </main>
  )
}