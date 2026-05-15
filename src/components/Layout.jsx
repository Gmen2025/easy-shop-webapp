import { Outlet } from 'react-router-dom'
import Header from './Header'

function Layout() {
  return (
    <div className="shell">
      <Header />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout