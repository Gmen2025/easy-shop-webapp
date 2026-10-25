import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../utils/googleMaps'
import { latLng } from '../utils/delivery'
import { rideDirectionsUrl, rideStopTitle } from '../utils/rides'

export default function RideMap({ stops, country, onSelectLocation, disabled }) {
  const container = useRef(null)
  const [error, setError] = useState('')
  const hasKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY)
  const url = rideDirectionsUrl(stops)

  useEffect(() => {
    if (!hasKey) return undefined
    let current = true
    let map
    const overlays = []
    loadGoogleMaps().then(async (maps) => {
      if (!current) return
      setError('')
      const points = stops.map((stop, index) => ({
        position: latLng(stop.address), title: rideStopTitle(stop, index), label: String(index + 1),
      })).filter((point) => point.position)
      map = new maps.Map(container.current, {
        center: points[0]?.position || (country === 'USA' ? { lat: 39.83, lng: -98.58 } : { lat: 9.03, lng: 38.75 }),
        zoom: points.length ? 13 : country === 'USA' ? 4 : 12,
        mapTypeControl: false, streetViewControl: false, gestureHandling: 'cooperative',
      })
      if (onSelectLocation && !disabled) map.addListener('click', (event) => {
        if (event.latLng) onSelectLocation({ latitude: event.latLng.lat(), longitude: event.latLng.lng() })
      })
      const bounds = new maps.LatLngBounds()
      points.forEach((point) => {
        overlays.push(new maps.Marker({ map, ...point }))
        bounds.extend(point.position)
      })
      if (points.length > 1) map.fitBounds(bounds, 45)
      // Never draw a partial route that skips an unlocated intermediate stop.
      if (points.length < 2 || points.length !== stops.length) return
      const { Route } = await maps.importLibrary('routes')
      if (!current) return
      const { routes } = await Route.computeRoutes({
        origin: points[0].position, destination: points.at(-1).position,
        intermediates: points.slice(1, -1).map((point) => ({ location: point.position })),
        travelMode: 'DRIVING', fields: ['path'],
      })
      if (!current) return
      if (!routes?.[0]?.path?.length) throw new Error('No driving route was returned.')
      overlays.push(new maps.Polyline({ map, path: routes[0].path, strokeColor: '#2563eb', strokeWeight: 5 }))
      routes[0].path.forEach((point) => bounds.extend(point))
      map.fitBounds(bounds, 45)
    }).catch((failure) => {
      if (current) setError(`Map preview unavailable: ${failure.message} Enter addresses manually or use external directions. Fares still require a server-verified road route.`)
    })
    return () => {
      current = false
      overlays.forEach((overlay) => overlay.setMap(null))
      if (map) window.google.maps.event.clearInstanceListeners(map)
    }
  }, [stops, country, onSelectLocation, disabled, hasKey])

  return <section className="ride-map-panel" aria-label="Trip map">
    {hasKey ? <div className="ride-map" ref={container} aria-label="Ride Google map" /> :
      <div className="ride-map-placeholder">
        <h2>Your route, at a glance</h2>
        <p>Search or enter your pickup and destination below. An interactive map requires a configured browser Maps key.</p>
      </div>}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {onSelectLocation && hasKey ? <p className="section-note">Click the map to set the selected stop. Addresses are verified by the server.</p> : null}
    {url ? <a className="ghost-button" href={url} target="_blank" rel="noreferrer">Open route in Google Maps (new tab)</a> : null}
  </section>
}
