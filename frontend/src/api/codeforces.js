// Codeforces এর public API: login বা key লাগে না। শুধু rating ও title আনি।
const URL = 'https://codeforces.com/api/user.info'

export async function fetchCodeforcesRatings(handles) {
  let list = [...new Set(handles.filter(Boolean).map((h) => h.toLowerCase()))]
  const out = {}

  for (let attempt = 0; attempt < 6 && list.length > 0; attempt += 1) {
    let data
    try {
      const res = await fetch(`${URL}?handles=${list.map(encodeURIComponent).join(';')}`)
      data = await res.json()
    } catch {
      throw new Error('Could not reach Codeforces from the browser')
    }

    if (data.status === 'OK') {
      data.result.forEach((u) => {
        out[u.handle.toLowerCase()] = {
          rating: u.rating ?? null,
          rank: u.rank ?? null,
          maxRating: u.maxRating ?? null,
        }
      })
      return out
    }

    // একটা handle ভুল হলে পুরো request ফেল করে: ওটা বাদ দিয়ে আবার চেষ্টা
    const m = /User with handle (.+?) not found/i.exec(data.comment || '')
    if (!m) throw new Error(data.comment || 'Codeforces request failed')
    list = list.filter((h) => h !== m[1].toLowerCase())
  }
  return out
}