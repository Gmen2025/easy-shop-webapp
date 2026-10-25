import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest, getSelectedDatabaseName } from '../api/client'
import { addressText } from '../utils/delivery'
import {
  buildDriverConfigPayload, buildRideConfigPayload, buildTerminationReviewPayload,
  normalizeRideConfig, normalizeRideDrivers, normalizeRidePayments, RIDE_OPTIONS,
  RIDE_RATE_FIELDS, RIDE_SETTING_FIELDS,
} from '../utils/rideSettings'

const VEHICLE_TYPES = ['motorcycle', 'car', 'van', 'truck']
const CAR_CLASSES = [
  { value: '', label: 'Not classified' },
  { value: 'economy', label: 'Economy' },
  { value: 'comfort', label: 'Comfort' },
]

function responseError(failure) {
  return failure?.payload?.message || failure?.message || 'Unable to update ride settings. Please retry.'
}

function payerName(user) {
  if (typeof user === 'string') return user
  if (user && typeof user === 'object') return user.name || user.email || user._id || 'Unknown payer'
  return 'Unknown payer'
}

function rideFare(ride) {
  const amount = ride.finalFare ?? ride.estimate
  return `${ride.currency.toUpperCase()} ${amount.toFixed(2)}`
}

function rideAddress(ride) {
  const first = ride.stops[0]?.address
  const last = ride.stops.at(-1)?.address
  return `${addressText(first) || 'Pickup address unavailable'} to ${addressText(last) || 'Drop-off address unavailable'}`
}

function initialDriverEdits(drivers) {
  return Object.fromEntries(drivers.map((driver) => [driver._id, {
    vehicleType: driver.pendingVehicleType || driver.vehicleType || driver.vehicle?.type || '',
    carClass: driver.carClass || '',
    passengerSeats: driver.passengerSeats ? String(driver.passengerSeats) : '',
  }]))
}

function initialReviews(payments) {
  return Object.fromEntries(payments.filter((ride) => ride.paymentStatus === 'review_required')
    .map((ride) => [ride._id, { fare: '', note: '' }]))
}

export default function RideSettingsPage() {
  const [database] = useState(getSelectedDatabaseName)
  const [config, setConfig] = useState(null)
  const [drivers, setDrivers] = useState([])
  const [driverEdits, setDriverEdits] = useState({})
  const [payments, setPayments] = useState([])
  const [reviews, setReviews] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const running = useRef(false)
  const mounted = useRef(true)

  const ensureRegion = useCallback(() => {
    if (getSelectedDatabaseName() !== database) {
      throw new Error('The selected region changed. Reload Ride settings before continuing.')
    }
  }, [database])

  const loadData = useCallback(async () => {
    ensureRegion()
    const [policy, companyDrivers, ridePayments] = await Promise.all([
      apiRequest('/rides/config'),
      apiRequest('/rides/admin/drivers'),
      apiRequest('/rides/admin/payments'),
    ])
    ensureRegion()
    const normalizedConfig = normalizeRideConfig(policy)
    const normalizedDrivers = normalizeRideDrivers(companyDrivers)
    const normalizedPayments = normalizeRidePayments(ridePayments)
    if (!mounted.current) return
    setConfig(normalizedConfig)
    setDrivers(normalizedDrivers)
    setDriverEdits(initialDriverEdits(normalizedDrivers))
    setPayments(normalizedPayments)
    setReviews(initialReviews(normalizedPayments))
  }, [ensureRegion])

  useEffect(() => {
    mounted.current = true
    loadData()
      .catch((failure) => { if (mounted.current) setError(responseError(failure)) })
      .finally(() => { if (mounted.current) setLoading(false) })
    return () => { mounted.current = false }
  }, [loadData])

  async function run(action) {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      ensureRegion()
      await action()
    } catch (failure) {
      setError(responseError(failure))
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  function updateConfig(field, value) {
    setConfig((current) => ({ ...current, [field]: value }))
  }

  function updateRate(option, field, value) {
    setConfig((current) => ({
      ...current,
      vehicleRates: {
        ...current.vehicleRates,
        [option]: { ...current.vehicleRates[option], [field]: value },
      },
    }))
  }

  function updateDriver(driverId, patch) {
    setDriverEdits((current) => ({
      ...current,
      [driverId]: { ...current[driverId], ...patch },
    }))
  }

  function updateReview(rideId, patch) {
    setReviews((current) => ({
      ...current,
      [rideId]: { ...current[rideId], ...patch },
    }))
  }

  async function reload() {
    setLoading(true)
    await run(async () => {
      await loadData()
      setMessage('Ride settings and operational records reloaded.')
    })
    setLoading(false)
  }

  async function saveDriver(driver) {
    await run(async () => {
      const payload = buildDriverConfigPayload(driverEdits[driver._id] || {})
      const result = await apiRequest(`/rides/admin/drivers/${encodeURIComponent(driver._id)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      if (!result || typeof result.message !== 'string' || !result.message) {
        throw new Error('The API did not confirm the company-driver vehicle update.')
      }
      await loadData()
      setMessage(result.message)
    })
  }

  async function confirmReceivedPayment(ride) {
    if (!window.confirm(`Confirm ${rideFare(ride)} was received for this exact ride? Only confirm after verifying the transfer or cash.`)) return
    await run(async () => {
      const result = await apiRequest(`/rides/${encodeURIComponent(ride._id)}/received-payment`, { method: 'POST' })
      normalizeRidePayments([result])
      await loadData()
      setMessage(`Payment receipt confirmed for ride ${ride._id}.`)
    })
  }

  async function reviewTermination(ride, waive) {
    const edits = reviews[ride._id] || {}
    await run(async () => {
      const payload = buildTerminationReviewPayload(edits, waive)
      const prompt = waive
        ? 'Waive this ride payment? No payment will be due. The ride remains terminated and your review note will be saved.'
        : 'Resolve this termination review? The entered fare will be payable by the rider. This review cannot be edited through this screen.'
      if (!window.confirm(prompt)) return
      const result = await apiRequest(`/rides/admin/terminations/${encodeURIComponent(ride._id)}/review`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      normalizeRidePayments([result])
      await loadData()
      setMessage(waive ? `Payment waived for ride ${ride._id}.` : `Termination review resolved for ride ${ride._id}.`)
    })
  }

  return <section className="panel delivery-page">
    <div className="panel-header">
      <h1>Ride fares, pooling & payments</h1>
      <span>Region: {database}</span>
    </div>
    <p>Ride requests, passenger pricing, driver vehicle verification and ride-payment operations are shared with mobile for this region.
      Passenger rides are separate from product-delivery activation. Existing bookings retain their agreed tariff.</p>
    <button className="ghost-button" disabled={busy || loading} onClick={reload}>Reload ride settings & payments</button>
    {error ? <p role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {loading ? <p role="status">Loading ride configuration, company drivers and completed rides…</p> : null}
    {!loading && error ? <button className="ghost-button" disabled={busy} onClick={reload}>Retry loading Ride settings</button> : null}

    {!loading && config ? <fieldset className="delivery-fieldset" disabled={busy}>
      <article className="order-card">
        <h2>Ride service configuration</h2>
        <label><input type="checkbox" checked={config.enabled} onChange={(event) => updateConfig('enabled', event.target.checked)} />
          Enable ride requests</label>
        <p>Configure rates in this region’s currency. USA distance rates use miles; Ethiopia rates use kilometers.
          Shared riders pay their solo route/time fare minus the discount, not other riders’ detours. Regular riders pay
          one fare based on planned distance and actual elapsed ride time.</p>
        <p>Fields left blank by the API are not treated as saved defaults; complete the required values before saving.</p>
        <div className="form-grid">
          {RIDE_SETTING_FIELDS.map(([field, label]) => <label key={field}>{label}
            <input type="number" min="0" step="any" value={config[field]} onChange={(event) => updateConfig(field, event.target.value)} />
          </label>)}
        </div>
        <h3>Passenger car pricing: Economy & Comfort, plus Van</h3>
        <p>Disabled options cannot be newly requested. Classify cars as Economy or Comfort below; unclassified cars cannot
          receive class-selected bookings.</p>
        <div className="form-grid">
          {RIDE_OPTIONS.map(({ key, label }) => <article className="order-card" key={key}>
            <h3>{label}</h3>
            <label><input type="checkbox" checked={config.vehicleRates[key].enabled}
              onChange={(event) => updateRate(key, 'enabled', event.target.checked)} />Available for booking</label>
            {RIDE_RATE_FIELDS.map(([field, rateLabel]) => <label key={field}>{rateLabel}
              <input type="number" min="0" max="100000" step="0.01" disabled={!config.vehicleRates[key].enabled}
                value={config.vehicleRates[key][field]} onChange={(event) => updateRate(key, field, event.target.value)} />
            </label>)}
          </article>)}
        </div>
        <button className="solid-button" onClick={() => run(async () => {
          const payload = buildRideConfigPayload(config)
          const saved = normalizeRideConfig(await apiRequest('/rides/config', {
            method: 'PUT',
            body: JSON.stringify(payload),
          }))
          setConfig(saved)
          setMessage('Ride configuration saved for web and mobile in this region.')
        })}>Save ride configuration</button>
      </article>
    </fieldset> : null}

    {!loading && !error && <section>
      <h2>Company drivers: vehicle, car class & passenger seats</h2>
      <p>Choose the verified vehicle type, not an unverified vehicle request. Usable seats exclude the driver and may only be
        changed for cars and vans. The backend blocks changes during active trips, offers or assigned deliveries.</p>
      {drivers.length === 0 ? <p>No company drivers are registered in this region.</p> : drivers.map((driver) => {
        const edits = driverEdits[driver._id] || {}
        const activeTrip = Boolean(driver.activeRideTrip)
        const enabledModes = driver.serviceModes
          ? Object.entries(driver.serviceModes).filter(([, enabled]) => enabled).map(([mode]) => mode).join(', ') || 'None enabled'
          : 'Not reported'
        return <article className="order-card" key={driver._id}>
          <h3>{driver.name}</h3>
          <p>Current vehicle: {driver.vehicleType || driver.vehicle?.type || 'Not configured'} | Service modes: {enabledModes}</p>
          <p>Active passenger trip: {activeTrip ? 'Yes' : 'No'} | Shared intake: {driver.sharedIntakeOpen === undefined
            ? 'Not reported' : driver.sharedIntakeOpen ? 'Open' : 'Closed'}</p>
          {driver.pendingVehicleType ? <p role="alert">Requested vehicle: {driver.pendingVehicleType}. Verify the registered vehicle before saving.</p> : null}
          <div className="form-grid">
            <label>Verified vehicle type
              <select disabled={busy} value={edits.vehicleType || ''} onChange={(event) => {
                updateDriver(driver._id, {
                  vehicleType: event.target.value,
                  ...(event.target.value !== 'car' ? { carClass: '' } : {}),
                })
              }}>
                <option value="">Select verified vehicle…</option>
                {VEHICLE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            {edits.vehicleType === 'car' ? <label>Car class for customer selection, pricing & matching
              <select disabled={busy} value={edits.carClass || ''} onChange={(event) => updateDriver(driver._id, { carClass: event.target.value })}>
                {CAR_CLASSES.map(({ value, label }) => <option key={value || 'none'} value={value}>{label}</option>)}
              </select>
            </label> : null}
            <label>Passenger seats (1-16, excluding driver)
              <input type="number" min="1" max="16" step="1" disabled={busy || !['car', 'van'].includes(edits.vehicleType)}
                value={edits.passengerSeats ?? ''} onChange={(event) => updateDriver(driver._id, { passengerSeats: event.target.value })} />
            </label>
          </div>
          <button className="solid-button" disabled={busy} onClick={() => saveDriver(driver)}>
            Verify vehicle & save for {driver.name}
          </button>
        </article>
      })}
    </section>}

    {!loading && !error && <section>
      <h2>Completed rides & terminated ride reviews (latest 100)</h2>
      <p>Awaiting termination review: {payments.filter((ride) => ride.paymentStatus === 'review_required').length}.
        Payment on these rides is on hold until an Admin sets an adjusted fare or waives it.</p>
      {payments.length === 0 ? <p>No completed or terminated rides are available in this region.</p> : payments.map((ride) => {
        const review = reviews[ride._id] || { fare: '', note: '' }
        const needsReview = ride.status === 'terminated' && ride.paymentStatus === 'review_required'
        const canConfirm = ['bank', 'cash'].includes(ride.paymentMethod) && ride.paymentStatus === 'pending'
        return <article className="order-card" key={ride._id}>
          <h3>Ride {ride._id}</h3>
          <p>Payer: {payerName(ride.user)}</p>
          <p>{rideAddress(ride)}</p>
          <p>{ride.paymentStatus === 'review_required' ? 'Estimate only: ' : ''}{rideFare(ride)} — {ride.paymentMethod || 'Not selected'} / {ride.paymentStatus}</p>
          {ride.status === 'terminated' ? <>
            <p>Terminated: {ride.termination?.reason || 'Reason not reported'}.
              {ride.termination?.at ? ` At ${new Date(ride.termination.at).toLocaleString()}.` : ''}</p>
            {ride.termination?.location?.coordinates ? <p>Reported GPS (longitude, latitude): {ride.termination.location.coordinates.join(', ')}</p> : null}
          </> : null}
          {needsReview ? <>
            <h4>Action required: review terminated ride</h4>
            <p>Payment is on hold. Waive payment to cancel the amount due, or set the fare the rider should pay.
              The ride remains terminated; the review cannot be edited after submission.</p>
            <div className="form-grid">
              <label>Reviewed fare (0 to waive)
                <input type="number" min="0" step="0.01" disabled={busy} value={review.fare}
                  onChange={(event) => updateReview(ride._id, { fare: event.target.value })} />
              </label>
              <label>Admin review note (1-500 characters)
                <textarea maxLength="500" disabled={busy} value={review.note}
                  onChange={(event) => updateReview(ride._id, { note: event.target.value })} />
              </label>
            </div>
            <div className="action-row">
              <button className="ghost-button" disabled={busy || !review.note?.trim()}
                onClick={() => reviewTermination(ride, true)}>Waive payment</button>
              <button className="solid-button" disabled={busy || !review.fare?.trim() || !review.note?.trim()}
                onClick={() => reviewTermination(ride, false)}>Resolve termination review</button>
            </div>
          </> : null}
          {ride.paymentStatus === 'waived' ? <p>Payment waived. No fare is due.</p> : null}
          {ride.termination?.reviewNote ? <p>Review note: {ride.termination.reviewNote}</p> : null}
          {ride.paymentMethod === 'bank' ? <>
            <p>{ride.bankAccount?.bankName || 'Bank'} {ride.bankAccount?.accountNumber || ''}</p>
            <p>Sender: {ride.bankSender || 'Not submitted'}. Reference: {ride.bankReference || 'Not submitted'}</p>
          </> : null}
          {canConfirm ? <button className="solid-button" disabled={busy || (ride.paymentMethod === 'bank' && !ride.bankReference)}
            onClick={() => confirmReceivedPayment(ride)}>Confirm {ride.paymentMethod} received</button> : null}
        </article>
      })}
    </section>}
  </section>
}
