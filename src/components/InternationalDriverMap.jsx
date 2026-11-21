import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../utils/googleMaps'
import { internationalDriverRoute } from '../utils/internationalHub'

export default function InternationalDriverMap({ shipment }) {
  const container = useRef(null)
  const [error, setError] = useState('')
  const { pickup, destination, url } = internationalDriverRoute(shipment)
  const destinationJson = JSON.stringify(destination)
  const hasKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY)

  useEffect(() => {
    if (!hasKey || !url) return undefined
    let active = true
    let map
    const overlays = []
    loadGoogleMaps().then(async (maps) => {
      const { Route } = await maps.importLibrary('routes')
      const { routes } = await Route.computeRoutes({
        origin: pickup, destination: JSON.parse(destinationJson), travelMode: 'DRIVING', fields: ['path'],
      })
      if (!active) return
      const path = routes?.[0]?.path
      if (!path || path.length < 2) throw new Error('No driving route was returned for these addresses.')
      map = new maps.Map(container.current, { center: path[0], zoom: 13, gestureHandling: 'cooperative', mapTypeControl: false })
      const bounds = new maps.LatLngBounds()
      path.forEach((point) => bounds.extend(point))
      overlays.push(new maps.Polyline({ map, path, strokeColor: '#2563eb', strokeWeight: 5 }))
      overlays.push(new maps.Marker({ map, position: path[0], title: 'Hub pickup' }))
      overlays.push(new maps.Marker({ map, position: path[path.length - 1], title: 'Recipient delivery' }))
      map.fitBounds(bounds, 45)
      setError('')
    }).catch((failure) => {
      if (active) setError(`Driving route unavailable: ${failure.message}. Check Maps JavaScript and Routes API configuration or use external navigation.`)
    })
    return () => {
      active = false
      overlays.forEach((overlay) => overlay.setMap(null))
      if (map) window.google.maps.event.clearInstanceListeners(map)
    }
  }, [hasKey, pickup, destinationJson, url])

  if (!url) return <p role="status">Driving route unavailable: the hub pickup address or recipient address is missing. Ask the hub to verify the shipment.</p>
  return <section className="delivery-map-panel" aria-label="Hub-to-recipient driving route">
    <h4>Hub-to-recipient driving route</h4>
    {hasKey ? <div ref={container} className="delivery-map" aria-label="International delivery driving map" /> :
      <p>The in-page map requires a configured browser Maps key.</p>}
    {error ? <p role="alert">{error}</p> : null}
    <a className="ghost-button delivery-map-directions" href={url} target="_blank" rel="noreferrer">Open hub-to-recipient driving route in Google Maps (new tab)</a>
    <p>Verify both locations in the map before driving. This route does not include travel to the hub.</p>
  </section>
}
