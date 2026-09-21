import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../features/auth/authSlice'
import { switchDatabase } from '../features/cart/cartSlice'
import {
  getSelectedDatabaseName,
  setSelectedDatabaseName,
} from '../api/client'

function Header() {
  const dispatch = useDispatch()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const headerRef = useRef(null)
  const user = useSelector((state) => state.auth.user)
  const cartCount = useSelector((state) =>
    state.cart.items.reduce((sum, item) => sum + item.quantity, 0),
  )

  const selectedDb = getSelectedDatabaseName()

  useEffect(() => {
    function handleClickOutside(event) {
      if (!isMenuOpen) {
        return
      }

      if (!headerRef.current?.contains(event.target)) {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isMenuOpen])

  function closeMenu() {
    setIsMenuOpen(false)
  }

  return (
    <header className="topbar" ref={headerRef}>
      <div className="topbar-main">
        <button
          type="button"
          className="menu-toggle"
          aria-label="Toggle menu"
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

      <div
        id="header-menu"
        className={`header-menu${isMenuOpen ? ' open' : ''}`}
      >
        <div className="brand-wrap">
          <Link to="/" className="brand" onClick={closeMenu}>
            Addu Genet Easy Shop
          </Link>
        </div>

        <nav className="nav-links" aria-label="Main">
          <NavLink to="/" end onClick={closeMenu}>
            Shop
          </NavLink>
          {user ? (
            <NavLink to="/profile" onClick={closeMenu}>
              Profile
            </NavLink>
          ) : null}
          {user ? (
            <NavLink to="/service-request" onClick={closeMenu}>
              Request Service
            </NavLink>
          ) : null}
          <NavLink to="/orders" onClick={closeMenu}>
            My Orders
          </NavLink>
          <NavLink to="/cart" onClick={closeMenu}>
            Cart ({cartCount})
          </NavLink>
          {user?.isAdmin ? (
            <NavLink to="/admin" onClick={closeMenu}>
              Admin
            </NavLink>
          ) : null}
        </nav>

        <div className="header-controls">
          <select
            className="db-select"
            value={selectedDb}
            onChange={(event) => {
              const nextDatabase = event.target.value
              if (nextDatabase === selectedDb) {
                return
              }

              setSelectedDatabaseName(nextDatabase)
              dispatch(switchDatabase())
              window.location.reload()
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
    </header>
  )
}

export default Header