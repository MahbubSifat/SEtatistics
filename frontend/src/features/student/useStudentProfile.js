import { useEffect, useState } from 'react'
import { getStudent, getStudentStatistics } from '../../api/students'
import { getLeaderboard } from '../../api/leaderboard'
import { PERIODS } from '../leaderboard/periods'

const EMPTY = { status: 'loading', stats: null, student: null, boards: null, error: '' }

export default function useStudentProfile(id, version, attempt) {
  const [state, setState] = useState(EMPTY)

  useEffect(() => {
    let ignore = false
    setState((s) => (s.stats && String(s.stats.student.id) === String(id) ? s : EMPTY))

    ;(async () => {
      // শুধু এটাই জরুরি: না পেলে (404) তবেই "not found"
      let stats
      try {
        stats = await getStudentStatistics(id)
      } catch (err) {
        if (!ignore) setState({ ...EMPTY, status: err.status === 404 ? 'missing' : 'error', error: err.message })
        return
      }

      // বাকিগুলো ঐচ্ছিক: ফেল করলে শুধু ওই অংশ খালি থাকে
      const periods = PERIODS.map((p) => p.value)
      const [student, ...boardResults] = await Promise.allSettled([
        getStudent(id),
        ...periods.map((p) => getLeaderboard(p)),
      ])
      if (ignore) return
      const boards = {}
      periods.forEach((p, i) => {
        boards[p] = boardResults[i].status === 'fulfilled' ? boardResults[i].value.rows : null
      })
      setState({
        status: 'ready',
        stats,
        student: student.status === 'fulfilled' ? student.value : null,
        boards,
        error: '',
      })
    })()

    return () => {
      ignore = true
    }
  }, [id, version, attempt])

  return state
}