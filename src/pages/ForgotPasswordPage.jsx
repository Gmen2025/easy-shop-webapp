import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import {
  clearAccountState,
  requestPasswordReset,
} from '../features/account/accountSlice'

function ForgotPasswordPage() {
  const dispatch = useDispatch()
  const { loading, error, message } = useSelector((state) => state.account)
  const [email, setEmail] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    dispatch(clearAccountState())
    await dispatch(requestPasswordReset(email))
  }

  return (
    <section className="auth-wrap">
      <form className="panel auth-form" onSubmit={handleSubmit}>
        <h2>Forgot Password</h2>
        <p>Enter your email and we will send a reset link.</p>

        <label htmlFor="forgot-email">Email</label>
        <input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}

        <button className="solid-button" type="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>

        <p>
          Return to <Link to="/login">Login</Link>
        </p>
      </form>
    </section>
  )
}

export default ForgotPasswordPage