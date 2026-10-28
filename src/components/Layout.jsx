import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'

function Layout() {
  const { pathname } = useLocation()
  const company = pathname === '/store-owner' || pathname.startsWith('/store-owner/') || pathname === '/driver' || pathname.startsWith('/driver/')
  return (
    <div className={`shell${pathname === '/admin' || pathname.startsWith('/admin/') || company ? ' admin-shell' : ''}`}>
      <Header />
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="site-footer-main">
            <section className="footer-brand" aria-label="About Addu Genet Easy Shop">
              <a className="footer-brand-link" href="/">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 8h14l1.5 13h-17L5 8Z" />
                  <path d="M8 8V6a4 4 0 0 1 8 0v2" />
                </svg>
                <span>Addu Genet Easy Shop</span>
              </a>
              <p>
                Shopping, delivery, and local services, all in one place.
              </p>
            </section>

            <nav className="footer-link-group" aria-label="Explore">
              <h2>Explore</h2>
              <a href="/">Shop</a>
              <a href="/stores">Stores</a>
              <a href="/cart">Cart</a>
            </nav>

            <nav className="footer-link-group" aria-label="Help and policies">
              <h2>Help &amp; policies</h2>
              <a href="/privacy.html">Privacy Policy</a>
              <a href="/terms.html">Terms of Service</a>
              <a href="/account-deletion.html">Account deletion</a>
            </nav>

            <section className="footer-contact">
              <h2>Need a hand?</h2>
              <p>We’re here to help with your shopping and delivery questions.</p>
              <a href="mailto:easyshop@addugeneteshop.com">
                Contact support <span aria-hidden="true">→</span>
              </a>
            </section>
          </div>

          <div className="site-footer-bottom">
            <span>© {new Date().getFullYear()} Addu Genet Easy Shop</span>
            <span>Made for easier everyday shopping.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Layout