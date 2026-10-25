import { useEffect, useRef, useState } from 'react'
import { directionsUrl, latLng } from '../utils/delivery'

let mapsPromise
const EMPTY_ROUTE = []
function loadMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (!mapsPromise) {
    mapsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      const query = new URLSearchParams({
        key: import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY, v: 'weekly', loading: 'async',
        callback: '__deliveryMapsReady',
      })
      window.__deliveryMapsReady = () => {
        delete window.__deliveryMapsReady
        resolve(window.google.maps)
      }
      script.src = `https://maps.googleapis.com/maps/api/js?${query}`
      script.onerror = () => {
        script.remove()
        delete window.__deliveryMapsReady
        mapsPromise = undefined
        reject(new Error('Google Maps could not load. Check browser key restrictions, billing and connectivity.'))
      }
      document.head.appendChild(script)
    })
  }
  return mapsPromise
}

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
    loadMaps().then((maps) => {
      if (!current) return
      const points = [
        [pickup, 'Pickup'], [dropoff, 'Drop-off'], [driver, 'Driver'],
      ].map(([point, title]) => ({ position: latLng(point), title })).filter((point) => point.position)
      const path = coordinates.map(latLng).filter(Boolean)
      if (!points.length && !path.length) return
      map = new maps.Map(container.current, {
        center: points[0]?.position || path[0], zoom: 13, mapTypeControl: false,
      })
      const bounds = new maps.LatLngBounds()
      for (const point of points) {
        overlays.push(new maps.Marker({ map, ...point }))
        bounds.extend(point.position)
      }
      if (path.length > 1) {
        overlays.push(new maps.Polyline({ map, path, strokeColor: '#2563eb', strokeWeight: 5 }))
        path.forEach((point) => bounds.extend(point))
      }
      if (points.length + path.length > 1) map.fitBounds(bounds, 45)
    }).catch((failure) => { if (current) setError(failure.message) })
    return () => {
      current = false
      overlays.forEach((overlay) => overlay.setMap(null))
      if (map) window.google.maps.event.clearInstanceListeners(map)
    }
  }, [pickup, dropoff, driver, coordinates, hasKey])
  return <div className="delivery-map-panel">
    {hasKey ? <div ref={container} className="delivery-map" aria-label="Delivery Google map" /> :
      <p className="section-note">Embedded map is not configured. Google Maps navigation remains available.</p>}
    {error ? <p role="alert">{error}</p> : null}
    {requireDriverOrigin && !latLng(driver) ? <p role="status">Enable live GPS for driving directions from your current location. The store is the pickup destination, not the driver's starting point.</p> : null}
    {url ? <a className="ghost-button" href={url} target="_blank" rel="noreferrer">Open driving directions in Google Maps</a> : null}
  </div>
}
