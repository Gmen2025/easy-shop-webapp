import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  clearAccountState,
  resetPassword,
  verifyResetToken,
} from '../features/account/accountSlice'
import LoadingState from '../components/LoadingState'

function ResetPasswordPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const email = searchParams.get('email') || ''

  const { loading, verifyingReset, resetTokenValid, error, message } = useSelector(
    (state) => state.account,
  )
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState('')

  const canSubmit = useMemo(() => {
    return Boolean(token && email && resetTokenValid)
  }, [token, email, resetTokenValid])

  useEffect(() => {
    dispatch(clearAccountState())
    if (token && email) {
      dispatch(verifyResetToken({ token, email }))
    }
  }, [dispatch, token, email])

  async function handleSubmit(event) {
    event.preventDefault()
    setLocalError('')
    dispatch(clearAccountState())

    if (newPassword.length < 6) {
      setLocalError('Password must be at least 6 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    const action = await dispatch(resetPassword({ token, email, newPassword }))
    if (resetPassword.fulfilled.match(action)) {
      setTimeout(() => navigate('/login'), 1200)
    }
  }

  if (verifyingReset) {
    return <LoadingState label="Checking reset link..." />
  }

  return (
    <section className="auth-wrap">
      <form className="panel auth-form" onSubmit={handleSubmit}>
        <h2>Reset Password</h2>
        <p>Email: {email || 'Unknown'}</p>

        {!token || !email ? (
          <p className="form-error">Reset link is incomplete.</p>
        ) : null}
        {resetTokenValid === false ? (
          <p className="form-error">Reset token is invalid or expired.</p>
        ) : null}

        <label htmlFor="new-password">New Password</label>
        <input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />

        <label htmlFor="confirm-password">Confirm Password</label>
        <input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />

        {localError ? <p className="form-error">{localError}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}

        <button className="solid-button" type="submit" disabled={!canSubmit || loading}>
          {loading ? 'Updating...' : 'Set New Password'}
        </button>

        <p>
          Return to <Link to="/login">Login</Link>
        </p>
      </form>
    </section>
  )
}

export default ResetPasswordPage