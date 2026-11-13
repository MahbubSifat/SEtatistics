import { Outlet } from 'react-router-dom'
import { SyncProvider } from '../../context/SyncContext'
import Masthead from './Masthead'
import SyncNotice from '../../features/sync/SyncNotice'

export default function AppLayout() {
  return (
    <SyncProvider>
      <Masthead />
      <SyncNotice />
      <Outlet />
    </SyncProvider>
  )
}