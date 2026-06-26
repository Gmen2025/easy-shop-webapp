import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { clearAuthError, loginUser } from '../features/auth/authSlice'
import { switchDatabase } from '../features/cart/cartSlice'
import {
  clearAccountState,
  resendVerification,
} from '../features/account/accountSlice'
import {
  getSelectedDatabaseName,
  setSelectedDatabaseName,
} from '../api/client'

function LoginPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { loading, error, loginDebug } = useSelector((state) => state.auth)
  const account = useSelector((state) => state.account)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedDatabase, setSelectedDatabase] = useState(getSelectedDatabaseName())

  const needsVerification =
    typeof error === 'string' &&
    error.toLowerCase().includes('verify your email before logging in')

  async function handleSubmit(event) {
    event.preventDefault()
    dispatch(clearAuthError())
    const currentDatabase = selectedDatabase || getSelectedDatabaseName()

    const primaryAction = await dispatch(
      loginUser({ email, password, databaseName: currentDatabase }),
    )
    if (loginUser.fulfilled.match(primaryAction)) {
      navigate('/')
      return
    }

    const primaryError = String(
      primaryAction?.payload?.message || primaryAction?.error?.message || '',
    )
    const alternateDatabase =
      currentDatabase === 'E_ShopUSA' ? 'E_Shopping' : 'E_ShopUSA'

    if (
      primaryError.toLowerCase().includes('user not found') &&
      alternateDatabase !== currentDatabase
    ) {
      dispatch(clearAuthError())
      const fallbackAction = await dispatch(
        loginUser({ email, password, databaseName: alternateDatabase }),
      )
      if (loginUser.fulfilled.match(fallbackAction)) {
        navigate('/')
        return
      }
    }
  }

  async function handleResendVerification() {
    if (!email) {
      return
    }

    dispatch(clearAccountState())
    await dispatch(resendVerification(email))
  }

  return (
    <section className="auth-wrap">
      <form className="panel auth-form" onSubmit={handleSubmit}>
        <h2>Welcome Back</h2>
        <p>Log in to place orders and track your purchases.</p>
        <p className="login-hint">
          Login uses the selected database in the header. If your verified
          account was created in the other store, the app will try it once
          automatically.
        </p>

        <div className="login-db-box">
          <label htmlFor="login-database">Store</label>
          <select
            id="login-database"
            value={selectedDatabase}
            onChange={(event) => {
              const nextDatabase = event.target.value
              setSelectedDatabase(nextDatabase)
              setSelectedDatabaseName(nextDatabase)
              dispatch(switchDatabase())
            }}
          >
            <option value="E_Shopping">Ethio</option>
            <option value="E_ShopUSA">USA</option>
          </select>
          <small>
            Current store database: {selectedDatabase === 'E_ShopUSA' ? 'USA' : 'Ethio'}
          </small>
        </div>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value.trimStart())}
          onBlur={() => setEmail((current) => current.trim().toLowerCase())}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {error ? <p className="form-error">{error}</p> : null}

        {error && loginDebug ? (
          <div className="login-debug-box" role="status">
            <strong>Login Debug Info</strong>
            <p>
              Attempted database: {loginDebug.databaseSent || 'not provided'}
            </p>
            <p>
              Backend selected: {loginDebug.selectedDatabase || 'not returned'}
            </p>
            <p>HTTP status: {loginDebug.status ?? 'unknown'}</p>
            <p>Content-Type: {loginDebug.contentType || 'unknown'}</p>
            {loginDebug.responseBody ? (
              <p>Server response: {loginDebug.responseBody}</p>
            ) : null}
          </div>
        ) : null}

        {needsVerification ? (
          <div className="status-card error-card">
            <p>Your account is not verified yet.</p>
            <p>Please check your inbox or resend the verification email.</p>
            <button
              type="button"
              className="ghost-button"
              onClick={handleResendVerification}
              disabled={!email || account.loading}
            >
              {account.loading ? 'Sending...' : 'Resend Verification Email'}
            </button>
            {account.message ? <p className="form-success">{account.message}</p> : null}
            {account.error ? <p className="form-error">{account.error}</p> : null}
            <p>
              You can also open <Link to={`/verify-email?email=${encodeURIComponent(email)}`}>verification help</Link>.
            </p>
          </div>
        ) : null}

        <button type="submit" className="solid-button" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>

        <p>
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>

        <p>
          No account yet? <Link to="/register">Register here</Link>
        </p>
      </form>
    </section>
  )
}

export default LoginPage