import { useEffect, useRef, useState } from 'react'
import { directionsUrl, latLng } from '../utils/delivery'
import { loadGoogleMaps } from '../utils/googleMaps'

const EMPTY_ROUTE = []

export default function DeliveryMap({ pickup, dropoff, driver, coordinates = EMPTY_ROUTE, requireDriverOrigin = false }) {
  const container = useRef(null)
  const [error, setError] = useState('')
  const hasKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY)
  const destination = dropoff || pickup
  const url = directionsUrl(destination, requireDriverOrigin ? driver : driver || (dropoff ? pickup : undefined), { requireOrigin: requireDriverOrigin })
  useEffect(() => {
    if (!hasKey) return undefined
    let current = true
    let map
    const overlays = []
    loadGoogleMaps().then(async (maps) => {
      if (!current) return
      setError('')
      const points = [
        [pickup, 'Pickup'], [dropoff, 'Drop-off'], [driver, 'Driver'],
      ].map(([point, title]) => ({ position: latLng(point), title })).filter((point) => point.position)
      const path = coordinates.map(latLng).filter(Boolean)
      if (!points.length && !path.length) return
      map = new maps.Map(container.current, {
        center: points[0]?.position || path[0], zoom: 13, mapTypeControl: false,
        gestureHandling: 'cooperative',
      })
      const bounds = new maps.LatLngBounds()
      for (const point of points) {
        overlays.push(new maps.Marker({ map, ...point }))
        bounds.extend(point.position)
      }
      if (path.length > 1) {
        overlays.push(new maps.Polyline({ map, path, strokeColor: '#2563eb', strokeWeight: 5 }))
        path.forEach((point) => bounds.extend(point))
      } else {
        const origin = latLng(requireDriverOrigin ? driver : driver || (dropoff ? pickup : null))
        const end = latLng(dropoff || pickup)
        if (origin && end) {
          const { Route } = await maps.importLibrary('routes')
          if (!current) return
          const { routes } = await Route.computeRoutes({
            origin, destination: end, travelMode: 'DRIVING', fields: ['path'],
          })
          if (!current) return
          const route = routes?.[0]
          if (!route?.path?.length) throw new Error('No driving route was returned for these locations.')
          for (const polyline of route.createPolylines()) {
            overlays.push(polyline)
            polyline.setMap(map)
          }
          route.path.forEach((point) => bounds.extend(point))
        }
      }
      if (points.length + path.length > 1) map.fitBounds(bounds, 45)
    }).catch((failure) => {
      if (current) setError(`The in-app Google map or driving route is unavailable: ${failure.message} Check Maps JavaScript API and Routes API authorization, billing and connectivity, or use external navigation. Checkout pricing still uses the server-verified route.`)
    })
    return () => {
      current = false
      overlays.forEach((overlay) => overlay.setMap(null))
      if (map) window.google.maps.event.clearInstanceListeners(map)
    }
  }, [pickup, dropoff, driver, coordinates, hasKey, requireDriverOrigin])
  return <div className="delivery-map-panel">
    {hasKey ? <div ref={container} className="delivery-map" aria-label="Delivery Google map" /> :
      <p className="section-note">The in-app Google map needs a configured browser Maps key. External Google Maps navigation is available below.</p>}
    {error ? <p role="alert">{error}</p> : null}
    {requireDriverOrigin && !latLng(driver) ? <p role="status">Enable live GPS for driving directions from your current location. The store is the pickup destination, not the driver's starting point.</p> : null}
    {url ? <a className="ghost-button delivery-map-directions" href={url} target="_blank" rel="noreferrer">Open driving directions in Google Maps (new tab)</a> : null}
    {hasKey ? <p className="section-note">Explore the driving route here without leaving checkout. External navigation opens a new tab. Map previews do not change the saved delivery fee.</p> : null}
  </div>
}
