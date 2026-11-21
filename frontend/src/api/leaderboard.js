import { api } from './client'

// Rank mode এ sort=rating: platform অনুযায়ী rating দিয়ে সাজায় ('all' = মোট solve)
export function getLeaderboard(period, { sort = 'solved', platform = 'all' } = {}) {
  const q = new URLSearchParams({ period, sort })
  if (sort === 'rating') q.set('platform', platform)
  return api(`/api/leaderboard?${q}`)
}