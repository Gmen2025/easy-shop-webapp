import { useState } from 'react'
import { apiRequest } from '../api/client'

function tryParseObject(value) {
  if (!value || typeof value !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function getTelebirrPayloadVariants(responseData) {
  const variants = [responseData]

  const nested = [
    responseData?.data,
    responseData?.paymentData,
    responseData?.result,
    responseData?.bizContent,
    responseData?.biz_content,
    responseData?.raw,
  ]

  for (const entry of nested) {
    const parsedEntry = typeof entry === 'string' ? tryParseObject(entry) : entry
    if (parsedEntry && typeof parsedEntry === 'object') {
      variants.push(parsedEntry)
    }
  }

  return variants
}

function normalizeUrlCandidate(candidate) {
  if (typeof candidate !== 'string') {
    return ''
  }

  const value = candidate.trim()
  if (!value) {
    return ''
  }

  if (/^https?:\/\//i.test(value)) {
    return value
  }

  const embeddedHttpMatch = value.match(/https?:\/\/[^\s"']+/i)
  return embeddedHttpMatch?.[0] || ''
}

function getTelebirrRedirectUrl(responseData) {
  const urlKeys = [
    'redirectUrl',
    'paymentUrl',
    'checkoutUrl',
    'url',
    'toPayUrl',
    'webUrl',
    'h5Url',
    'h5_url',
    'payUrl',
    'pay_url',
    'cashierUrl',
    'deeplink',
    'deepLink',
  ]

  for (const payload of getTelebirrPayloadVariants(responseData)) {
    for (const key of urlKeys) {
      const normalized = normalizeUrlCandidate(payload?.[key])
      if (normalized) {
        return normalized
      }
    }
  }

  return ''
}

function isTelebirrPaid(responseData) {
  const statusKeys = [
    'paymentStatus',
    'status',
    'transactionStatus',
    'tradeStatus',
    'result',
    'resultCode',
    'code',
    'retCode',
  ]

  const paidValues = new Set([
    'paid',
    'success',
    'succeeded',
    'completed',
    'finish',
    'finished',
    '0000',
    '0',
  ])

  for (const payload of getTelebirrPayloadVariants(responseData)) {
    for (const key of statusKeys) {
      const rawStatus = String(payload?.[key] || '').trim().toLowerCase()
      if (rawStatus && paidValues.has(rawStatus)) {
        return true
      }
    }
  }

  return false
}

function getTelebirrTransactionId(responseData) {
  const idKeys = [
    'transactionId',
    'txId',
    'merchantTransId',
    'tradeNo',
    'outTradeNo',
    'orderId',
    'paymentReference',
    'reference',
    'prepayId',
    'prepay_id',
    'merchantOrderNo',
    'merchant_order_no',
  ]

  for (const payload of getTelebirrPayloadVariants(responseData)) {
    for (const key of idKeys) {
      const value = payload?.[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }

  return ''
}

async function verifyTelebirrPayment(responseData) {
  const transactionId = getTelebirrTransactionId(responseData)
  if (!transactionId) {
    return null
  }

  const candidateEndpoints = [
    '/telebirr/verify-payment',
    '/telebirr/verify',
    '/telebirr/check-status',
    '/telebirr/payment-status',
  ]

  for (const endpoint of candidateEndpoints) {
    try {
      const result = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          transactionId,
          payload: responseData,
        }),
      })

      const responsePayload = result?.data || result
      if (responsePayload && isTelebirrPaid(responsePayload)) {
        return {
          ...responseData,
          ...responsePayload,
          transactionId,
        }
      }
    } catch {
      // Continue trying known verification routes.
    }
  }

  return null
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
        onConfirmed?.({
          ...responseData,
          transactionId: getTelebirrTransactionId(responseData),
        })
        return
      }

      const verifiedPayment = await verifyTelebirrPayment(responseData)
      if (verifiedPayment) {
        onConfirmed?.(verifiedPayment)
        return
      }

      onError?.(
        'Telebirr response did not include a checkout URL and payment could not be verified yet. Complete payment in Telebirr, then try again.',
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
