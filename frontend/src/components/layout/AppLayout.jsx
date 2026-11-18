import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SyncProvider } from '../../context/SyncContext'
import usePageTitle from '../../hooks/usePageTitle'
import Header from './Header'
import Footer from './Footer'
import SyncNotice from '../../features/sync/SyncNotice'
import './AppLayout.css'

const TITLES = {
  '/': 'Dashboard',
  '/students': 'Students',
  '/import': 'Import students',
}

function titleFor(pathname) {
  if (TITLES[pathname]) return TITLES[pathname]
  if (pathname.startsWith('/students/')) return 'Student'
  return 'Page not found'
}

export default function AppLayout() {
  const { pathname } = useLocation()
  usePageTitle(titleFor(pathname))
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <SyncProvider>
      <div className="shell">
        <a href="#content" className="skip-link">Skip to content</a>
        <Header />
        <SyncNotice />
        <div id="content" tabIndex={-1} className="shell__content">
          <Outlet />
        </div>
        <Footer />
      </div>
    </SyncProvider>
  )
}