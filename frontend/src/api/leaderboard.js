import { api } from './client'

export const getLeaderboard = (period) => api(`/api/leaderboard?period=${period}`)