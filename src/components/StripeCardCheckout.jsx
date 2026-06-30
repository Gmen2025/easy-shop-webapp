import { useState } from 'react'
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'

const cardStyles = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1f1f1f',
      '::placeholder': {
        color: '#8a7668',
      },
    },
    invalid: {
      color: '#b91c1c',
    },
  },
}

function StripeCardCheckout({ clientSecret, onConfirmed, onError }) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)

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
    const cardElement = elements.getElement(CardElement)

    try {
      const result = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardElement,
          },
          return_url: `${window.location.origin}/payment/success`,
        },
        {
          handleActions: true,
        },
      )

      if (result.error) {
        onError?.(getReadableStripeError(result.error))
        return
      }

      if (result.paymentIntent?.status === 'succeeded') {
        onConfirmed?.(result.paymentIntent)
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
      <label>Card Details</label>
      <div className="stripe-card-input">
        <CardElement options={cardStyles} />
      </div>
      <button
        type="button"
        className="solid-button"
        onClick={handleSubmit}
        disabled={!stripe || processing}
      >
        {processing ? 'Confirming Card...' : 'Confirm Card Payment'}
      </button>
    </div>
  )
}

export default StripeCardCheckout