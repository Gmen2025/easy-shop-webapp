import { useState } from 'react'
import { storeInitials } from '../utils/storeLogo'

export default function StoreLogo({ name, logo, className = '' }) {
  const [failedLogo, setFailedLogo] = useState(null)
  const source = typeof logo === 'string' ? logo.trim() : ''
  if (source && source !== failedLogo) return <img src={source} alt={`${name || 'Store'} logo`}
    className={`store-logo ${className}`} loading="lazy" onError={() => setFailedLogo(source)} />
  return <div className={`store-logo store-logo-placeholder ${className}`} role="img" aria-label={`${name || 'Store'} initials`}>
    {storeInitials(name)}
  </div>
}
