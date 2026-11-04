import useCatalogPricing from '../features/products/useCatalogPricing'

export default function CatalogPricingNotice() {
  const pricing = useCatalogPricing()
  if (pricing.status === 'ready') return null
  return <div role={pricing.error ? 'alert' : 'status'} className="section-note">
    {pricing.error || 'Loading catalog pricing settings. Prices and purchases are temporarily unavailable.'}
    {pricing.error ? <button className="ghost-button" type="button" onClick={pricing.reload}>Retry pricing settings</button> : null}
  </div>
}
