import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cancelSignIn, clearAuthError, finishSocialSignIn, loginUser, logout, verifyTwoFactor } from '../features/auth/authSlice'
import { exchangeSocialCallback } from '../api/auth'
import SocialSignIn from '../components/SocialSignIn'
import { EmailCodeResend, VerificationCode } from '../components/VerificationCode'
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
  const { loading, error, loginDebug, challenge, challengeDatabase } = useSelector((state) => state.auth)
  const location = useLocation()
  const callback = useRef(null)
  const [callbackBusy, setCallbackBusy] = useState(() => {
    const params = new URLSearchParams(location.search)
    return params.has('code') || params.has('error')
  })
  const [callbackError, setCallbackError] = useState('')
  const [code, setCode] = useState('')
  const [backup, setBackup] = useState(false)
  const account = useSelector((state) => state.account)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedDatabase, setSelectedDatabase] = useState(getSelectedDatabaseName())

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (!params.has('code') && !params.has('error')) return undefined
    let current = true
    if (!callback.current) {
      callback.current = exchangeSocialCallback(location.search)
        .then((result) => dispatch(finishSocialSignIn(result)).unwrap())
    }
    // Clear handoff codes from the address bar without interrupting the exchange.
    window.history.replaceState(window.history.state, '', '/login')
    callback.current.then((result) => {
      if (current && !result.data.requiresTwoFactor) navigate('/', { replace: true })
    }).catch((failure) => { if (current) setCallbackError(failure.message) })
      .finally(() => { if (current) setCallbackBusy(false) })
    return () => { current = false }
  }, [dispatch, location.search, navigate])

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
      if (!primaryAction.payload.requiresTwoFactor) navigate('/')
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
        if (!fallbackAction.payload.requiresTwoFactor) navigate('/')
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

  if (challenge) return <section className="auth-wrap">
    <form className="panel auth-form mobile-auth-card" onSubmit={async (event) => {
      event.preventDefault()
      const result = await dispatch(verifyTwoFactor({ code, useBackupCode: backup }))
      if (verifyTwoFactor.fulfilled.match(result)) {
        setCode('')
        if (!result.payload.data.requiresTwoFactor) navigate('/')
      }
    }}>
      <div className="auth-security-emblem" aria-hidden="true">&#128737;</div>
      <h1>Two-Factor Verification</h1>
      <p>{backup ? 'Enter one of your saved single-use backup codes.' : challenge.method === 'email' ?
        `Enter the 6-digit code sent to ${challenge.destination || 'your email'}.` :
        'Enter the 6-digit code from your authenticator app.'}</p>
      {challenge.deliveryError ? <p role="alert" className="form-error">{challenge.deliveryError}</p> : null}
      {challenge.expiresAt ? <p className="section-note">Challenge expires {new Date(challenge.expiresAt).toLocaleString()}. If expired, start sign-in again.</p> : null}
      <VerificationCode value={code} onChange={setCode} backup={backup} disabled={loading} />
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <button className="solid-button" disabled={loading || (backup ? !code.trim() : code.length !== 6)}>
        {loading ? 'Verifying...' : 'Verify & Sign In'}
      </button>
      <button type="button" className="ghost-button" disabled={loading} onClick={() => { setBackup(!backup); setCode('') }}>
        {backup ? 'Use Verification Code' : 'Use Backup Code'}
      </button>
      {challenge.method === 'email' ? <EmailCodeResend key={challenge.challengeId}
        challengeId={challenge.challengeId} database={challengeDatabase} disabled={loading} /> : null}
      <button type="button" className="ghost-button" disabled={loading} onClick={() => {
        dispatch(cancelSignIn()); setCode(''); setBackup(false); setPassword('')
      }}>Back to Sign In</button>
    </form>
  </section>

  return (
    <section className="auth-wrap">
      <form className="panel auth-form mobile-auth-card" onSubmit={handleSubmit}>
        <div className="auth-brand"><strong>Addu Genet Eshop</strong><span>Global Products - Local Access</span></div>
        <h2>Welcome Back</h2>
        <p>Log in to place orders and track your purchases.</p>
        <p className="login-hint">
          Login uses the selected database in the header. If your verified
          account was created in the other store, the app will try it once
          automatically.
        </p>

        <div className="login-db-box">
          <label htmlFor="login-database">Store
            <select
              id="login-database"
              disabled={loading || callbackBusy}
              value={selectedDatabase}
              onChange={(event) => {
                const nextDatabase = event.target.value
                if (nextDatabase === selectedDatabase) {
                  return
                }

                setSelectedDatabase(nextDatabase)
                dispatch(logout())
                sessionStorage.removeItem('socialSignIn')
                setSelectedDatabaseName(nextDatabase)
                dispatch(switchDatabase())
                window.location.assign('/login')
              }}
            >
              <option value="E_Shopping">Ethio</option>
              <option value="E_ShopUSA">USA</option>
            </select>
          </label>
          <small>
            Current store database: {selectedDatabase === 'E_ShopUSA' ? 'USA' : 'Ethio'}
          </small>
        </div>

        <label htmlFor="email">Email
          <input
            id="email"
            disabled={loading || callbackBusy}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value.trimStart())}
            onBlur={() => setEmail((current) => current.trim().toLowerCase())}
            required
          />
        </label>

        <label htmlFor="password">Password
          <input
            id="password"
            disabled={loading || callbackBusy}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}
        {callbackError ? <p role="alert" className="form-error">{callbackError}</p> : null}

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

        <button type="submit" className="solid-button" disabled={loading || callbackBusy}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
        <SocialSignIn disabled={loading || callbackBusy} />

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