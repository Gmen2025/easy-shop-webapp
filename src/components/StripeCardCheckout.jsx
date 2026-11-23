import { useState } from 'react'
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'

function StripeCardCheckout({ clientSecret, onConfirmed, onError }) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [paid, setPaid] = useState(false)

  function getReadableStripeError(error) {
    const message = String(error?.message || '').trim()
    if (/load failed|failed to fetch|network/i.test(message)) {
      return 'Unable to reach Stripe right now. Check your connection and try again.'
    }
    return message || 'Card confirmation failed.'
  }

  async function handleSubmit() {
    if (!stripe || !elements || !clientSecret) {
      return
    }

    setProcessing(true)
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/payment/success` },
        redirect: 'if_required',
      })

      if (result.error) {
        onError?.(getReadableStripeError(result.error))
        return
      }

      if (result.paymentIntent?.status === 'succeeded') {
        setPaid(true)
        await onConfirmed?.(result.paymentIntent)
        return
      }

      onError?.(`Payment status: ${result.paymentIntent?.status || 'unknown'}`)
    } catch (error) {
      onError?.(getReadableStripeError(error))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="stripe-card-form">
      <div className="form-field">
        <span>Card Details</span>
        <div className="stripe-card-input field-control" role="group" aria-label="Card Details">
          <PaymentElement options={{ wallets: { applePay: 'never', googlePay: 'never' } }} />
        </div>
      </div>
      <button
        type="button"
        className="solid-button"
        onClick={handleSubmit}
        disabled={!stripe || processing || paid}
      >
        {processing ? 'Confirming Card...' : 'Confirm Card Payment'}
      </button>
    </div>
  )
}

export default StripeCardCheckout