import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { clearAuthError, registerUser } from '../features/auth/authSlice'
import SocialSignIn from '../components/SocialSignIn'

function RegisterPage() {
  const dispatch = useDispatch()
  const { loading, error, registerMessage } = useSelector((state) => state.auth)

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
  })

  function updateField(key, value) {
    setFormData((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    dispatch(clearAuthError())
    dispatch(registerUser(formData))
  }

  return (
    <section className="auth-wrap">
      <form className="panel auth-form mobile-auth-card" onSubmit={handleSubmit}>
        <div className="auth-brand"><strong>Addu Genet Eshop</strong><span>Global Products - Local Access</span></div>
        <h2>Create Your Account</h2>
        <p>Register using the Easy Shop API and verify by email.</p>

        <label htmlFor="name">Full Name
          <input
            id="name"
            value={formData.name}
            onChange={(event) => updateField('name', event.target.value)}
            required
          />
        </label>

        <label htmlFor="email">Email
          <input
            id="email"
            type="email"
            value={formData.email}
            onChange={(event) => updateField('email', event.target.value.trimStart())}
            onBlur={(event) => updateField('email', event.target.value.trim().toLowerCase())}
            required
          />
        </label>

        <label htmlFor="password">Password
          <input
            id="password"
            type="password"
            value={formData.password}
            onChange={(event) => updateField('password', event.target.value)}
            required
          />
        </label>

        <label htmlFor="phone">Phone
          <input
            id="phone"
            value={formData.phone}
            onChange={(event) => updateField('phone', event.target.value)}
            required
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}
        {registerMessage ? <p className="form-success">{registerMessage}</p> : null}

        <button type="submit" className="solid-button" disabled={loading}>
          {loading ? 'Creating account...' : 'Register'}
        </button>

        <p>
          Already have an account? <Link to="/login">Login</Link>
        </p>
        <SocialSignIn disabled={loading} />
        <p>
          Need a new verification email? <Link to="/verify-email">Verify Email</Link>
        </p>
      </form>
    </section>
  )
}

export default RegisterPage