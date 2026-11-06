import { useCallback, useEffect, useState } from 'react'
import { apiRequest, getSelectedDatabaseName } from '../api/client'
import { uploadCustomerPhoto } from '../api/uploads'

export default function RideCustomerPhoto() {
  const [profile, setProfile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [database] = useState(getSelectedDatabaseName)
  const ensureRegion = useCallback(() => {
    if (getSelectedDatabaseName() !== database) throw new Error('Region changed. Reload before updating your photo.')
  }, [database])
  useEffect(() => {
    let current = true
    apiRequest('/rides/me/customer-profile').then((result) => {
      ensureRegion()
      if (current) setProfile(result)
    }).catch((failure) => { if (current) setError(failure.message) })
    return () => { current = false }
  }, [ensureRegion])
  async function save(file) {
    setBusy(true); setError('')
    try {
      ensureRegion()
      const profilePhotoUrl = file ? await uploadCustomerPhoto(file) : null
      ensureRegion()
      const result = await apiRequest('/rides/me/customer-profile', {
        method: 'PUT', body: JSON.stringify(file ? { profilePhotoUrl } : { skip: true }),
      })
      ensureRegion()
      setProfile(result)
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  async function reload() {
    setBusy(true); setError('')
    try { ensureRegion(); const result = await apiRequest('/rides/me/customer-profile'); ensureRegion(); setProfile(result) }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  function selectFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) save(file)
  }
  return <section className="ride-customer-photo">
    <h3>Your ride photo (optional)</h3>
    {profile ? <>
      <p>{profile.prompted ? 'Update your photo anytime.' : 'Add a photo so your assigned driver can recognize you, or skip for now.'}</p>
      {profile.profilePhotoUrl ? <img src={profile.profilePhotoUrl} alt="Your ride photo" width="64" height="64" /> : null}
      <label>Take photo<input type="file" accept="image/jpeg,image/png,image/webp" capture="user" disabled={busy} onChange={selectFile} /></label>
      <label>Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={selectFile} /></label>
      {!profile.prompted ? <button type="button" disabled={busy} onClick={() => save(null)}>Skip for now</button> : null}
      <p className="section-note">Your photo, joined date and ride rating are shared only with your assigned driver.</p>
    </> : null}
    {error ? <><p className="form-error" role="alert">{error}</p><button type="button" disabled={busy} onClick={reload}>Retry photo profile</button></> : null}
  </section>
}
