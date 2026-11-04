import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { apiRequest } from '../api/client'
import { deliveryRequest } from '../api/delivery'
import { addToCart } from '../features/cart/cartSlice'
import { customerCoordinates, entityId, nearestStoreProduct } from '../utils/catalogPricing'
import { formatCurrency } from '../utils/format'
import useCatalogPricing from '../features/products/useCatalogPricing'

export default function NearestStorePurchase({ productId }) {
  const dispatch = useDispatch()
  const pricing = useCatalogPricing()
  const userId = useSelector((state) => entityId(state.auth.user))
  const [saved, setSaved] = useState([])
  const [savedError, setSavedError] = useState('')
  const [savedAttempt, setSavedAttempt] = useState(0)
  const [savedLoading, setSavedLoading] = useState(Boolean(userId))
  const [coordinates, setCoordinates] = useState({ latitude: '', longitude: '' })
  const [savedChoice, setSavedChoice] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const generation = useRef(0)
  useEffect(() => {
    let active = true
    if (!userId) return undefined
    Promise.all([deliveryRequest('delivery-current-address'), deliveryRequest('delivery-addresses')])
      .then(([current, addresses]) => {
        if (!Array.isArray(addresses)) throw new Error('Saved locations are unavailable.')
        if (active) {
          setSaved([current, ...addresses].filter((address) => customerCoordinates(address)))
          setSavedError('')
        }
      }).catch((failure) => { if (active) setSavedError(failure.message) })
      .finally(() => { if (active) setSavedLoading(false) })
    return () => { active = false }
  }, [userId, savedAttempt])
  useEffect(() => () => { ++generation.current }, [productId])
  const changeLocation = (next, choice = '') => {
    ++generation.current
    setSavedChoice(choice)
    setCoordinates(next)
    setResult(null)
    setError('')
    setBusy(false)
  }
  const locate = () => {
    const request = ++generation.current
    setResult(null); setError(''); setBusy(true)
    if (!navigator.geolocation) { setError('Location permission is not supported. Enter coordinates manually.'); setBusy(false); return }
    navigator.geolocation.getCurrentPosition((position) => {
      if (request !== generation.current) return
      changeLocation({ latitude: String(position.coords.latitude), longitude: String(position.coords.longitude) })
    }, (failure) => {
      if (request !== generation.current) return
      setError(`${failure.message || 'Location permission was denied.'} Enter coordinates manually or retry.`)
      setBusy(false)
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }
  const resolve = async (event) => {
    event.preventDefault()
    const request = ++generation.current
    setResult(null); setError('')
    const location = customerCoordinates(coordinates)
    if (!location) { setError('Choose a saved location, allow location access, or enter valid coordinates.'); return }
    setBusy(true)
    try {
      const payload = await apiRequest(`/products/${encodeURIComponent(productId)}/nearest-store?${new URLSearchParams(location)}`)
      const product = nearestStoreProduct(payload, productId)
      if (request === generation.current) { setResult({ product, distanceKm: payload.distanceKm }); setQuantity(1) }
    } catch (failure) { if (request === generation.current) setError(failure.message) }
    finally { if (request === generation.current) setBusy(false) }
  }
  return <section className="page-stack" aria-label="Nearest store price">
    <p>Choose your customer location to see the nearest store’s actual price and availability. No catalog or default-store price is used.</p>
    {savedLoading ? <p role="status">Loading saved locations...</p> : null}
    {userId && !savedLoading && !savedError && saved.length === 0 ? <p>No saved locations with coordinates are available. Allow current-location access or enter coordinates manually.</p> : null}
    {savedError ? <p role="alert">{savedError} <button type="button" className="ghost-button" onClick={() => { setSavedLoading(true); setSavedAttempt((value) => value + 1) }}>Retry saved locations</button></p> : null}
    <form className="form-grid" onSubmit={resolve}>
      {userId ? <label>Saved location<select value={savedChoice} onChange={(event) => {
        const address = saved[Number(event.target.value)]
        changeLocation(event.target.value === '' ? { latitude: '', longitude: '' } : customerCoordinates(address), event.target.value)
      }}>
        <option value="">Choose a saved location with coordinates</option>
        {saved.map((address, index) => <option key={index} value={index}>{address.label || address.name || address.address1 || 'Saved location'}{address.city ? `, ${address.city}` : ''}</option>)}
      </select></label> : null}
      <button type="button" className="ghost-button" disabled={busy} onClick={locate}>Use my current location (allow permission)</button>
      {['latitude', 'longitude'].map((field) => <label key={field}>{field === 'latitude' ? 'Latitude' : 'Longitude'}
        <input type="number" step="any" min={field === 'latitude' ? -90 : -180} max={field === 'latitude' ? 90 : 180}
          required value={coordinates[field]} onChange={(event) => changeLocation({ ...coordinates, [field]: event.target.value })} />
      </label>)}
      <button className="solid-button" disabled={busy}>{busy ? 'Finding nearest store...' : result ? 'Refresh store price' : 'Find nearest store price / Retry'}</button>
    </form>
    {error ? <p role="alert">{error}</p> : null}
    {result ? <div>
      <h3>{result.product.storefrontName}</h3>
      {Number.isFinite(result.distanceKm) ? <p>{result.distanceKm.toFixed(2)} km away</p> : null}
      <p className="price-tag">{formatCurrency(result.product.price)}</p>
      <p>{result.product.countInStock > 0 ? `${result.product.countInStock} available` : 'Out of stock at this store'}</p>
      <label>Quantity<input type="number" min="1" step="1" max={result.product.countInStock || 1} value={quantity}
        onChange={(event) => setQuantity(Number(event.target.value))} /></label>
      <button type="button" className="solid-button"
        disabled={busy || !Number.isInteger(quantity) || quantity < 1 || quantity > result.product.countInStock}
        onClick={async () => {
          const request = ++generation.current
          setBusy(true); setError('')
          try {
            const latest = await pricing.reload()
            if (request !== generation.current) return
            if (!latest) { setError('Pricing settings could not be verified. Retry before purchasing.'); return }
            dispatch(addToCart({ product: result.product, quantity }))
            toast.success(`${result.product.name} from ${result.product.storefrontName} added to cart`)
          } finally { if (request === generation.current) setBusy(false) }
        }}>Add to cart from {result.product.storefrontName}</button>
    </div> : <p>Price and purchase remain unavailable until a store is resolved for your location.</p>}
  </section>
}
