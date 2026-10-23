import { Outlet } from 'react-router-dom'
import Header from './Header'

function Layout() {
  return (
    <div className="shell">
      <Header />
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="panel">
        <p>AdduGenet EShop - Shopping, delivery, and related services.</p>
        <nav className="action-row" aria-label="Legal and support">
          <a href="/privacy.html">Privacy Policy</a>
          <a href="/terms.html">Terms of Service</a>
          <a href="/account-deletion.html">Account deletion</a>
          <a href="mailto:easyshop@addugeneteshop.com">Contact support</a>
        </nav>
      </footer>
    </div>
  )
}

export default Layout