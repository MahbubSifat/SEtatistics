import { Outlet } from 'react-router-dom'
import Masthead from './Masthead'

export default function AppLayout() {
  return (
    <>
      <Masthead />
      <Outlet />
    </>
  )
}