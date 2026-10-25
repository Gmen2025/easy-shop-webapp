import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { securityRequest } from '../api/auth'
import { EmailCodeResend, VerificationCode } from '../components/VerificationCode'

function readSecurity(data) {
  if (typeof data?.enabled !== 'boolean' || !Array.isArray(data.providers) ||
    (data.enabled && !['email', 'authenticator'].includes(data.method))) throw new Error('Invalid security settings response.')
  return data
}

export default function SecuritySettingsPage() {
  const [security, setSecurity] = useState(null)
  const [step, setStep] = useState('settings')
  const [method, setMethod] = useState('authenticator')
  const [setup, setSetup] = useState(null)
  const [management, setManagement] = useState(null)
  const [code, setCode] = useState('')
  const [backup, setBackup] = useState(false)
  const [codes, setCodes] = useState([])
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const guard = useRef(false)
  const codesDialog = useRef(null)

  useEffect(() => {
    let current = true
    securityRequest('security').then((data) => { if (current) setSecurity(readSecurity(data)) })
      .catch((failure) => { if (current) setError(failure.message) })
      .finally(() => { if (current) setBusy(false) })
    return () => { current = false }
  }, [])

  useEffect(() => {
    if (!codes.length) return undefined
    codesDialog.current?.showModal()
    const warn = (event) => { if (!saved) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [codes, saved])

  async function run(action) {
    if (guard.current) return
    guard.current = true; setBusy(true); setError('')
    try { await action() } catch (failure) { setError(failure.message) }
    finally { guard.current = false; setBusy(false) }
  }
  function back() {
    setSetup(null); setManagement(null); setCode(''); setBackup(false); setError(''); setStep('settings')
  }
  function showCodes(result) {
    if (!Array.isArray(result.backupCodes) || !result.backupCodes.length ||
      result.backupCodes.some((item) => typeof item !== 'string' || !item)) {
      throw new Error('The server did not return backup codes. Open Recovery Options to generate new codes.')
    }
    setSaved(false); setCodes(result.backupCodes); setCode(''); setSetup(null)
    setSecurity((previous) => ({ ...previous, backupCodesRemaining: result.backupCodes.length }))
  }
  async function setupFactor() {
    const result = await securityRequest('2fa/setup', { method })
    if (!result.setupId) throw new Error('The server did not return a setup challenge. Start setup again.')
    let qr
    if (method === 'authenticator') {
      if (!result.secret || !result.otpauthUri?.startsWith('otpauth://totp/')) throw new Error('Invalid authenticator setup response.')
      const { default: QRCode } = await import('qrcode')
      qr = await QRCode.toDataURL(result.otpauthUri, { width: 220, margin: 2 })
    }
    setSetup({ ...result, qr }); setCode(''); setStep('confirm')
  }
  async function startManagement(target) {
    setManagement(null); setCode(''); setBackup(false); setStep(target)
    if (security.method === 'email') setManagement(await securityRequest('2fa/send-code', {}))
  }
  async function confirm(event) {
    event.preventDefault()
    await run(async () => {
      if (step === 'confirm') {
        const result = await securityRequest('2fa/enable', { setupId: setup.setupId, code })
        setSecurity((previous) => ({ ...previous, enabled: true, method }))
        setStep('settings')
        showCodes(result)
      } else {
        const payload = { code: code.trim(), useBackupCode: backup,
          ...(management?.challengeId ? { challengeId: management.challengeId } : {}) }
        if (step === 'disable') {
          await securityRequest('2fa/disable', payload)
          setSecurity((previous) => ({ ...previous, enabled: false, method: null, backupCodesRemaining: 0 }))
          back()
        } else {
          const result = await securityRequest('2fa/recovery', payload)
          setStep('settings')
          showCodes(result)
        }
      }
    })
  }

  return <section className="auth-wrap">
    <div className="panel auth-form mobile-auth-card security-settings">
      {step === 'settings' ? <Link to="/profile">Back to My Account</Link> :
        <button className="ghost-button" type="button" disabled={busy} onClick={back}>Back to Security Settings</button>}
      <div className="auth-security-emblem" aria-hidden="true">&#128737;</div>
      <h1>{step === 'settings' ? 'Security Settings' : step === 'setup' ? 'Two-Factor Authentication' :
        step === 'confirm' ? 'Verify Your Setup' : step === 'disable' ? 'Disable Two-Factor Authentication' : 'Generate Backup Codes'}</h1>
      {step === 'settings' ? <>
        <div className="security-status">
          <strong>Two-Factor Authentication</strong>
          <p>{security ? security.enabled ? `Enabled with ${security.method === 'email' ? 'email' : 'an authenticator app'}.` :
            'Add an extra layer of account security.' : 'Loading security settings...'}</p>
          <button type="button" role="switch" aria-label="Two-factor authentication" aria-checked={security?.enabled === true}
            className="solid-button" disabled={busy || !security} onClick={() => security.enabled ?
              run(() => startManagement('disable')) : setStep('setup')}>
            {security?.enabled ? 'Enabled - manage protection' : 'Set Up Two-Factor Authentication'}
          </button>
        </div>
        {security?.enabled ? <>
          <button type="button" className="ghost-button" disabled={busy} onClick={() => run(() => startManagement('recovery'))}>Recovery Options</button>
          <p>{security.backupCodesRemaining} backup codes remaining. New codes replace all previous codes.</p>
        </> : null}
        <div className="security-status"><strong>Sign-in Providers</strong>
          <p>{security?.providers.length ? security.providers.map((provider) =>
            typeof provider === 'string' ? provider : provider.provider).join(', ') : 'No social provider is linked to this account.'}</p>
        </div>
        <p className="section-note">Keep backup codes somewhere safe. Verification will be required for password and social sign-in when 2FA is enabled.</p>
        {!security ? <button type="button" className="ghost-button" disabled={busy}
          onClick={() => run(async () => setSecurity(readSecurity(await securityRequest('security'))))}>Retry loading security settings</button> : null}
      </> : null}
      {step === 'setup' ? <>
        <p>Add an extra layer of security to your account.</p>
        <fieldset disabled={busy} className="security-methods"><legend>Choose verification method</legend>
          <label><input type="radio" name="method" checked={method === 'authenticator'} onChange={() => setMethod('authenticator')} />
            <span><strong>Authenticator App</strong><small>Use Google Authenticator, Authy, or a similar app.</small></span></label>
          <label><input type="radio" name="method" checked={method === 'email'} onChange={() => setMethod('email')} />
            <span><strong>Email</strong><small>Receive codes at your verified email address.</small></span></label>
        </fieldset>
        <button className="solid-button" type="button" disabled={busy} onClick={() => run(setupFactor)}>Continue to Verification</button>
      </> : null}
      {['confirm', 'disable', 'recovery'].includes(step) ? <form className="security-code-form" onSubmit={confirm}>
        {step === 'confirm' ? <>
          {method === 'authenticator' ? <>
            <p>Scan this QR code in your authenticator app, or enter the setup key manually.</p>
            {setup?.qr ? <img className="security-qr" src={setup.qr} alt="Authenticator setup QR code" /> : null}
            <code className="security-secret">{setup?.secret}</code>
          </> : <p>Enter the 6-digit code sent to {setup?.destination || 'your email'}.</p>}
          <p className="section-note">Setup expires automatically. If expired, go back and start setup again.</p>
        </> : <p>{step === 'disable' ? 'Confirm your current second factor to disable protection.' :
          'Confirm your current second factor. New backup codes replace all previous codes.'}</p>}
        <VerificationCode value={code} onChange={setCode} backup={backup} disabled={busy} />
        <button className="solid-button" disabled={busy || (backup ? !code.trim() : code.length !== 6)}>
          {busy ? 'Please wait...' : step === 'confirm' ? 'Enable 2FA' : step === 'disable' ? 'Confirm Disable' : 'Generate New Codes'}
        </button>
        {step !== 'confirm' ? <button type="button" className="ghost-button" disabled={busy}
          onClick={() => { setBackup(!backup); setCode('') }}>{backup ? 'Use Verification Code' : 'Use Backup Code'}</button> : null}
        {(step === 'confirm' ? method : security?.method) === 'email' ? <>
          {step !== 'confirm' && !management ? <button type="button" className="ghost-button" disabled={busy}
            onClick={() => run(() => startManagement(step))}>Send verification email</button> : null}
          {(setup?.setupId || management?.challengeId) ? <EmailCodeResend key={setup?.setupId || management?.challengeId}
            challengeId={setup?.setupId || management?.challengeId} disabled={busy} /> : null}
        </> : null}
      </form> : null}
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      {codes.length ? <dialog ref={codesDialog} className="backup-codes-dialog" onCancel={(event) => event.preventDefault()}>
        <h2>Save Your Backup Codes</h2>
        <p>Your account is protected. These single-use codes will not be shown again. Store them safely.</p>
        <div className="backup-codes">{codes.map((item) => <code key={item}>{item}</code>)}</div>
        <label><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />I have saved my backup codes.</label>
        <button className="solid-button" type="button" disabled={!saved} onClick={() => {
          codesDialog.current.close(); setCodes([]); setSaved(false); setError(''); back()
        }}>Continue</button>
      </dialog> : null}
    </div>
  </section>
}
