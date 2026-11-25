import { useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import useStripeConfiguration from '../features/payment/useStripeConfiguration'

function CardForm({ onConfirm, returnUrl, disableWallets }) {
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
    <PaymentElement options={disableWallets ? { wallets: { applePay: 'never', googlePay: 'never' } } : undefined} />
    {error ? <p role="alert">{error}</p> : null}
    <button disabled={busy || !stripe || !elements} className="solid-button">Pay saved checkout total</button>
  </form>
}

export default function DeliveryCardPayment({ clientSecret, publishableKey, onConfirm, id, dedicatedMerchant = false, returnUrl, disableWallets = false }) {
  const { stripe, error } = useStripeConfiguration(publishableKey, !dedicatedMerchant || Boolean(publishableKey))
  if (!stripe) return <p role="alert">{error || (dedicatedMerchant && !publishableKey
    ? 'Converted payments require the dedicated Ethiopia USD merchant key saved by the server; the native merchant key cannot be substituted.'
    : 'Loading card payment configuration...')}</p>
  return <Elements stripe={stripe} options={{ clientSecret }}>
    <CardForm onConfirm={onConfirm} disableWallets={disableWallets} returnUrl={returnUrl || `${window.location.origin}/delivery-checkouts/${id}`} />
  </Elements>
}
