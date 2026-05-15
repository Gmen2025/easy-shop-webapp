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

  async function handleSubmit(event) {
    event.preventDefault()
    if (!stripe || !elements || !clientSecret) {
      return
    }

    setProcessing(true)
    const cardElement = elements.getElement(CardElement)

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
      },
    })

    setProcessing(false)

    if (result.error) {
      onError?.(result.error.message || 'Card confirmation failed.')
      return
    }

    if (result.paymentIntent?.status === 'succeeded') {
      onConfirmed?.(result.paymentIntent)
      return
    }

    onError?.(`Payment status: ${result.paymentIntent?.status || 'unknown'}`)
  }

  return (
    <form className="stripe-card-form" onSubmit={handleSubmit}>
      <label>Card Details</label>
      <div className="stripe-card-input">
        <CardElement options={cardStyles} />
      </div>
      <button type="submit" className="solid-button" disabled={!stripe || processing}>
        {processing ? 'Confirming Card...' : 'Confirm Card Payment'}
      </button>
    </form>
  )
}

export default StripeCardCheckout