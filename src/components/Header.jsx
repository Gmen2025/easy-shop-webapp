import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../features/auth/authSlice'
import NotificationBell from './NotificationBell'
import { companyTabs, isCompanyDriver, isCompanyStoreOwner } from '../utils/company'
import { switchDatabase } from '../features/cart/cartSlice'
import {
  getSelectedDatabaseName,
  setSelectedDatabaseName,
} from '../api/client'

const iconPaths = {
  bag: <><path d="M5 8h14l1.5 13h-17L5 8Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>,
  shop: <><path d="M4 9h16l-1.2 12H5.2L4 9Z" /><path d="M3 9 5 3h14l2 6" /><path d="M8 9v3m4-3v3m4-3v3" /></>,
  store: <><path d="M3 10h18l-1.5-6h-15L3 10Z" /><path d="M5 10v10h14V10M9 20v-6h6v6" /><path d="M3 10a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" /></>,
  cart: <><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.5a2 2 0 0 0 2-1.6L21 8H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
  orders: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5a3 3 0 0 1 6 0M9 10h6m-6 4h6m-6 4h4" /></>,
  ride: <><path d="m5 11 1.5-5h11l1.5 5 1 2v6h-2v-2H5v2H3v-6l2-2Z" /><path d="M6 13h12M7 16h.01M17 16h.01" /></>,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  package: <><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z" /><path d="m3.5 8.5 8.5 5 8.5-5M12 13.5V21m-8.5-13 8.5-5 8.5 5" /></>,
  wrench: <><path d="M14 6a5 5 0 0 0-6 6L3 17a2.1 2.1 0 0 0 3 3l5-5a5 5 0 0 0 6-6l-3 3-3-3 3-3Z" /><path d="m14 6 4-4 4 4-4 4" /></>,
  service: <><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2H4Z" /></>,
  driver: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v5m0 8v5M3 12h5m8 0h5" /></>,
  admin: <><path d="M12 3 20 7v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4Z" /><path d="m9 12 2 2 4-4" /></>,
}

function MenuIcon({ name, className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  )
}

function MenuSection({ title, icon, items, cartCount, onNavigate }) {
  if (!items.length) return null

  return (
    <section className="menu-section">
      <h3 className="menu-section-title">
        <MenuIcon name={icon} />
        {title}
      </h3>
      <nav
        className={`menu-section-links${items.length > 1 ? ' two-column' : ''}`}
        aria-label={title}
        style={items.length > 1
          ? { gridTemplateRows: `repeat(${Math.ceil(items.length / 2)}, minmax(3rem, auto))` }
          : undefined}
      >
        {items.map(({ to, label, icon: itemIcon, end }) => (
          <NavLink key={to} to={to} end={end} className="menu-item" onClick={onNavigate}>
            <MenuIcon name={itemIcon} className="menu-item-icon" />
            <span>{label === 'Cart' ? `Cart (${cartCount})` : label}</span>
            <span className="menu-item-chevron" aria-hidden="true">›</span>
          </NavLink>
        ))}
      </nav>
    </section>
  )
}

function Header() {
  const dispatch = useDispatch()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const headerRef = useRef(null)
  const menuCloseRef = useRef(null)
  const user = useSelector((state) => state.auth.user)
  const cartCount = useSelector((state) =>
    state.cart.items.reduce((sum, item) => sum + item.quantity, 0),
  )
  const selectedDb = getSelectedDatabaseName()

  useEffect(() => {
    function handleClickOutside(event) {
      if (isMenuOpen && !headerRef.current?.contains(event.target)) {
        setIsMenuOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') setIsMenuOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isMenuOpen])

  useEffect(() => {
    if (isMenuOpen) menuCloseRef.current?.focus()
  }, [isMenuOpen])

  function closeMenu() {
    setIsMenuOpen(false)
  }

  const shoppingItems = [
    { to: '/', label: 'Shop', icon: 'bag', end: true },
    { to: '/stores', label: 'Stores', icon: 'store' },
    { to: '/cart', label: 'Cart', icon: 'cart' },
    { to: '/orders', label: 'My Orders', icon: 'orders' },
  ]
  const deliveryItems = user
    ? [
        { to: '/rides', label: 'Book a Ride', icon: 'ride' },
        { to: '/rides/mine', label: 'My Rides', icon: 'pin' },
        { to: '/delivery-checkouts', label: 'Delivery Checkouts', icon: 'package' },
      ]
    : []
  const serviceItems = user
    ? [
        { to: '/service-request', label: 'Request Service', icon: 'service' },
        { to: '/service-requests', label: 'Service Requests', icon: 'orders' },
      ]
    : []
  const businessItems = [
    ...(isCompanyStoreOwner(user)
      ? [{ to: '/store-owner', label: 'Store Owner', icon: 'user' }]
      : []),
    ...(isCompanyDriver(user)
      ? [{ to: '/driver', label: 'Company Driver', icon: 'driver' }]
      : []),
  ]
  const accountItems = [
    ...(user ? [{ to: '/profile', label: 'Profile', icon: 'user' }] : []),
    ...(user?.isAdmin ? [{ to: '/admin', label: 'Admin', icon: 'admin' }] : []),
  ]

  return (
    <div className="header-container" ref={headerRef}>
      <header className="topbar">
        <div className="topbar-main">
          <Link to="/" className="brand topbar-brand" onClick={closeMenu}>
            <MenuIcon name="bag" className="brand-icon" />
            <span>Addu Genet Easy Shop</span>
          </Link>
          <button
            type="button"
            className="menu-toggle"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMenuOpen}
            aria-controls="header-menu"
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <span />
            <span />
            <span />
          </button>

          <div className="header-auth">
            {user ? (
              <>
                <NotificationBell key={`${selectedDb}:${user.id || user._id}`} onOpen={closeMenu} />
                <span className="hello">Hi, {user.name}</span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => dispatch(logout())}
                >
                  Logout
                </button>
              </>
            ) : (
              <Link className="ghost-button" to="/login">
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {isMenuOpen ? (
        <>
          <button
            type="button"
            className="menu-backdrop"
            aria-label="Close menu"
            onClick={closeMenu}
          />
          <div
            id="header-menu"
            className="header-menu open"
            role="dialog"
            aria-modal="true"
            aria-labelledby="header-menu-title"
          >
            <div className="menu-heading">
              <h2 id="header-menu-title">Menu</h2>
              <button
                ref={menuCloseRef}
                type="button"
                className="menu-close"
                aria-label="Close menu"
                onClick={closeMenu}
              >
                ×
              </button>
            </div>
            <div className="menu-content">
              <MenuSection title="Shopping" icon="cart" items={shoppingItems} cartCount={cartCount} onNavigate={closeMenu} />
              <MenuSection title="Delivery" icon="driver" items={deliveryItems} cartCount={cartCount} onNavigate={closeMenu} />
              <MenuSection title="Services" icon="wrench" items={serviceItems} cartCount={cartCount} onNavigate={closeMenu} />
              <MenuSection title="Business" icon="store" items={businessItems} cartCount={cartCount} onNavigate={closeMenu} />
              <MenuSection title="Account" icon="user" items={accountItems} cartCount={cartCount} onNavigate={closeMenu} />
              <div className="header-controls">
                <select
                  className="db-select"
                  value={selectedDb}
                  onChange={(event) => {
                    const nextDatabase = event.target.value
                    if (nextDatabase === selectedDb) return

                    dispatch(logout())
                    sessionStorage.removeItem('socialSignIn')
                    setSelectedDatabaseName(nextDatabase)
                    dispatch(switchDatabase())
                    window.location.assign('/login')
                  }}
                  aria-label="Select database"
                >
                  <option value="">Default DB</option>
                  <option value="E_Shopping">Ethio</option>
                  <option value="E_ShopUSA">USA</option>
                </select>
                {user ? null : (
                  <Link className="solid-button" to="/register" onClick={closeMenu}>
                    Create Account
                  </Link>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}

      <nav className="mobile-tabbar" aria-label="Quick navigation">
        {companyTabs(user).map(({ to, label, icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={closeMenu}>
            <span aria-hidden="true">
              {icon === 'home' ? '⌂' : icon === 'store' ? '▦' : icon === 'cart' ? '🛒' : icon === 'driver' ? '🚚' : '●'}
            </span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default Header
