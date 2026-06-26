import { useState } from 'react'
import { apiRequest } from '../api/client'

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

      // In backend mock mode, complete payment in-app to emulate a successful transaction.
      if (responseData?.isMock) {
        onConfirmed?.(responseData)
        return
      }

      // Some Telebirr integrations return a checkout URL to continue payment.
      const redirectUrl =
        responseData?.redirectUrl ||
        responseData?.paymentUrl ||
        responseData?.checkoutUrl ||
        responseData?.url
      if (typeof redirectUrl === 'string' && redirectUrl.trim()) {
        window.location.assign(redirectUrl)
        return
      }

      onConfirmed?.(responseData)
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
