import { Link } from 'react-router-dom'
import './NotFoundPage.css'

export default function NotFoundPage() {
  return (
    <main className="nf">
      <div className="nf__num" aria-hidden="true">404</div>
      <div className="nf__text">
        <p className="nf__eyebrow">PAGE NOT FOUND</p>
        <h1 className="nf__title">This page didn’t make the leaderboard.</h1>
        <Link to="/" className="btn btn--gold">Back to dashboard</Link>
      </div>
    </main>
  )
}