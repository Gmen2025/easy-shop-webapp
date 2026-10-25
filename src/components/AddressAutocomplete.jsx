import { useEffect, useId, useRef, useState } from 'react'
import { loadGoogleMaps } from '../utils/googleMaps'
import { addressCountryCode, placeAddress } from '../utils/addressAutocomplete'

export default function AddressAutocomplete({ label = 'Street address', value, country, onChange, onSelect, ...inputProps }) {
  const id = useId()
  const session = useRef(null)
  const revision = useRef(0)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [active, setActive] = useState(-1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const hasKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY)
  const region = addressCountryCode(country)
  const visible = suggestions.length > 0 && query === value

  useEffect(() => {
    if (!hasKey || query.trim().length < 3 || query !== value) return undefined
    let current = true
    const requestRevision = revision.current
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const maps = await loadGoogleMaps()
        const { AutocompleteSuggestion, AutocompleteSessionToken } = await maps.importLibrary('places')
        if (!current || revision.current !== requestRevision) return
        session.current ||= new AutocompleteSessionToken()
        const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query, sessionToken: session.current,
          ...(region ? { includedRegionCodes: [region] } : {}),
        })
        if (current && revision.current === requestRevision) {
          setSuggestions(results.filter((result) => result.placePrediction))
          setActive(-1)
          setError('')
        }
      } catch (failure) {
        if (current && revision.current === requestRevision) {
          setError(`Address suggestions unavailable: ${failure.message} You can still enter the address manually.`)
          setSuggestions([])
        }
      } finally {
        if (current && revision.current === requestRevision) setLoading(false)
      }
    }, 300)
    return () => { current = false; clearTimeout(timer) }
  }, [query, value, region, hasKey])

  useEffect(() => () => { revision.current++ }, [])

  function close() {
    revision.current++
    session.current = null
    setSuggestions([])
    setQuery('')
    setLoading(false)
    setActive(-1)
  }

  async function select(prediction) {
    close()
    const selectedRevision = revision.current
    setLoading(true)
    setError('')
    try {
      const place = prediction.toPlace()
      session.current = null
      await place.fetchFields({ fields: ['id', 'addressComponents', 'formattedAddress', 'displayName', 'location'] })
      if (revision.current === selectedRevision) {
        onSelect(placeAddress(place))
        setError('')
      }
    } catch (failure) {
      if (revision.current === selectedRevision) setError(`Could not select this address: ${failure.message}`)
    } finally {
      if (revision.current === selectedRevision) setLoading(false)
    }
  }

  return <div className="address-autocomplete"
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close() }}>
    <label htmlFor={id}>{label}</label>
    <input maxLength={300} {...inputProps} id={id} name="address1" value={value || ''} autoComplete="off"
      role="combobox" aria-autocomplete="list" aria-expanded={visible}
      aria-controls={`${id}-suggestions`} aria-describedby={`${id}-status`}
      aria-activedescendant={visible && active >= 0 ? `${id}-option-${active}` : undefined}
      onChange={(event) => {
        revision.current++
        setSuggestions([]); setActive(-1); setError(''); setLoading(false)
        setQuery(event.target.value)
        onChange(event.target.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); close() }
        if (!visible) return
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setActive((previous) => (previous + (event.key === 'ArrowDown' ? 1 : suggestions.length - 1) + suggestions.length) % suggestions.length)
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          if (active >= 0) select(suggestions[active].placePrediction)
        }
      }} />
    {visible ? <ul id={`${id}-suggestions`} role="listbox" aria-label={`${label} suggestions`}>
      {suggestions.map(({ placePrediction }, index) => <li key={placePrediction.placeId} role="presentation">
        <button type="button" role="option" id={`${id}-option-${index}`} aria-selected={active === index}
          onMouseDown={(event) => event.preventDefault()} onClick={() => select(placePrediction)}>
          {placePrediction.text.toString()}
        </button>
      </li>)}
      <li role="presentation" className="address-attribution">
        <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" />
      </li>
    </ul> : null}
    <small id={`${id}-status`} role={error ? 'alert' : 'status'}>
      {error || (loading ? 'Looking up address...' : !hasKey ? 'Google address suggestions need a configured browser key. Enter the address manually.' : '')}
    </small>
  </div>
}
