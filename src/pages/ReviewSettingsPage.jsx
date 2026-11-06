import { useCallback, useEffect, useState } from 'react'
import { REVIEW_FEATURES, REVIEW_LABELS, reviewRequest } from '../api/reviews'
import AdminNavigation from '../components/AdminNavigation'
import { getSelectedDatabaseName } from '../api/client'

export default function ReviewSettingsPage() {
  const [settings, setSettings] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [kind, setKind] = useState('product')
  const [reviews, setReviews] = useState([])
  const [reload, setReload] = useState(0)
  const [database] = useState(getSelectedDatabaseName)
  const ensureRegion = useCallback(() => {
    if (getSelectedDatabaseName() !== database) throw new Error('Region changed. Reopen review settings before continuing.')
  }, [database])
  const load = useCallback(() => reviewRequest('settings', { headers: { 'x-database-name': database } })
    .then((result) => { ensureRegion(); setSettings(result); setError('') })
    .catch((failure) => { setSettings(null); setError(failure.message) })
    .finally(() => { setBusy(false) }), [database, ensureRegion])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    let current = true
    if (settings?.[REVIEW_FEATURES[kind]]) reviewRequest(`admin?kind=${kind}`, { headers: { 'x-database-name': database } }).then((result) => {
      ensureRegion()
      if (current) setReviews(result.reviews)
    }).catch((failure) => { if (current) { setReviews([]); setError(failure.message) } })
    return () => { current = false }
  }, [settings, kind, reload, database, ensureRegion])
  async function save(key, value) {
    setBusy(true); setError('')
    try {
      ensureRegion()
      const saved = await reviewRequest('settings', { method: 'PUT', body: JSON.stringify({ [key]: value }),
        headers: { 'x-database-name': database } })
      ensureRegion()
      setSettings(saved)
    }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <section className="page-stack">
    <AdminNavigation />
    <section className="panel">
      <h1>Review settings</h1>
      <p>Switches apply to the selected shopping region and default off. Disabling hides reviews and blocks submissions without deleting saved reviews.</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button disabled={busy} onClick={load}>Refresh settings</button>
      {settings ? [['products', 'Products'], ['deliveries', 'Delivery experience'], ['rides', 'Drivers and ride customers'], ['services', 'Service fulfillment']].map(([key, label]) =>
        <label key={key}><input type="checkbox" checked={settings[key]} disabled={busy} onChange={(event) => save(key, event.target.checked)} />{label}</label>) : null}
    </section>
    <section className="panel">
      <h2>Recent reviews</h2>
      <label>Review type<select value={kind} onChange={(event) => { setReviews([]); setKind(event.target.value) }}>
        {Object.entries(REVIEW_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <button onClick={() => setReload((value) => value + 1)}>Refresh reviews</button>
      {settings?.[REVIEW_FEATURES[kind]] ? reviews.map((review) => <article key={review._id}>
        <p>{review.rating}/5 - {new Date(review.dateCreated).toLocaleDateString()} - Transaction {review.transaction}</p><p>{review.comment}</p>
      </article>) : <p>Enable this review feature to view its saved reviews.</p>}
    </section>
  </section>
}
