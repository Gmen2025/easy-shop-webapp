let mapsPromise

export function loadGoogleMaps() {
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
