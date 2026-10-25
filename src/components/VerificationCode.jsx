import { useEffect, useState } from 'react'
import { securityRequest } from '../api/auth'

export function VerificationCode({ value, onChange, backup = false, disabled = false }) {
  return <label className="verification-label">
    {backup ? 'Backup code' : 'Verification code'}
    <input className={`verification-code ${backup ? 'backup-code' : ''}`} value={value}
      onChange={(event) => onChange(backup ? event.target.value.trim() : event.target.value.replace(/\D/g, '').slice(0, 6))}
      autoComplete="one-time-code" inputMode={backup ? 'text' : 'numeric'} maxLength={backup ? 64 : 6}
      pattern={backup ? undefined : '[0-9]{6}'} required disabled={disabled}
      placeholder={backup ? 'Enter backup code' : '000000'} />
  </label>
}

export function EmailCodeResend({ challengeId, database, disabled = false, resendAfterSeconds = 60 }) {
  const [availableAt, setAvailableAt] = useState(() => Date.now() + resendAfterSeconds * 1000)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.ceil((availableAt - now) / 1000))
  async function resend() {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await securityRequest('2fa/resend', { challengeId }, database)
      setAvailableAt(Date.now() + (result.resendAfterSeconds || 60) * 1000)
      setNow(Date.now())
      setMessage('A new code was sent. Check your email.')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <div>
    <button className="ghost-button" type="button" onClick={resend} disabled={disabled || busy || seconds > 0}>
      {busy ? 'Sending...' : seconds ? `Resend code in ${seconds}s` : 'Resend email code'}
    </button>
    {message ? <p role="status">{message}</p> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
  </div>
}
