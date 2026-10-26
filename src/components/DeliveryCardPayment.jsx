import { useMemo, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'

function CardForm({ onConfirm, returnUrl }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (!stripe || !elements || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await stripe.confirmPayment({
        elements, confirmParams: { return_url: returnUrl }, redirect: 'if_required',
      })
      if (result.error) throw new Error(`${result.error.message} Check this checkout's payment status before retrying.`)
      await onConfirm()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit} className="form-grid">
    <PaymentElement />
    {error ? <p role="alert">{error}</p> : null}
    <button disabled={busy || !stripe || !elements} className="solid-button">Pay saved checkout total</button>
  </form>
}

export default function DeliveryCardPayment({ clientSecret, publishableKey, onConfirm, id, dedicatedMerchant = false, returnUrl }) {
  const key = publishableKey || (!dedicatedMerchant ? import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY : '')
  const stripe = useMemo(() => key ? loadStripe(key) : null, [key])
  if (!stripe) return <p role="alert">Stripe publishable key is missing. Configure the matching merchant key before paying.
    {dedicatedMerchant ? ' Converted payments require the dedicated Ethiopia USD merchant key saved by the server; the native merchant key cannot be substituted.' : ''}</p>
  return <Elements stripe={stripe} options={{ clientSecret }}>
    <CardForm onConfirm={onConfirm} returnUrl={returnUrl || `${window.location.origin}/delivery-checkouts/${id}`} />
  </Elements>
}
