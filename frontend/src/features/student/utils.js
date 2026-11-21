// 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st
export function ordinalParts(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return [n, 'th']
  return [n, { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th']
}
export const ordinal = (n) => ordinalParts(n).join('')

// '2026-11-14' -> '14 Nov'
export const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })