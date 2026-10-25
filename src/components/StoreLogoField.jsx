import { useEffect, useRef, useState } from 'react'
import { uploadStoreLogo } from '../api/uploads'
import StoreLogo from './StoreLogo'

export default function StoreLogoField({ name, value, onChange, disabled, onBusyChange }) {
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const guard = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || guard.current) return
    guard.current = true
    setUploading(true); setError(''); onBusyChange(true)
    try {
      const logo = await uploadStoreLogo(file)
      if (mounted.current) onChange(logo)
    } catch (failure) {
      if (mounted.current) setError(failure.message || 'Unable to upload the logo. Please retry.')
    } finally {
      guard.current = false
      if (mounted.current) { setUploading(false); onBusyChange(false) }
    }
  }
  return <div className="store-logo-field">
    <StoreLogo name={name} logo={value} />
    <p>Store logo (optional). Without a logo, customers see initials from the registered store name.</p>
    <label>Logo image URL (optional)<input type="url" placeholder="https://..." value={value} maxLength={500}
      disabled={disabled || uploading} onChange={(event) => { setError(''); onChange(event.target.value) }} /></label>
    <label>{uploading ? 'Uploading logo...' : 'Choose logo image (JPEG, PNG or WebP, up to 5 MB)'}
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading} onChange={upload} /></label>
    {value ? <button type="button" className="ghost-button" disabled={disabled || uploading}
      onClick={() => { onChange(''); setError('') }}>Remove logo / use initials</button> : null}
    {uploading ? <p role="status">Uploading logo. Wait before saving the store.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <small>The logo is saved to the store when you save the form.</small>
  </div>
}
