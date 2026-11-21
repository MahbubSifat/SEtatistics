import { cfClass, cfTitle } from '../dashboard/cf'
import '../dashboard/cf.css'

// data = backend এর platforms[p]: { username, rating, rank, ... }
export default function RatingCell({ platformKey, data }) {
  if (!data?.username) return <span className="dt__dash">No account</span>
  if (data.rating == null) return <span className="dt__dash">Unrated</span>

  const isCf = platformKey === 'codeforces'
  const rank = String(data.rank || '').toLowerCase()
  const sub = isCf ? cfTitle(rank) : platformKey === 'beecrowd' ? 'points' : data.rank
  return (
    <span className={`cfr ${isCf ? cfClass(rank) : ''}`}>
      <b className="num">{Math.round(data.rating)}</b>
      {sub ? <small>{sub}</small> : null}
    </span>
  )
}