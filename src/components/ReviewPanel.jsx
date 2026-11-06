import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { getSelectedDatabaseName } from '../api/client'
import { ReviewAvailabilityContext, REVIEW_FEATURES, reviewQuery, reviewRequest } from '../api/reviews'

async function fetchPanel(kind, transaction, product, opened, ensureRegion, settings) {
  ensureRegion()
  const available = settings?.[REVIEW_FEATURES[kind]] === true
  const result = available && opened ? await reviewRequest(transaction
    ? reviewQuery(kind, transaction, product) : `products/${product}`) : null
  ensureRegion()
  return { available, result }
}

export default function ReviewPanel({ kind = 'product', transaction, product, title = 'Product reviews' }) {
  const { settings } = useContext(ReviewAvailabilityContext)
  const [enabled, setEnabled] = useState(false)
  const [opened, setOpened] = useState(false)
  const [data, setData] = useState(null)
  const [rating, setRating] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [database] = useState(getSelectedDatabaseName)
  const generation = useRef(0)
  const submitting = useRef(false)
  const ensureRegion = useCallback(() => {
    if (getSelectedDatabaseName() !== database) throw new Error('Region changed. Reload this page before reviewing.')
  }, [database])
  const load = useCallback(() => {
    if (submitting.current) return
    const current = ++generation.current
    return fetchPanel(kind, transaction, product, opened, ensureRegion, settings).then(({ available, result }) => {
      if (current === generation.current) {
        setEnabled(available)
        setData(result)
        setError('')
      }
    }).catch((failure) => {
      if (current === generation.current) { setEnabled(false); setData(null); setError(failure.message) }
    })
  }, [kind, transaction, product, opened, ensureRegion, settings])
  useEffect(() => {
    const invalidate = () => { ++generation.current }
    load()
    const timer = setInterval(load, 30000)
    window.addEventListener('focus', load)
    return () => { invalidate(); clearInterval(timer); window.removeEventListener('focus', load) }
  }, [load])
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    submitting.current = true
    const current = ++generation.current
    try {
      ensureRegion()
      const result = await reviewRequest('', { method: 'POST', body: JSON.stringify({
        kind, transaction, ...(product ? { product } : {}), rating: Number(rating), comment,
      }) })
      ensureRegion()
      if (current === generation.current) { setData(result); setRating(''); setComment('') }
    } catch (failure) {
      if (current === generation.current) {
        setError(failure.message)
        if (failure.status === 403) { setEnabled(false); setData(null) }
      }
    } finally { submitting.current = false; if (current === generation.current) setBusy(false) }
  }
  if (settings?.[REVIEW_FEATURES[kind]] !== true) return null
  if (!enabled && !error) return null
  return <section className="review-panel">
    {error ? <><p className="form-error" role="alert">{error}</p><button disabled={busy} onClick={load}>Retry reviews</button></> : null}
    {enabled ? <>
      <button type="button" className="ghost-button" aria-expanded={opened} onClick={() => setOpened(!opened)}>{title}</button>
      {opened ? <>
        {busy ? <p role="status">Loading reviews...</p> : null}
        {data?.review ? <div><p>Your review: {data.review.rating}/5</p><p>{data.review.comment}</p>
          <small>Submitted {new Date(data.review.dateCreated).toLocaleDateString()}</small></div> :
          transaction && data ? <form onSubmit={submit}>
            <label>Rating<select required disabled={busy} value={rating} onChange={(event) => setRating(event.target.value)}>
              <option value="">Choose stars</option>
              {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} stars</option>)}
            </select></label>
            <label>Review (optional)<textarea maxLength={2000} disabled={busy} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
            <button className="solid-button" disabled={busy || !rating} type="submit">Submit review</button>
          </form> : null}
        {!transaction && data ? <>
          <p>{data.rating.count ? `${data.rating.average.toFixed(1)}/5 (${data.rating.count} reviews)` : 'No reviews yet.'}</p>
          {data.reviews.map((review) => <article key={review._id}><p>{review.rating}/5 - {new Date(review.dateCreated).toLocaleDateString()}</p><p>{review.comment}</p></article>)}
        </> : null}
      </> : null}
    </> : null}
  </section>
}
