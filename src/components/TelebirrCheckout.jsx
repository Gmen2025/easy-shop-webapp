import { useState } from 'react'
import { apiRequest } from '../api/client'

function getTelebirrRedirectUrl(responseData) {
  const directCandidates = [
    responseData?.redirectUrl,
    responseData?.paymentUrl,
    responseData?.checkoutUrl,
    responseData?.url,
    responseData?.toPayUrl,
    responseData?.webUrl,
  ]

  const nestedCandidates = [
    responseData?.paymentData?.redirectUrl,
    responseData?.paymentData?.url,
    responseData?.data?.redirectUrl,
    responseData?.data?.url,
  ]

  return [...directCandidates, ...nestedCandidates].find(
    (candidate) => typeof candidate === 'string' && candidate.trim(),
  )
}

function isTelebirrPaid(responseData) {
  const status = String(
    responseData?.paymentStatus ||
      responseData?.status ||
      responseData?.transactionStatus ||
      '',
  ).toLowerCase()

  return ['paid', 'success', 'succeeded', 'completed'].includes(status)
}

function TelebirrCheckout({ amount, onConfirmed, onError }) {
  const [phone, setPhone] = useState('+251')
  const [customerName, setCustomerName] = useState('')
  const [processing, setProcessing] = useState(false)

  async function handlePay() {
    if (!phone || !customerName) {
      onError?.('Please fill in phone number and name.')
      return
    }

    setProcessing(true)

    try {
      const data = await apiRequest('/telebirr/initiate-payment', {
        method: 'POST',
        body: JSON.stringify({
          amount: Math.round(amount),
          phoneNumber: phone.replace(/\D/g, ''),
          customerName,
          description: 'Order payment',
        }),
      })

      const responseData = data?.data || data

      if (data?.success === false) {
        onError?.(data?.message || 'Telebirr payment initialization failed.')
        return
      }

      if (responseData?.isMock) {
        onError?.(
          'Telebirr backend is currently in mock mode. Live Telebirr payment is required, so order was not placed.',
        )
        return
      }

      const redirectUrl = getTelebirrRedirectUrl(responseData)
      if (typeof redirectUrl === 'string' && redirectUrl.trim()) {
        window.location.assign(redirectUrl)
        return
      }

      if (isTelebirrPaid(responseData)) {
        onConfirmed?.(responseData)
        return
      }

      onError?.(
        'Telebirr did not return a checkout URL or confirmed paid status. Order was not placed.',
      )
    } catch (error) {
      onError?.(error.message || 'Telebirr payment initialization failed.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="telebirr-form">
      <label htmlFor="telebirr-name">Full Name</label>
      <input
        id="telebirr-name"
        type="text"
        value={customerName}
        onChange={(event) => setCustomerName(event.target.value)}
        placeholder="Your name"
        required
      />

      <label htmlFor="telebirr-phone">Phone Number</label>
      <input
        id="telebirr-phone"
        type="tel"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder="+251912345678"
        required
      />

      <p className="telebirr-amount">Amount to Pay: {Math.round(amount)} ETB</p>

      <button
        type="button"
        className="solid-button"
        onClick={handlePay}
        disabled={processing}
      >
        {processing ? 'Processing...' : 'Pay with Telebirr'}
      </button>
    </div>
  )
}

export default TelebirrCheckout
