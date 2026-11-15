import { useEffect, useRef, useState } from 'react'
import { apiRequest, getSelectedDatabaseName } from '../api/client'

export default function TestingAccessSettings({ database }) {
  const [region, setRegion] = useState(getSelectedDatabaseName)
  const [emails, setEmails] = useState('')
  const [busy, setBusy] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const guard = useRef(false)
  const selected = database || region
  const parse = (data) => {
    if (!Array.isArray(data?.emails) || data.emails.some((email) => typeof email !== 'string')) {
      throw new Error('Tester access could not be verified. Please retry.')
    }
    return data.emails.join('\n')
  }
  useEffect(() => {
    let active = true
    apiRequest('/settings/testing-access', { headers: { 'x-database-name': selected } })
      .then((data) => { if (active) { setEmails(parse(data)); setLoaded(true); setError('') } })
      .catch((failure) => { if (active) setError(failure.message) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [selected, revision])
  async function save() {
    if (guard.current) return
    guard.current = true; setBusy(true); setError(''); setNotice('')
    try {
      setEmails(parse(await apiRequest('/settings/testing-access', {
        method: 'PUT', headers: { 'x-database-name': selected },
        body: JSON.stringify({ emails: emails.split(/[,;\n]/).map((email) => email.trim()).filter(Boolean) }),
      })))
      setNotice('Regional tester list saved. Remove an email to revoke tester access.')
    } catch (failure) { setError(failure.message) }
    finally { guard.current = false; setBusy(false) }
  }
  return <section className="panel page-stack">
    <h2>Approved testers</h2>
    {!database ? <label>Tester access region<select value={region} disabled={busy} onChange={(event) => {
      setBusy(true); setLoaded(false); setEmails(''); setError(''); setNotice(''); setRegion(event.target.value)
    }}><option value="E_Shopping">Ethiopia</option><option value="E_ShopUSA">USA</option></select></label> : null}
    <p>One list per region, shared by disabled services and maintenance mode.
      Testers must sign in with an existing verified email. This does not grant Admin permissions
      or access to anyone else&apos;s financial records.</p>
    <label>Tester emails (one per line)<textarea rows={5} value={emails} disabled={busy}
      autoCapitalize="none" onChange={(event) => setEmails(event.target.value)} /></label>
    {busy && <p role="status">Loading tester access...</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="action-row">
      <button disabled={busy || !loaded} onClick={save}>Save tester list</button>
      <button disabled={busy} onClick={() => { setBusy(true); setLoaded(false); setRevision((value) => value + 1) }}>Reload tester list</button>
    </div>
  </section>
}
