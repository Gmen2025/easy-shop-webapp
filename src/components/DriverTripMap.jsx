import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../utils/googleMaps'
import { latLng } from '../utils/delivery'
import useCompanyResource from '../features/company/useCompanyResource'

const routeResponse = (data) => {
  if (!Array.isArray(data?.coordinates) || data.coordinates.length < 2 ||
    data.coordinates.some((point) => !latLng(point)) || !Number.isFinite(data.distanceKm) || !Number.isFinite(data.minutes)) {
    throw new Error('The server returned an invalid passenger driving route.')
  }
  return data
}

export default function DriverTripMap({ stops, driver }) {
  const route = useCompanyResource('/rides/me/route', routeResponse, 60000)
  const container = useRef(null)
  const [error, setError] = useState('')
  const hasKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY)
  useEffect(() => {
    if (!hasKey || !route.data) return undefined
    let current = true
    let map
    const overlays = []
    loadGoogleMaps().then((maps) => {
      if (!current || !container.current) return
      map = new maps.Map(container.current, { center: latLng(route.data.coordinates[0]), zoom: 13,
        gestureHandling: 'cooperative', mapTypeControl: false, streetViewControl: false })
      const bounds = new maps.LatLngBounds()
      const path = route.data.coordinates.map(latLng)
      path.forEach((point) => bounds.extend(point))
      overlays.push(new maps.Polyline({ map, path, strokeColor: '#2563eb', strokeWeight: 5 }))
      for (const [index, stop] of stops.entries()) {
        const position = latLng(stop.address)
        if (position) overlays.push(new maps.Marker({ map, position, label: String(index + 1), title: stop.type }))
      }
      if (latLng(driver)) overlays.push(new maps.Marker({ map, position: latLng(driver), title: 'Driver' }))
      map.fitBounds(bounds, 45); setError('')
    }).catch((failure) => { if (current) setError(failure.message) })
    return () => {
      current = false
      overlays.forEach((overlay) => overlay.setMap(null))
      if (map) window.google.maps.event.clearInstanceListeners(map)
    }
  }, [route.data, hasKey, stops, driver])
  return <section className="delivery-map-panel" aria-label="Live passenger route">
    {hasKey ? <div className="delivery-map" ref={container} aria-label="Passenger driving map" /> :
      <p>The in-page map requires a browser Maps key. Use navigation to the next stop below.</p>}
    {route.data ? <p>{route.data.distanceKm.toFixed(2)} km | {Math.ceil(route.data.minutes)} minutes (Google road route)</p> : null}
    {route.error || error ? <p role="alert">Driving route unavailable: {route.error || error}. No straight-line route is substituted.</p> : null}
  </section>
}
