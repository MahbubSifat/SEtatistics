import { PERIODS } from '../leaderboard/periods'

// 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st
export function ordinalParts(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return [n, 'th']
  return [n, { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th']
}
export const ordinal = (n) => ordinalParts(n).join('')

export const medalOf = (rank) => ({ 1: 'gold', 2: 'silver', 3: 'bronze' })[rank] ?? null

// field = student এর username এর field, url = profile লিংক
export const PLATFORMS = [
  { key: 'codeforces', field: 'codeforces_id', name: 'CodeForces', short: 'CF', url: (u) => `https://codeforces.com/profile/${encodeURIComponent(u)}` },
  { key: 'leetcode', field: 'leetcode_id', name: 'LeetCode', short: 'LC', url: (u) => `https://leetcode.com/u/${encodeURIComponent(u)}/` },
  { key: 'codechef', field: 'codechef_id', name: 'CodeChef', short: 'CC', url: (u) => `https://www.codechef.com/users/${encodeURIComponent(u)}` },
  { key: 'beecrowd', field: 'beecrowd_id', name: 'Beecrowd', short: 'BC', unsynced: true, url: (u) => `https://judge.beecrowd.com/en/profile/${encodeURIComponent(u)}` },
]

// একটা platform এ সবার মধ্যে এই ছাত্রের অবস্থান
export function platformRank(rows, id, key) {
  const mine = rows.find((r) => r.id === id)?.by_platform?.[key] ?? 0
  return 1 + rows.filter((r) => (r.by_platform?.[key] ?? 0) > mine).length
}

export function platformBest(rows, key) {
  return Math.max(0, ...rows.map((r) => r.by_platform?.[key] ?? 0))
}

// প্রতিটা period এ: ছাত্র বনাম leader (ছাত্র নিজেই ১ নম্বর হলে ২ নম্বর)
export function buildComparison(id, boards) {
  return PERIODS.map((p) => {
    const rows = boards?.[p.value] ?? []
    const me = rows.find((r) => r.id === id)
    if (!me) return null
    const other = rows.find((r) => r.id !== id) ?? null
    return {
      key: p.value,
      label: p.column,
      total: rows.length,
      you: me.period_solved,
      youRank: me.rank,
      top: other ? other.period_solved : null,
      topRank: other ? other.rank : null,
      topName: other ? other.name : null,
    }
  }).filter(Boolean)
}

// cumulative solved: ৩০ দিন আগে → ৭ দিন আগে → আজ সকাল → এখন
export function buildSeries(total, periods) {
  const at = (back) => Math.max(0, total - (periods[back] ?? 0))
  return [
    { key: 'm30', label: '30 days ago', value: at('last-month') },
    { key: 'd7', label: '7 days ago', value: at('last-week') },
    { key: 'd0', label: 'Today', value: at('last-day') },
    { key: 'now', label: 'Now', value: total },
  ]
}

// leader এর series: প্রতিটা period এর leaderboard থেকে
export function seriesFromBoards(id, boards) {
  const get = (p) => boards[p]?.find((r) => r.id === id)?.period_solved ?? 0
  const total = boards['all-time']?.find((r) => r.id === id)?.total_solved ?? get('all-time')
  return buildSeries(total, {
    'last-day': get('last-day'),
    'last-week': get('last-week'),
    'last-month': get('last-month'),
  })
}