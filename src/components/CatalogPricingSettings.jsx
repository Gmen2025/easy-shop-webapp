import { useState } from 'react'
import useCatalogPricing from '../features/products/useCatalogPricing'
import CatalogPricingNotice from './CatalogPricingNotice'

export default function CatalogPricingSettings() {
  const pricing = useCatalogPricing()
  const [notice, setNotice] = useState('')
  return <article className="panel"><h2>Nearest-store catalog pricing</h2>
    <p>Off by default: keep the existing catalog experience. When on, customers must choose a location on product details before seeing the nearest store’s price and buying. Explicit storefronts keep their own prices.</p>
    <CatalogPricingNotice />
    <label><input type="checkbox" checked={pricing.enabled === true} disabled={pricing.status !== 'ready'}
      onChange={async (event) => {
        setNotice('')
        try { await pricing.save(event.target.checked); setNotice('Catalog pricing setting saved.') }
        catch { /* The shared settings notice displays the failure and retry action. */ }
      }} /> Require nearest-store pricing</label>
    {notice && pricing.status === 'ready' ? <p role="status">{notice}</p> : null}
  </article>
}
