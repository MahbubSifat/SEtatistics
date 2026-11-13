import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'

// সাময়িক: পরের steps এ আসল page দিয়ে বদলাব
function Stub({ title }) {
  return (
    <main className="container" style={{ paddingBlock: 'var(--space-12)' }}>
      <h1>{title}</h1>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Stub title="Dashboard" />} />
          <Route path="/leaderboard" element={<Stub title="Leaderboard" />} />
          <Route path="/students" element={<Stub title="Students" />} />
          <Route path="/import" element={<Stub title="Import" />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}