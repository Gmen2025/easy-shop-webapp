import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getSelectedDatabaseName } from '../api/client'
import { getRideConfig, getRideQuotes, requestRide } from '../api/rides'
import LoadingState from '../components/LoadingState'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { editAddress } from '../utils/addressAutocomplete'

const VEHICLE_NAMES = {
  economy: 'Economy',
  comfort: 'Comfort',
  van: 'Van',
}

function makeInitialTrip() {
  const country = getSelectedDatabaseName() === 'E_ShopUSA' ? 'USA' : 'Ethiopia'
  return {
    pickup: { address1: '', address2: '', city: '', zip: '', country, phone: '' },
    dropoff: { address1: '', address2: '', city: '', zip: '', country, phone: '' },
    passengers: '1',
  }
}

function RideBookingPage() {
  const navigate = useNavigate()
  const [config, setConfig] = useState(null)
  const [trip, setTrip] = useState(makeInitialTrip)
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    getRideConfig()
      .then((result) => {
        if (current) setConfig(result)
      })
      .catch((requestError) => {
        if (current) setError(requestError.message || 'Unable to check ride availability.')
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [])

  function updateAddress(stopName, event) {
    const { name, value } = event.target
    setTrip((current) => ({
      ...current,
      [stopName]: editAddress(current[stopName], name, value),
    }))
    setQuotes([])
  }

  async function calculateQuotes(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setQuotes([])
    const passengers = Number(trip.passengers)
    const payload = {
      mode: 'regular',
      stops: [
        { type: 'pickup', passengers, address: trip.pickup },
        { type: 'dropoff', passengers, address: trip.dropoff },
      ],
    }

    try {
      const result = await getRideQuotes(payload)
      if (!Array.isArray(result?.quotes) || result.quotes.length === 0) {
        throw new Error('No ride options are available for these locations. Try different addresses.')
      }
      setQuotes(result.quotes)
    } catch (requestError) {
      setError(requestError.payload?.message || requestError.message || 'Unable to calculate a ride fare.')
    } finally {
      setBusy(false)
    }
  }

  async function bookRide(quote) {
    setBusy(true)
    setError('')
    try {
      const ride = await requestRide(quote._id)
      toast.success('Ride requested. You can follow updates from My rides.')
      navigate(`/rides/mine?rideId=${encodeURIComponent(ride._id)}`)
    } catch (requestError) {
      setError(requestError.payload?.message || requestError.message || 'Unable to request this ride.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState label="Checking ride availability..." />

  return (
    <section className="page-stack ride-page">
      <section className="shop-welcome ride-welcome">
        <div>
          <p className="eyebrow">Safe · Fast · Reliable</p>
          <h1>Book a ride</h1>
          <p>Enter your trip details to compare available vehicles and get an estimated fare.</p>
        </div>
        <Link className="ghost-button" to="/rides/mine">My rides</Link>
      </section>

      {!config?.enabled ? (
        <section className="panel empty-state">
          <h2>Ride service is not available in this region yet.</h2>
          <p>Switch your region or check again later.</p>
        </section>
      ) : (
        <form className="panel ride-form" onSubmit={calculateQuotes}>
          <div className="panel-header">
            <div>
              <p className="eyebrow">Your trip</p>
              <h2>Pickup and destination</h2>
            </div>
            <span>Region: {getSelectedDatabaseName() === 'E_ShopUSA' ? 'USA' : 'Ethiopia'}</span>
          </div>
          <div className="ride-stops-grid">
            {['pickup', 'dropoff'].map((stopName) => (
              <fieldset className="ride-stop-card" key={stopName}>
                <legend>{stopName === 'pickup' ? 'Pickup' : 'Drop-off'}</legend>
                <AddressAutocomplete key={trip[stopName].country} label="Street address or landmark"
                  value={trip[stopName].address1} country={trip[stopName].country} required
                  onChange={(value) => updateAddress(stopName, { target: { name: 'address1', value } })}
                  onSelect={(address) => {
                    setTrip((current) => ({ ...current, [stopName]: { ...current[stopName], ...address } }))
                    setQuotes([])
                  }} />
                <label>
                  Apartment or unit (optional)
                  <input name="address2" value={trip[stopName].address2} onChange={(event) => updateAddress(stopName, event)} />
                </label>
                <label>
                  City
                  <input name="city" value={trip[stopName].city} onChange={(event) => updateAddress(stopName, event)} required />
                </label>
                <label>
                  ZIP code (optional)
                  <input name="zip" value={trip[stopName].zip} onChange={(event) => updateAddress(stopName, event)} />
                </label>
                <label>
                  Contact phone
                  <input name="phone" type="tel" value={trip[stopName].phone} onChange={(event) => updateAddress(stopName, event)} required />
                </label>
                <input type="hidden" name="country" value={trip[stopName].country} />
              </fieldset>
            ))}
          </div>
          <label className="ride-passengers">
            Passengers
            <input
              type="number"
              min="1"
              max="16"
              value={trip.passengers}
              onChange={(event) => {
                setTrip((current) => ({ ...current, passengers: event.target.value }))
                setQuotes([])
              }}
              required
            />
          </label>
          <p className="section-note">Addresses are verified by the ride service. Fares are estimates; final payment is handled after the trip is completed.</p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="solid-button" type="submit" disabled={busy}>
            {busy ? 'Calculating...' : 'Calculate ride options'}
          </button>

          {quotes.length > 0 ? (
            <section className="ride-quotes" aria-live="polite">
              <h2>Choose a ride</h2>
              {quotes.map((quote) => (
                <article className="ride-quote-card" key={quote._id}>
                  <div>
                    <p className="eyebrow">{VEHICLE_NAMES[quote.vehicleOption] || quote.vehicleOption}</p>
                    <strong>{quote.currency?.toUpperCase()} {Number(quote.estimate).toFixed(2)}</strong>
                    <p>{Number(quote.baseline?.distanceKm || 0).toFixed(1)} km · {Math.round(quote.baseline?.minutes || 0)} min · up to {quote.seats} passenger{quote.seats === 1 ? '' : 's'}</p>
                  </div>
                  <button type="button" className="solid-button" disabled={busy} onClick={() => bookRide(quote)}>
                    {busy ? 'Requesting...' : 'Request this ride'}
                  </button>
                </article>
              ))}
            </section>
          ) : null}
        </form>
      )}
    </section>
  )
}

export default RideBookingPage
