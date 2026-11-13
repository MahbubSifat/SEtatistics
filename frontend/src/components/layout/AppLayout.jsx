import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SyncProvider } from '../../context/SyncContext'
import usePageTitle from '../../hooks/usePageTitle'
import Masthead from './Masthead'
import SyncNotice from '../../features/sync/SyncNotice'

const TITLES = {
  '/': 'Dashboard',
  '/leaderboard': 'Leaderboard',
  '/students': 'Students',
  '/import': 'Import students',
}

function titleFor(pathname) {
  if (TITLES[pathname]) return TITLES[pathname]
  if (pathname.startsWith('/students/')) return 'Student details'
  return 'Page not found'
}

export default function AppLayout() {
  const { pathname } = useLocation()
  usePageTitle(titleFor(pathname)) // tab এর নাম বদলায়
  useEffect(() => {
    window.scrollTo(0, 0) // নতুন page এ গেলে উপরে
  }, [pathname])

  return (
    <SyncProvider>
      <a href="#content" className="skip-link">Skip to content</a>
      <Masthead />
      <SyncNotice />
      <div id="content" tabIndex={-1}>
        <Outlet />
      </div>
    </SyncProvider>
  )
}