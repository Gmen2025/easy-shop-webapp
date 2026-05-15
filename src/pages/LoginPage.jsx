import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { clearAuthError, loginUser } from '../features/auth/authSlice'

function LoginPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { loading, error } = useSelector((state) => state.auth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    dispatch(clearAuthError())
    const action = await dispatch(loginUser({ email, password }))
    if (loginUser.fulfilled.match(action)) {
      navigate('/')
    }
  }

  return (
    <section className="auth-wrap">
      <form className="panel auth-form" onSubmit={handleSubmit}>
        <h2>Welcome Back</h2>
        <p>Log in to place orders and track your purchases.</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
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