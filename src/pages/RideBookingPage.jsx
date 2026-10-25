import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getSelectedDatabaseName } from '../api/client'
import { deliveryRequest } from '../api/delivery'
import { getRideConfig, getRideLocation, getRideQuotes, requestRide } from '../api/rides'
import LoadingState from '../components/LoadingState'
import AddressAutocomplete from '../components/AddressAutocomplete'
import RideMap from '../components/RideMap'
import { addressCountryCode } from '../utils/addressAutocomplete'
import { addressText, latLng, validateAddress } from '../utils/delivery'
import {
  RIDE_OPTIONS, RIDE_STEPS, balanceRideStops, buildRidePayload, editRideAddress,
  newRideStop, rideFare, rideStopTitle, validateRideQuotes,
} from '../utils/rides'

function RideBookingPage() {
  const navigate = useNavigate()
  const [database] = useState(getSelectedDatabaseName)
  const country = database === 'E_ShopUSA' ? 'USA' : 'Ethiopia'
  const [config, setConfig] = useState(null)
  const [stops, setStops] = useState(() => ['pickup', 'dropoff'].map((type) => newRideStop(type, country)))
  const [saved, setSaved] = useState([])
  const [mode, setMode] = useState('regular')
  const [step, setStep] = useState(0)
  const [activeId, setActiveId] = useState(null)
  const [quotes, setQuotes] = useState([])
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const running = useRef(false)
  const activeStop = stops.find((stop) => stop.id === activeId) || stops[0]
  const activeIndex = stops.indexOf(activeStop)

  const ensureRegion = useCallback(() => {
    if (getSelectedDatabaseName() !== database) {
      throw new Error('The region changed. Reload the ride page before continuing.')
    }
  }, [database])

  useEffect(() => {
    let current = true
    Promise.all([getRideConfig(), deliveryRequest('delivery-addresses'), deliveryRequest('delivery-current-address')])
      .then(([policy, addresses, account]) => {
        if (!current) return
        ensureRegion()
        if (typeof policy?.enabled !== 'boolean' || !Array.isArray(addresses)) {
          throw new Error('Ride settings or saved addresses could not be loaded. Please retry.')
        }
        setConfig(policy)
        const regional = (address) => addressCountryCode(address.country) === addressCountryCode(country)
        setSaved([
          ...(account?.address1 && regional(account)
            ? [{ ...account, _id: 'current', label: 'Current account address' }] : []),
          ...addresses.filter(regional),
        ])
        setStops(['pickup', 'dropoff'].map((type) => newRideStop(type, country, account?.phone || '')))
      })
      .catch((failure) => {
        if (current) setError(failure.payload?.message || failure.message || 'Unable to load ride booking.')
      })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [country, ensureRegion, reload])

  const invalidateQuotes = useCallback(() => {
    setQuotes([])
    setQuote(null)
  }, [])

  const run = useCallback(async (action) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try {
      ensureRegion()
      await action()
    } catch (failure) {
      setError(failure.payload?.message || failure.message || 'Unable to update this ride. Please retry.')
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [ensureRegion])

  const updateStop = useCallback((id, patch) => {
    invalidateQuotes()
    setStops((previous) => balanceRideStops(previous.map((stop) => stop.id === id ? { ...stop, ...patch } : stop)))
  }, [invalidateQuotes])

  function updateAddress(field, value) {
    updateStop(activeStop.id, { address: editRideAddress(activeStop.address, field, value) })
  }

  const selectMapLocation = useCallback(({ latitude, longitude }) => run(async () => {
    const address = await getRideLocation(latitude, longitude)
    ensureRegion()
    if (!latLng(address)) throw new Error('That location could not be verified. Search for an address or try another point.')
    updateStop(activeStop.id, { address: {
      ...address, address2: '', label: activeStop.address.label, phone: activeStop.address.phone,
      ...(activeStop.type === 'pickup' ? { currentLocation: { latitude, longitude } } : {}),
    } })
  }), [activeStop, ensureRegion, run, updateStop])

  function locatePickup() {
    run(async () => {
      if (!navigator.geolocation) throw new Error('This browser does not support location access. Enter your pickup manually.')
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject,
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }))
      ensureRegion()
      const { latitude, longitude } = position.coords
      const address = await getRideLocation(latitude, longitude)
      ensureRegion()
      if (!latLng(address)) throw new Error('Your pickup location could not be verified. Enter it manually.')
      updateStop(stops[0].id, { address: {
        ...address, address2: '', label: stops[0].address.label, phone: stops[0].address.phone,
        currentLocation: { latitude, longitude },
      } })
      setActiveId(stops[0].id)
    })
  }

  function addStop() {
    const stop = newRideStop('pickup', country, stops[0].address.phone)
    invalidateQuotes()
    setStops((previous) => balanceRideStops([...previous.slice(0, -1), stop, previous.at(-1)]))
    setActiveId(stop.id)
  }

  function moveStop(index, direction) {
    invalidateQuotes()
    setStops((previous) => {
      const reordered = [...previous]
      ;[reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]]
      return balanceRideStops(reordered)
    })
  }

  function saveAddress() {
    run(async () => {
      validateAddress(activeStop.address)
      if (addressCountryCode(activeStop.address.country) !== addressCountryCode(country)) {
        throw new Error(`Choose an address in ${country}.`)
      }
      const id = activeStop.address._id
      const updating = id && id !== 'current'
      const stored = await deliveryRequest(updating ? `delivery-addresses/${encodeURIComponent(id)}` : 'delivery-addresses', {
        method: updating ? 'PUT' : 'POST', data: activeStop.address,
      })
      ensureRegion()
      if (!stored?._id) throw new Error('The address was not confirmed as saved. Reload saved addresses before retrying.')
      setSaved((previous) => [stored, ...previous.filter((entry) => entry._id !== stored._id)])
      updateStop(activeStop.id, { address: { ...activeStop.address, ...stored } })
      toast.success('Address saved. Select its badge for any stop or future booking.')
    })
  }

  function calculateQuotes() {
    run(async () => {
      const payload = buildRidePayload(mode, stops, country)
      invalidateQuotes()
      const result = await getRideQuotes(payload)
      ensureRegion()
      setQuotes(validateRideQuotes(result))
      setStep(2)
    })
  }

  function bookRide() {
    run(async () => {
      if (!quote || new Date(quote.expiresAt).getTime() <= Date.now()) {
        invalidateQuotes()
        setStep(1)
        throw new Error('Ride prices expired. Calculate again before requesting.')
      }
      const ride = await requestRide(quote._id)
      ensureRegion()
      if (!ride?._id) throw new Error('The request was not confirmed. Check My rides before retrying.')
      toast.success('Ride requested. Follow updates from My rides.')
      navigate(`/rides/mine?rideId=${encodeURIComponent(ride._id)}`)
    })
  }

  if (loading) return <LoadingState label="Loading ride booking and saved addresses..." />

  const displayStops = step >= 2 ? quote?.stops || quotes[0]?.stops || stops : stops

  return <section className="page-stack ride-page">
    <header className="ride-brand">
      <div><h1>Addu Genet Ride</h1><p>Safe · Fast · Reliable</p></div>
      <Link className="ghost-button" to="/rides/mine">My rides</Link>
    </header>
    {error ? <p className="form-error ride-error" role="alert">{error}</p> : null}
    {!config ? <section className="panel empty-state">
      <h2>Unable to load ride booking</h2>
      <button className="solid-button" onClick={() => {
        setError(''); setLoading(true); setReload((previous) => previous + 1)
      }}>Retry loading</button>
    </section> : !config.enabled ? <section className="panel empty-state">
      <h2>Ride service is not available in this region yet.</h2>
      <p>Switch your region or check again later.</p>
    </section> : <div className="ride-booking-layout">
      <RideMap stops={displayStops} country={country} disabled={busy}
        onSelectLocation={step === 1 ? selectMapLocation : undefined} />
      <section className="panel ride-booking-panel">
        <ol className="ride-steps" aria-label="Booking progress">
          {RIDE_STEPS.map((title, index) => <li key={title} className={index <= step ? 'active' : ''}
            aria-current={step === index ? 'step' : undefined}><span>{index + 1}</span>{title}</li>)}
        </ol>
        <div className="action-row">
          {step > 0 ? <button type="button" className="text-button" disabled={busy}
            onClick={() => { setError(''); setStep(step - 1) }}>Back</button> : null}
          <span className="section-note">Region: {country}</span>
        </div>
        {step < 2 ? <form className="ride-form" onSubmit={(event) => {
          event.preventDefault()
          if (step === 0) run(async () => { buildRidePayload(mode, stops, country); setStep(1) })
          else calculateQuotes()
        }}>
          <div><h2>{step === 0 ? 'Where would you like to go?' : 'Map & multiple stops'}</h2>
            <p className="section-note">{step === 0 ? 'Choose a saved address badge or enter your pickup and destination.' :
              'Select a stop, then search or click the map to set its location. Stops are served in the order shown.'}</p></div>
          <fieldset disabled={busy} className="ride-editor">
            <div className="ride-stop-tabs" aria-label="Choose a stop to edit">
              {stops.map((stop, index) => <button type="button" key={stop.id}
                className={`ride-stop-tab ${stop.type}${activeStop.id === stop.id ? ' selected' : ''}`}
                aria-pressed={activeStop.id === stop.id} onClick={() => setActiveId(stop.id)}>
                <strong>{rideStopTitle(stop, index)}</strong>
                <span>{stop.address.label} · {addressText(stop.address) || 'Choose a location'}</span>
              </button>)}
            </div>
            {mode === 'regular' ? <button type="button" className="ghost-button"
              disabled={busy || stops.length >= 12} onClick={addStop}>+ Add stop</button> : null}
            <section className="ride-address-editor" aria-label={`Edit ${rideStopTitle(activeStop, activeIndex)}`}>
              <h3>{rideStopTitle(activeStop, activeIndex)}</h3>
              {saved.length ? <div className="ride-address-badges" aria-label="Saved addresses">
                {saved.map((address) => <button type="button" key={address._id}
                  className={`ride-address-badge${activeStop.address._id === address._id ? ' selected' : ''}`}
                  aria-pressed={activeStop.address._id === address._id}
                  aria-label={`Use ${address.label}: ${addressText(address)} for stop ${activeIndex + 1}`}
                  onClick={() => updateStop(activeStop.id, { address: { ...address } })}>
                  <strong>{address.label || 'Saved address'}</strong>
                  <span>{addressText(address)}</span>
                </button>)}
              </div> : <p className="section-note">Save a labeled address below to reuse it as a badge.</p>}
              <label>Delivery / stop label
                <input maxLength={300} value={activeStop.address.label} required placeholder="Home, Work, Airport..."
                  onChange={(event) => updateAddress('label', event.target.value)} />
              </label>
              <AddressAutocomplete key={`${activeStop.id}-${activeStop.address.country}`}
                label={activeStop.type === 'pickup' ? 'Search pickup address or landmark' : 'Search drop-off address or landmark'}
                value={activeStop.address.address1} country={activeStop.address.country} required disabled={busy}
                onChange={(value) => updateAddress('address1', value)}
                onSelect={(address) => {
                  const existing = { ...activeStop.address }
                  for (const key of ['_id', 'currentLocation', 'formattedAddress']) delete existing[key]
                  updateStop(activeStop.id, { address: { ...existing, ...address } })
                }} />
              <div className="form-grid">
                {[
                  ['address2', 'Apartment / unit (optional)'], ['city', 'City'],
                  ['zip', country === 'USA' ? 'ZIP code' : 'ZIP code (optional)'], ['country', 'Country'],
                  ['phone', 'Contact phone'],
                ].map(([field, label]) => <label key={field}>{label}
                  <input maxLength={300} type={field === 'phone' ? 'tel' : 'text'}
                    autoComplete={field === 'phone' ? 'tel' : undefined}
                    required={field !== 'address2' && (field !== 'zip' || country === 'USA')}
                    value={activeStop.address[field] || ''} onChange={(event) => updateAddress(field, event.target.value)} />
                </label>)}
                {activeIndex > 0 && activeIndex < stops.length - 1 ? <label>Stop type
                  <select value={activeStop.type} onChange={(event) => {
                    const address = { ...activeStop.address }
                    delete address.currentLocation
                    updateStop(activeStop.id, { type: event.target.value, address })
                  }}><option value="pickup">Pickup</option><option value="dropoff">Drop-off</option></select>
                </label> : null}
                <label>{activeStop.type === 'pickup' ? 'Passengers boarding' : 'Passengers leaving'}
                  <input type="number" min="1" max="16" step="1" required value={activeStop.passengers}
                    disabled={busy || activeIndex === stops.length - 1}
                    onChange={(event) => updateStop(activeStop.id, { passengers: event.target.value })} />
                </label>
              </div>
              {activeIndex === stops.length - 1 ? <p className="section-note">Everyone still onboard leaves at the final drop-off. This count updates automatically.</p> : null}
              <div className="action-row">
                <button type="button" className="ghost-button" onClick={saveAddress}>
                  {activeStop.address._id && activeStop.address._id !== 'current' ? 'Update saved address' : 'Save address as badge'}
                </button>
                <button type="button" className="text-button" onClick={locatePickup}>Use my current location for pickup</button>
              </div>
              {activeIndex > 0 && activeIndex < stops.length - 1 ? <div className="action-row">
                <button type="button" className="text-button" disabled={busy || activeIndex === 1}
                  onClick={() => moveStop(activeIndex, -1)}>Move up</button>
                <button type="button" className="text-button" disabled={busy || activeIndex === stops.length - 2}
                  onClick={() => moveStop(activeIndex, 1)}>Move down</button>
                <button type="button" className="text-button" onClick={() => {
                  invalidateQuotes()
                  setStops((previous) => balanceRideStops(previous.filter((stop) => stop.id !== activeStop.id)))
                  setActiveId(stops[0].id)
                }}>Remove stop</button>
              </div> : null}
            </section>
            <label className="ride-shared-toggle">
              <input type="checkbox" checked={mode === 'shared'} onChange={(event) => {
                setMode(event.target.checked ? 'shared' : 'regular')
                invalidateQuotes()
                setStops((previous) => balanceRideStops([previous[0], previous.at(-1)]))
                setActiveId(stops[0].id)
              }} />
              <span><strong>Shared ride</strong><small>Ride with other customers on a compatible route. Regular rides keep your booking together.</small></span>
            </label>
            <details className="ride-shared-info"><summary>About shared rides & payment</summary>
              <p>Shared discount: {config.sharedDiscountPercent}%. Maximum pickup wait: {config.maxPickupMinutes} min.
                Maximum shared extra travel: {config.maxDetourMinutes} min. You pay your booking's fare, not other riders' detours.</p>
              <p>No payment is taken now. Your final fare follows regional rules and may reflect actual route and travel time.</p>
            </details>
          </fieldset>
          <button className="solid-button ride-primary" type="submit" disabled={busy}>
            {busy ? 'Please wait...' : step === 0 ? 'Review map & stops' : 'Calculate road route & fare'}
          </button>
        </form> : step === 2 ? <section className="ride-vehicle-selection">
          <h2>Select ride</h2>
          <ol className="ride-stop-list">{displayStops.map((stop, index) =>
            <li key={index}><strong>{stop.address.label || rideStopTitle(stop, index)}</strong><span>{addressText(stop.address)}</span></li>)}</ol>
          <p className="section-note">Compare estimated fares. Driver availability is confirmed after requesting.</p>
          {RIDE_OPTIONS.map((option) => {
            const priced = quotes.find((entry) => entry.vehicleOption === option.key)
            return <button type="button" key={option.key} disabled={busy || !priced}
              className={`ride-vehicle${quote?._id === priced?._id && priced ? ' selected' : ''}`}
              aria-pressed={Boolean(priced && quote?._id === priced._id)} onClick={() => setQuote(priced)}>
              <span className="ride-vehicle-icon" aria-hidden="true">
                <svg width="44" height="30" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d={option.key === 'van'
                    ? 'M5 29V10a4 4 0 0 1 4-4h35l13 14v9H5Z M35 6v14h22 M11 12h17v9H11Z'
                    : 'M5 29V21l9-4 7-11h23l8 12 7 4v7H5Z M17 18h31 M31 6v12'} />
                  <circle cx="17" cy="30" r="6" fill="white" /><circle cx="47" cy="30" r="6" fill="white" />
                </svg>
              </span>
              <span><strong>{option.name}</strong><small>{option.detail}</small>
                {priced ? <small>{priced.seats} seats needed · {Math.round(priced.baseline.minutes)} min</small> : null}</span>
              <strong>{priced ? rideFare(priced) : 'Unavailable'}</strong>
            </button>
          })}
          <button className="solid-button ride-primary" disabled={busy || !quote} onClick={() => setStep(3)}>Continue</button>
        </section> : quote ? <section className="ride-summary">
          <h2>Trip summary</h2>
          <p><strong>{RIDE_OPTIONS.find((option) => option.key === quote.vehicleOption)?.name}</strong> · {mode === 'shared' ? 'Shared ride' : 'Regular ride'}</p>
          {displayStops.map((stop, index) => <article className="ride-stop-card" key={index}>
            <strong>{rideStopTitle(stop, index)} · {stop.address.label}</strong>
            <p>{addressText(stop.address)}</p>
            <small>{stop.passengers} passengers · {stop.address.phone}</small>
          </article>)}
          <h3>Estimated fare: {rideFare(quote)}</h3>
          <p className="section-note">{quote.seats} passenger seats needed · {(quote.baseline.distanceKm / (country === 'USA' ? 1.609344 : 1)).toFixed(1)} {country === 'USA' ? 'mi' : 'km'} · {Math.round(quote.baseline.minutes)} min.
            Quote expires {new Date(quote.expiresAt).toLocaleTimeString()}.</p>
          <div className="ride-payment-note"><h3>Payment after your ride</h3>
            <p>No payment is taken now. Choose your payment method after completion.
              Your final fare may vary from this estimate under your region's ride rules.</p></div>
          <button className="ghost-button" disabled={busy} onClick={() => { invalidateQuotes(); setStep(0) }}>Edit trip</button>
          <button className="solid-button ride-primary" disabled={busy} onClick={bookRide}>
            {busy ? 'Requesting driver...' : 'Request driver (pay after ride)'}
          </button>
        </section> : null}
      </section>
    </div>}
  </section>
}

export default RideBookingPage
