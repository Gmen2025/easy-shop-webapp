import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useSearchParams } from 'react-router-dom'
import {
  clearAccountState,
  resendVerification,
  verifyEmail,
} from '../features/account/accountSlice'

function VerifyEmailPage() {
  const dispatch = useDispatch()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const queryEmail = searchParams.get('email') || ''
  const [email, setEmail] = useState(queryEmail)
  const { loading, error, message } = useSelector((state) => state.account)

  useEffect(() => {
    dispatch(clearAccountState())
    if (token && queryEmail) {
      dispatch(verifyEmail({ token, email: queryEmail }))
    }
  }, [dispatch, token, queryEmail])

  async function handleResend(event) {
    event.preventDefault()
    dispatch(clearAccountState())
    await dispatch(resendVerification(email))
  }

  return (
    <section className="auth-wrap">
      <div className="panel auth-form">
        <h2>Email Verification</h2>
        {token && queryEmail ? (
          <p>Verifying {queryEmail}...</p>
        ) : (
          <p>Paste your email to resend verification if needed.</p>
        )}

        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}

        <form className="auth-form" onSubmit={handleResend}>
          <label htmlFor="verification-email">Email</label>
          <input
            id="verification-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <button className="solid-button" type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Resend Verification'}
          </button>
        </form>

        <p>
          Continue to <Link to="/login">Login</Link>
        </p>
      </div>
    </section>
  )
}

export default VerifyEmailPage