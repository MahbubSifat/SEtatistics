import { useEffect, useState } from 'react'
import { getStudentStatistics, listStudents } from '../../api/students'
import { getLeaderboard } from '../../api/leaderboard'
import { PERIODS } from '../leaderboard/periods'

const EMPTY = { status: 'loading', stats: null, student: null, boards: null, error: '' }

export default function useStudentProfile(id, version, attempt) {
  const [state, setState] = useState(EMPTY)

  useEffect(() => {
    let ignore = false
    // একই ছাত্রের data থাকলে সেটাই দেখাই, নতুনটা এলে বদলায়
    setState((s) => (s.stats && String(s.stats.student.id) === id ? s : EMPTY))

    const periods = PERIODS.map((p) => p.value)
    Promise.all([getStudentStatistics(id), listStudents(), ...periods.map((p) => getLeaderboard(p))])
      .then(([stats, students, ...boardResults]) => {
        if (ignore) return
        const boards = {}
        periods.forEach((p, i) => {
          boards[p] = boardResults[i].rows
        })
        const student = students.find((s) => String(s.id) === String(stats.student.id)) ?? null
        setState({ status: 'ready', stats, student, boards, error: '' })
      })
      .catch((err) => {
        if (!ignore) {
          setState({ ...EMPTY, status: err.status === 404 ? 'missing' : 'error', error: err.message })
        }
      })

    return () => {
      ignore = true
    }
  }, [id, version, attempt])

  return state
}