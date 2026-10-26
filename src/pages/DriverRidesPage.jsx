import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest, getSelectedDatabaseName } from '../api/client'
import { uploadDriverPhoto } from '../api/uploads'
import CompanyNavigation, { CompanyMetrics } from '../components/CompanyNavigation'
import DriverTripMap from '../components/DriverTripMap'
import useCompanyResource, { useCompanyAction } from '../features/company/useCompanyResource'
import useDriverLocation from '../features/company/useDriverLocation'
import { driverRideFare, validateDriverRides } from '../utils/company'
import { addressText, directionsUrl, VEHICLES } from '../utils/delivery'

const request = (path, data, method = 'POST') => apiRequest(`/rides/${path}`, {
  method, body: JSON.stringify(data), timeoutMs: 120000,
})

export default function DriverRidesPage({ tripOnly = false }) {
  const rides = useCompanyResource('/rides/me/driver', validateDriverRides, 15000)
  const gps = useDriverLocation()
  const action = useCompanyAction()
  const [tab, setTab] = useState('home')
  const [vehicle, setVehicle] = useState('')
  const [reason, setReason] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [now, setNow] = useState(Date.now)
  const data = rides.data
  const driver = data?.driver
  const trip = data?.trip
  const offer = data?.offer
  const payments = data?.payments || []
  const completed = payments.filter((ride) => ride.status === 'completed')
  const pending = useMemo(() => trip?.stops.filter((stop) => !stop.completedAt) || [], [trip])
  const next = pending[0]
  const started = Boolean(trip?.startedAt || trip?.stops.some((stop) => stop.completedAt))
  const remaining = offer ? Math.max(0, Math.ceil((Date.parse(offer.offerDeadline) - now) / 1000)) : 0
  const busy = action.busy
  const act = (path, body = {}, method = 'POST') => action.run(async () => {
    await request(path, body, method)
    await rides.reload()
  }, 'Ride update saved.')
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(clock)
  }, [])
  const confirmNext = () => {
    if (!window.confirm(next.type === 'pickup' ? `Confirm all ${next.passengers} passengers are inside the vehicle?` :
      `Confirm all ${next.passengers} passengers have safely left the vehicle?`)) return
    action.run(async () => {
      await gps.reportNow()
      await request('me/next-stop', { stopKey: `${next.ride}:${next.key}` })
      await rides.reload()
    }, 'Passenger stop confirmed.')
  }
  const setMode = (mode, enabled) => {
    if (mode === 'shared' && !enabled && !window.confirm('Disable shared rides and immediately reroute accepted riders not yet picked up? Onboard riders stay with you.')) return
    act('me/modes', { delivery: true, regular: false, shared: false, ...driver.serviceModes, [mode]: enabled }, 'PUT')
  }
  const activeTrip = trip ? <article className={`panel company-trip${tripOnly ? ' company-trip-expanded' : ''}`}>
    <div className="company-heading"><h2>{tripOnly ? 'Ride in Progress' : `Active ${trip.mode} trip`}</h2>
      <button className="ghost-button" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? 'Expand trip details' : 'Collapse trip details'}</button></div>
    {pending.length ? <DriverTripMap key={`${trip._id}:${trip.version}`} stops={pending} driver={gps.point || driver.location} /> : null}
    {!collapsed ? <>
      {!tripOnly ? <Link className="ghost-button" to="/driver/rides/trip">Open full-screen ride map</Link> : <Link to="/driver/rides">Service preferences & end booking</Link>}
      <p>Onboard {trip.onboardSeats} / {trip.seatCapacity} passenger seats.</p>
      <p>Pickups {trip.stops.filter((stop) => stop.type === 'pickup' && stop.completedAt).length}/{trip.stops.filter((stop) => stop.type === 'pickup').length} confirmed.{' '}
        Drop-offs {trip.stops.filter((stop) => stop.type === 'dropoff' && stop.completedAt).length}/{trip.stops.filter((stop) => stop.type === 'dropoff').length} confirmed.</p>
      {!started ? <button className="solid-button" disabled={busy} onClick={() => act('me/start-trip', { tripId: trip._id })}>Start trip to pickup</button> :
        <p>Trip started. Confirm stops only when passengers board or leave.</p>}
      <p>Starting does not mark passengers onboard or start their fare timer. Keep this page open for GPS updates.</p>
      {next ? <div className="order-card">
        <h3>Next: {next.type === 'pickup' ? 'Pickup' : 'Drop-off'} - {next.passengers} passengers</h3><p>{addressText(next.address)}</p>
        <div className="action-row">{directionsUrl(next.address) ? <a className="ghost-button" href={directionsUrl(next.address)} target="_blank" rel="noreferrer">Navigate to next stop</a> :
          <p role="alert">No verified map location is available for this stop.</p>}
          <button className="solid-button" disabled={busy || !started} onClick={confirmNext}>{next.type === 'pickup' ? 'Passengers onboard' : 'Passengers dropped off'}</button></div>
      </div> : null}
      {pending.map((stop, index) => {
        const rider = data.riders.find((entry) => String(entry._id) === String(stop.ride))
        const phone = String(stop.address?.phone || '').replace(/[^\d+]/g, '')
        return <div key={`${stop.ride}:${stop.key}`} className="company-stop">
          <h3>{index + 1}. {stop.type} - {stop.passengers} passengers</h3>
          <p>{rider?.customerName || 'Customer'} | Booking #{String(stop.ride).slice(-6)}</p>
          <p>{addressText(stop.address)}</p>{/\d/.test(phone) ? <a href={`tel:${phone}`}>Call customer</a> : <p>Contact number unavailable</p>}
        </div>
      })}
      {!tripOnly ? <><h3>End a booking without completion</h3>
        <p>Use only after the affected passengers have safely exited. Other bookings stay active; payment goes to Admin review. This does not confirm arrival.</p>
        <label>Termination reason<textarea value={reason} maxLength={500} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="action-row">{data.riders.map((rider) => <button className="danger-button" key={rider._id} disabled={busy || !reason.trim()} onClick={() => {
          if (window.confirm('Confirm the affected passengers have safely exited? This ends the booking at your GPS without marking it completed. Admin will review any fare.')) action.run(async () => {
            await gps.reportNow()
            await request(`me/rides/${rider._id}/terminate`, { reason })
            setReason('')
            await rides.reload()
          }, 'Booking ended and sent for Admin review.')
        }}>Terminate booking #{String(rider._id).slice(-6)}</button>)}</div>
      </> : null}
    </> : null}
  </article> : <article className="panel"><h2>No active passenger trip</h2><p>Check ride assignments for payments and new offers.</p></article>

  return <section className={`page-stack company-console company-driver${tripOnly ? ' company-trip-screen' : ''}`}>
    <CompanyNavigation driver />
    <header className="panel company-heading"><div><p className="company-eyebrow">Addu Genet Ride</p><h1>Company Driver</h1></div>
      <button className="ghost-button" disabled={busy || rides.loading} onClick={() => action.run(rides.reload)}>Refresh ride status</button></header>
    <div className="panel"><button className="solid-button" onClick={gps.toggle}>{gps.sharing ? 'Stop GPS sharing' : 'Enable live GPS'}</button>
      <p role="status">{gps.status}</p>{gps.error ? <p className="form-error" role="alert">GPS: {gps.error}</p> : null}
      <p>Browser GPS needs permission and HTTPS (or localhost). Keep this page open; background tracking is not guaranteed. External turn-by-turn navigation opens in a new tab.</p></div>
    {rides.error || action.error ? <p className="form-error" role="alert">{rides.error || action.error}</p> : null}
    {action.notice ? <p role="status">{action.notice}</p> : null}
    {rides.loading && !data ? <p role="status">Loading driver rides...</p> : null}
    {!tripOnly ? <nav className="company-ride-tabs" aria-label="Driver ride sections">
      {[['home', 'Home'], ['rides', 'My Rides'], ['earnings', 'Earnings'], ['profile', 'Profile']].map(([key, label]) =>
        <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
    </nav> : null}
    {driver ? tripOnly ? activeTrip : <>
      {tab === 'home' ? <>
        <article className="panel company-driver-profile">
          {driver.profilePhotoUrl ? <img className="company-avatar" src={driver.profilePhotoUrl} alt={`${driver.name || 'Driver'} profile`} /> : <span className="company-avatar company-avatar-placeholder">{(driver.name || 'D').slice(0, 1)}</span>}
          <div><h2>{driver.name || 'Ride Driver'}</h2><p>{driver.vehicleType} | {driver.passengerSeats || 'Unconfigured'} passenger seats</p>
            <p>Approval: {driver.approvalStatus}</p></div><strong className={driver.isAvailable ? 'company-online' : ''}>{driver.isAvailable ? 'Online' : 'Offline'}</strong>
        </article>
        <article className="panel"><CompanyMetrics items={[['Recent rides', completed.length], ['Passengers onboard', trip?.onboardSeats || 0], ['Ride status', trip ? 'Active' : 'Ready']]} /></article>
        <article className="panel"><h2>Ride availability</h2>
          <p>{trip ? 'Your passenger trip is in progress.' : offer && remaining ? 'A new ride request is waiting.' : 'Receive requests when approved, online and your ride service is enabled.'}</p>
          {driver.isSuspended ? <p role="alert">Your driver account is suspended. Contact Admin.</p> : null}
          <button className="solid-button" onClick={() => setTab('rides')}>{trip ? 'Open active ride' : 'View ride assignments'}</button>
        </article>
        {trip ? activeTrip : null}
        <article className="panel"><h2>Recent rides</h2><button className="ghost-button" onClick={() => setTab('earnings')}>View all earnings</button>
          <RideHistory payments={payments.slice(0, 3)} busy={busy} onCash={(ride) => act(`${ride._id}/received-payment`)} /></article>
      </> : null}
      {tab === 'rides' ? <>
        <article className="panel"><h2>Ride request</h2>
          {offer && remaining > 0 ? <>
            <p className="company-warning">Respond within {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p>
            <p>{offer.vehicleOption || offer.mode} | {offer.seats} passenger(s)</p>
            <h3>Estimated fare: {driverRideFare(offer, offer.estimate)}</h3>
            {offer.stops.map((stop, index) => <p key={stop.key || index}>{index + 1}. {stop.type}: {addressText(stop.address)}</p>)}
            {driver.rideProfilePhotoRequired ? <p>Refresh your ride profile photo before accepting.</p> : null}
            <div className="action-row"><button className="ghost-button" disabled={busy} onClick={() => act(`me/offers/${offer._id}/reject`)}>Decline</button>
              <button className="solid-button" disabled={busy || driver.rideProfilePhotoRequired || Boolean(rides.error)} onClick={() => action.run(async () => {
                await request(`me/offers/${offer._id}/accept`, {})
                await rides.reload()
              }, 'Ride accepted. Open the active trip below.')}>Accept Ride</button></div>
          </> : <p>{offer ? 'Offer expired and is being rerouted.' : 'No current ride offer. New offers expire after three minutes.'}</p>}
        </article>{activeTrip}
      </> : null}
      {tab === 'earnings' ? <article className="panel"><h2>Completed ride fares</h2>
        <p>Fare total from the 20 most recent ended rides, not a payout or proof of payment.</p>
        <h3>{driverRideFare({ currency: payments[0]?.currency || (/usa/i.test(getSelectedDatabaseName()) ? 'usd' : 'etb') },
          completed.reduce((sum, ride) => sum + Number(ride.finalFare || 0), 0))}</h3>
        <p>{completed.length} completed ride(s) in recent history</p><h3>Ride history</h3>
        <RideHistory payments={payments} busy={busy} onCash={(ride) => act(`${ride._id}/received-payment`)} />
      </article> : null}
      {tab === 'profile' ? <>
        <article className="panel"><h2>Ride profile photo</h2>
          {driver.profilePhotoUrl ? <img className="company-avatar" src={driver.profilePhotoUrl} alt="Saved driver profile" /> : null}
          {driver.rideProfilePhotoRequired ? <p>Take a current photo to enable ride offers. Refresh it every 90 days. Active trips can still finish safely.</p> :
            Number.isFinite(Date.parse(driver.rideProfilePhotoUpdatedAt)) ? <p>Next refresh due {new Date(Date.parse(driver.rideProfilePhotoUpdatedAt) + 90 * 86400000).toLocaleDateString()}.</p> :
              <p role="alert">Photo refresh date unavailable. Refresh ride status or upload a new current photo.</p>}
          <label>Take or upload a current driver photo (JPEG, PNG or WebP, up to 5 MB)
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" disabled={busy} onChange={(event) => {
              const file = event.target.files?.[0]; event.target.value = ''
              if (!file) return
              action.run(async () => {
                const profilePhotoUrl = await uploadDriverPhoto(file)
                await request('me/profile-photo', { profilePhotoUrl }, 'PUT')
                await rides.reload()
              }, 'Driver profile photo updated.')
            }} /></label>
        </article>
        <article className="panel"><h2>Service preferences</h2>
          <p>{driver.vehicleType}: {driver.passengerSeats || 'Admin must configure'} passenger seats. {driver.carClass ? `Class: ${driver.carClass}.` : ''}</p>
          <p>Motorcycle and truck are delivery-only. Car and van passenger seats must be configured by Admin. Car class-selected bookings also need Admin to assign Economy or Comfort.</p>
          {driver.pendingVehicleType ? <p className="company-warning">Awaiting Admin verification: {driver.pendingVehicleType}. Registered vehicle remains {driver.vehicleType}.</p> : null}
          <label>Registered vehicle<select value={vehicle || driver.pendingVehicleType || driver.vehicleType} disabled={busy || Boolean(trip || offer)} onChange={(event) => setVehicle(event.target.value)}>
            {VEHICLES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <button className="solid-button" disabled={busy || Boolean(trip || offer)} onClick={() => act('me/vehicle', { vehicleType: vehicle || driver.pendingVehicleType || driver.vehicleType }, 'PUT')}>Submit vehicle selection</button>
          <p>Changed vehicles require Admin verification; new passenger offers pause. Select the registered type again to cancel a pending change.</p>
          <p>Approval: {driver.approvalStatus}. {driver.isAvailable ? 'Online' : 'Offline'}{driver.isSuspended ? ' - Suspended' : ''}.</p>
          {[['delivery', 'Store product delivery'], ['regular', 'Regular rides'], ['shared', 'Shared rides']].map(([mode, label]) => {
            const enabled = driver.serviceModes[mode] ?? mode === 'delivery'
            return <label className="company-mode" key={mode}><input type="checkbox" checked={enabled}
              disabled={busy || (mode !== 'delivery' && !enabled && (driver.rideProfilePhotoRequired || Boolean(driver.pendingVehicleType)))}
              onChange={(event) => setMode(mode, event.target.checked)} />{label}</label>
          })}
          {driver.serviceModes.shared ? <><p>Shared intake: {driver.sharedIntakeOpen ? 'Open' : 'Closed'}</p>
            <button className="ghost-button" disabled={busy} onClick={() => {
              if (!driver.sharedIntakeOpen || window.confirm('Stop shared intake? Accepted riders not yet picked up will immediately reroute. Onboard riders stay.')) act('me/shared-intake', { open: !driver.sharedIntakeOpen })
            }}>{driver.sharedIntakeOpen ? 'Stop shared intake' : 'Reopen shared intake'}</button></> : null}
        </article>
      </> : null}
    </> : null}
  </section>
}

function RideHistory({ payments, busy, onCash }) {
  return payments.length ? payments.map((ride) => <div className="order-card" key={ride._id}>
    <h3>{ride.stops?.[0]?.address?.address1 || 'Pickup'} to {ride.stops?.at(-1)?.address?.address1 || 'Drop-off'}</h3>
    <strong>{driverRideFare(ride)}</strong><p>#{String(ride._id).slice(-6)} | {ride.status} | {ride.paymentMethod || 'Payment method not selected'} | {ride.paymentStatus || 'Payment pending'}</p>
    {ride.status === 'terminated' ? <p>Ended without completion. {ride.paymentStatus === 'review_required' ? 'Payment is on hold for Admin review.' : ''}</p> : null}
    {ride.paymentMethod === 'cash' && ride.paymentStatus !== 'completed' ? <button className="solid-button" disabled={busy} onClick={() => {
      if (window.confirm(`Confirm only after receiving ${driverRideFare(ride)} from this booking's payer.`)) onCash(ride)
    }}>Confirm cash received</button> : null}
  </div>) : <p>Completed ride history will appear here.</p>
}
