import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { cancelRide, getRide, getRides } from '../api/rides'
import ErrorState from '../components/ErrorState'
import LoadingState from '../components/LoadingState'
import RideCheckout from '../components/RideCheckout'

async function fetchRideData(rideId) {
  const [list, detail] = await Promise.all([
    getRides(),
    rideId ? getRide(rideId) : Promise.resolve(null),
  ])
  return { list: Array.isArray(list) ? list : [], detail }
}

const RIDE_STATUS = {
  quote: 'Ride estimate',
  waiting: 'Finding your driver',
  offered: 'Waiting for driver confirmation',
  assigned: 'Driver on the way',
  onboard: 'Trip in progress',
  completed: "You've arrived",
  cancelled: 'Ride cancelled',
  terminated: 'Trip ended early',
}

function rideAddress(address) {
  return [address?.address1, address?.address2, address?.city, address?.country].filter(Boolean).join(', ')
}

function MyRidesPage() {
  const [searchParams] = useSearchParams()
  const rideId = searchParams.get('rideId')
  const [rides, setRides] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function loadRides() {
    setLoading(true)
    setError('')
    try {
      const { list, detail } = await fetchRideData(rideId)
      setRides(list)
      setSelected(detail)
    } catch (requestError) {
      setError(requestError.payload?.message || requestError.message || 'Unable to load your rides.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let current = true
    fetchRideData(rideId)
      .then(({ list, detail }) => {
        if (current) {
          setRides(list)
          setSelected(detail)
          setError('')
        }
      })
      .catch((requestError) => {
        if (current) setError(requestError.payload?.message || requestError.message || 'Unable to load your rides.')
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [rideId])

  async function cancelSelectedRide() {
    if (!selected || !window.confirm('Cancel this ride?')) return
    setBusy(true)
    setError('')
    try {
      const updated = await cancelRide(selected._id)
      setSelected(updated)
      setRides((current) => current.map((ride) => ride._id === updated._id ? updated : ride))
      toast.success('Ride cancelled.')
    } catch (requestError) {
      setError(requestError.payload?.message || requestError.message || 'Unable to cancel this ride.')
    } finally {
      setBusy(false)
    }
  }

  if (loading && rides.length === 0 && !selected) return <LoadingState label="Loading your rides..." />
  if (error && rides.length === 0 && !selected) return <ErrorState message={error} onRetry={loadRides} />

  return (
    <section className="page-stack">
      <section className="shop-welcome ride-welcome">
        <div>
          <p className="eyebrow">Ride service</p>
          <h1>My rides</h1>
          <p>Review current ride status and revisit previous trips.</p>
        </div>
        <Link className="solid-button" to="/rides">Book a ride</Link>
      </section>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {selected ? (
        <section className="panel ride-detail-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Ride #{String(selected._id).slice(-6)}</p>
              <h2>{RIDE_STATUS[selected.status] || selected.status}</h2>
            </div>
            <button type="button" className="ghost-button" disabled={busy} onClick={loadRides}>Refresh</button>
          </div>
          {selected.dispatchMessage ? <p>{selected.dispatchMessage}</p> : null}
          <ol className="ride-stop-list">
            {(selected.stops || []).map((stop) => (
              <li key={stop.key || `${stop.type}-${rideAddress(stop.address)}`}>
                <strong>{stop.type === 'pickup' ? 'Pickup' : 'Drop-off'}</strong>
                <span>{rideAddress(stop.address)}</span>
              </li>
            ))}
          </ol>
          <p>Estimated fare: <strong>{selected.currency?.toUpperCase()} {Number(selected.estimate || 0).toFixed(2)}</strong></p>
          <p className="section-note">Payment is available after the ride is completed or Admin approves a terminated ride&apos;s fare.</p>
          {selected.status === 'completed' || (selected.status === 'terminated' && selected.termination?.reviewStatus === 'resolved' && selected.paymentStatus !== 'waived') ?
            <RideCheckout key={selected._id} ride={selected} onUpdated={(updated) => {
              setSelected(updated); setRides((current) => current.map((entry) => entry._id === updated._id ? updated : entry))
            }} /> : null}
          {['waiting', 'offered', 'assigned'].includes(selected.status) ? (
            <button type="button" className="ghost-button danger-button" disabled={busy} onClick={cancelSelectedRide}>
              {busy ? 'Cancelling...' : 'Cancel ride'}
            </button>
          ) : null}
        </section>
      ) : null}
      <section className="panel">
        <div className="panel-header">
          <h2>Ride history</h2>
          <button type="button" className="text-button" disabled={loading} onClick={loadRides}>Refresh rides</button>
        </div>
        {rides.length === 0 ? <p className="empty-state">You have not booked a ride yet.</p> : (
          <div className="ride-history-list">
            {rides.map((ride) => (
              <article className="ride-history-card" key={ride._id}>
                <div>
                  <p className="eyebrow">{RIDE_STATUS[ride.status] || ride.status}</p>
                  <strong>{rideAddress(ride.stops?.[0]?.address)} → {rideAddress(ride.stops?.at(-1)?.address)}</strong>
                  <p>{ride.currency?.toUpperCase()} {Number(ride.estimate || 0).toFixed(2)} · {ride.mode}</p>
                </div>
                <Link className="ghost-button" to={`/rides/mine?rideId=${encodeURIComponent(ride._id)}`}>View ride</Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

export default MyRidesPage
