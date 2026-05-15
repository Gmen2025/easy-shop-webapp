import { Link, NavLink } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../features/auth/authSlice'
import {
  getSelectedDatabaseName,
  setSelectedDatabaseName,
} from '../api/client'

function Header() {
  const dispatch = useDispatch()
  const user = useSelector((state) => state.auth.user)
  const cartCount = useSelector((state) =>
    state.cart.items.reduce((sum, item) => sum + item.quantity, 0),
  )

  const selectedDb = getSelectedDatabaseName()

  return (
    <header className="topbar">
      <div className="brand-wrap">
        <Link to="/" className="brand">
          Addis Market
        </Link>
        <p className="tagline">React + Redux storefront for Easy Shop API</p>
      </div>

      <nav className="nav-links" aria-label="Main">
        <NavLink to="/" end>
          Shop
        </NavLink>
        <NavLink to="/orders">My Orders</NavLink>
        <NavLink to="/cart">Cart ({cartCount})</NavLink>
        {user?.isAdmin ? <NavLink to="/admin">Admin</NavLink> : null}
      </nav>

      <div className="header-controls">
        <select
          className="db-select"
          value={selectedDb}
          onChange={(event) => setSelectedDatabaseName(event.target.value)}
          aria-label="Select database"
        >
          <option value="">Default DB</option>
          <option value="E_Shopping">E_Shopping</option>
          <option value="E_Shopping_2">E_Shopping_2</option>
        </select>

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
          <>
            <Link className="ghost-button" to="/login">
              Login
            </Link>
            <Link className="solid-button" to="/register">
              Create Account
            </Link>
          </>
        )}
      </div>
    </header>
  )
}

export default Header