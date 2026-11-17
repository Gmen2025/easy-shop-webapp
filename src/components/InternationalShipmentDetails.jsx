import { useEffect, useState } from 'react'
import { apiRequest } from '../api/client'
import { deliveryRequest } from '../api/delivery'
import DeliveryCardPayment from './DeliveryCardPayment'
import { allowedInternationalChargeMethods, formatInternationalChargeAmount, internationalChargeLabel, internationalStageLabel, INTERNATIONAL_DESTINATION_STAGES } from '../utils/internationalHub'

const paymentNames = { bank: 'Bank transfer', telebirr: 'Telebirr', card: 'Card' }
const chargeStatuses = { awaiting_payment: 'Awaiting payment', bank_review: 'Bank transfer under review', paid: 'Paid', waived: 'No charges due' }

export default function InternationalShipmentDetails({ groupId, shipment, admin = false, onUpdated }) {
  const destination = shipment.destination || {}
  const charges = destination.charges || null
  const [method, setMethod] = useState('')
  const [banks, setBanks] = useState([])
  const [bankId, setBankId] = useState('')
  const [sender, setSender] = useState('')
  const [reference, setReference] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [publishableKey, setPublishableKey] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const chargeCurrency = charges?.currency || shipment.currency
  const bankCurrency = charges?.status === 'awaiting_payment' && !charges.method ? charges.currency : ''
  const methods = allowedInternationalChargeMethods(chargeCurrency)

  useEffect(() => {
    let current = true
    if (bankCurrency !== 'etb' && bankCurrency !== 'usd') return () => { current = false }
    deliveryRequest(`delivery-bank-accounts?currency=${bankCurrency.toUpperCase()}`)
      .then((result) => {
        if (!current) return
        const list = Array.isArray(result) ? result : result?.bankAccounts || result?.data?.bankAccounts || []
        const matching = list.filter((account) => String(account.currency || '').toLowerCase() === bankCurrency)
        setBanks(matching)
        setBankId((existing) => matching.some((account) => String(account._id) === existing) ? existing : String(matching[0]?._id || ''))
      })
      .catch((failure) => { if (current) setError(failure.message) })
    return () => { current = false }
  }, [bankCurrency])

  async function refresh() {
    if (onUpdated) await onUpdated()
  }

  async function run(action) {
    if (busy) return
    setBusy(true); setError('')
    try { await action() } catch (failure) { setError(failure.message || 'International shipment update failed.') }
    finally { setBusy(false) }
  }

  async function pay(selectedMethod, extra = {}) {
    const paymentTab = selectedMethod === 'telebirr' ? window.open('', '_blank') : null
    try {
      const result = await apiRequest(`/international/checkouts/${encodeURIComponent(groupId)}/shipments/${encodeURIComponent(shipment.id)}/charges/pay`, {
        method: 'POST', body: JSON.stringify({ method: selectedMethod, clientType: 'web', ...extra }), timeoutMs: 90000,
      })
      if (selectedMethod === 'card') {
        setClientSecret(result.clientSecret || '')
        setPublishableKey(result.publishableKey || null)
      }
      if (selectedMethod === 'telebirr' && result.paymentUrl) {
        if (paymentTab) { paymentTab.opener = null; paymentTab.location.href = result.paymentUrl }
        else window.open(result.paymentUrl, '_blank', 'noopener,noreferrer')
      }
      await refresh()
      return result
    } catch (failure) {
      paymentTab?.close()
      throw failure
    }
  }

  async function confirm() {
    await apiRequest(`/international/checkouts/${encodeURIComponent(groupId)}/shipments/${encodeURIComponent(shipment.id)}/charges/confirm`, {
      method: 'POST', body: '{}',
    })
    setClientSecret('')
    await refresh()
  }

  async function bankReview(decision) {
    const reject = decision === 'bank-reject'
    if (reject && !window.confirm('Confirm that no funds were received. Do not reject if the transfer was paid.')) return
    await apiRequest(`/international/checkouts/${encodeURIComponent(groupId)}/shipments/${encodeURIComponent(shipment.id)}/charges/${decision}`, {
      method: 'POST', body: JSON.stringify(reject ? { noFundsReceived: true } : {}),
    })
    await refresh()
  }

  const stages = INTERNATIONAL_DESTINATION_STAGES
  const stageIndex = stages.indexOf(destination.stage)
  const historyByStage = (destination.history || []).reduce((result, event) => {
    if (!result[event.stage]) result[event.stage] = event
    return result
  }, {})
  return <article className="order-card international-shipment-card">
    <header className="international-shipment-heading">
      <div><p className="eyebrow">International shipment tracking</p>
        <h3 className="international-tracking-code">{shipment.trackingCode || 'Tracking code pending'}</h3></div>
      <strong>{internationalStageLabel(destination.stage || 'in_transit')}</strong>
    </header>
    <p>{shipment.recipient?.label || 'Recipient'} · {shipment.recipient?.phone || ''}</p>
    <p>Inbound hub: {destination.hubStoreName || 'Hub assignment pending'}{destination.hubStoreAddress ? ` — ${destination.hubStoreAddress}` : ''}</p>
    <ol className="international-stage-timeline" aria-label="Destination shipment timeline">
      {stages.map((stage, index) => {
        const event = historyByStage[stage]
        return <li key={stage} className={index <= stageIndex ? 'complete' : ''}>
          <strong>{internationalStageLabel(stage)}</strong>
          {event?.at ? <time>{new Date(event.at).toLocaleString()}</time> : null}
          {event?.note ? <small>{event.note}</small> : null}
        </li>
      })}
    </ol>
    {(shipment.history || []).length ? <details><summary>Origin shipment history</summary>
      {(shipment.history || []).map((entry, index) => <p key={`${entry.status}-${index}`}>{entry.status} · {entry.at ? new Date(entry.at).toLocaleString() : ''}{entry.note ? ` · ${entry.note}` : ''}</p>)}
    </details> : null}
    {destination.driver ? <section className="international-driver-info"><h4>Delivery driver</h4>
      <p>{destination.driver.name || 'Assigned'}{destination.driver.vehicleType ? ` · ${destination.driver.vehicleType}` : ''}</p>
      {destination.driver.phone ? <p><a href={`tel:${destination.driver.phone}`}>{destination.driver.phone}</a></p> : null}
      {destination.driver.pickedUpAt ? <p>Picked up {new Date(destination.driver.pickedUpAt).toLocaleString()}</p> : null}
      {destination.driver.deliveredAt ? <p>Delivered {new Date(destination.driver.deliveredAt).toLocaleString()}{destination.driver.proof ? ` · Proof: ${destination.driver.proof}` : ''}</p> : null}
    </section> : null}

    <section className="international-charges-panel">
      <h4>Customs &amp; destination charges</h4>
      {charges ? <>
        {charges.items?.length ? <ul>{charges.items.map((item, index) => <li key={`${item.type}-${index}`}>
          <span>{internationalChargeLabel(item.type, item.label)}</span>
          <strong>{formatInternationalChargeAmount(item.amount, charges.currency)}</strong>
        </li>)}</ul> : <p>No customs or related charges are due.</p>}
        <p className="international-charge-total"><span>Total</span><strong>{formatInternationalChargeAmount(charges.total, charges.currency)}</strong></p>
        <p>Payment status: <strong>{chargeStatuses[charges.status] || charges.status || 'Not recorded'}</strong>
          {charges.method ? ` · ${paymentNames[charges.method] || charges.method}` : ''}</p>
        {charges.note ? <p>{charges.note}</p> : null}
        {charges.status === 'awaiting_payment' && !charges.method && !admin ? <>
          <div className="checkout-options" role="radiogroup" aria-label="Customs charge payment method">
            {methods.map((value) => <label key={value} className={`checkout-option${method === value ? ' selected' : ''}`}>
              <input type="radio" name={`charge-method-${shipment.id}`} value={value} checked={method === value} onChange={() => setMethod(value)} />
              <span><strong>{paymentNames[value]}</strong><small>{value === 'bank' ? 'Transfer the exact amount, then submit sender and reference.' : value === 'telebirr' ? 'Open the Telebirr checkout and return to check status.' : 'Secure card payment through Stripe.'}</small></span>
            </label>)}
          </div>
          {method === 'bank' ? <>
            <label>Active {charges.currency.toUpperCase()} bank account<select value={bankId} onChange={(event) => setBankId(event.target.value)}>
              <option value="">Select an active account</option>{banks.map((bank) => <option value={bank._id} key={bank._id}>{bank.bankName} · {bank.accountNumber} · {bank.accountName || bank.accountHolderName || ''}</option>)}
            </select></label>
            <label>Transfer sender<input value={sender} maxLength={300} onChange={(event) => setSender(event.target.value)} required /></label>
            <label>Transfer reference<input value={reference} maxLength={300} onChange={(event) => setReference(event.target.value)} required /></label>
            <button type="button" className="solid-button" disabled={busy || !bankId || !sender.trim() || !reference.trim()}
              onClick={() => run(() => pay('bank', { bankAccountId: bankId, sender: sender.trim(), reference: reference.trim() }))}>Submit bank transfer</button>
          </> : null}
          {method === 'telebirr' ? <button type="button" className="solid-button" disabled={busy}
            onClick={() => run(() => pay('telebirr'))}>Continue to Telebirr</button> : null}
          {method === 'card' ? <button type="button" className="solid-button" disabled={busy}
            onClick={() => run(() => pay('card'))}>Continue to card payment</button> : null}
        </> : null}
        {charges.status === 'awaiting_payment' && charges.method && !admin ? <div>
          {charges.method === 'bank' ? <p>Transfer submitted for review. Do not pay again; Admin must verify the funds.</p> : null}
          {charges.method === 'telebirr' && charges.telebirrPaymentUrl ? <a className="solid-button" href={charges.telebirrPaymentUrl} target="_blank" rel="noopener noreferrer">Open saved Telebirr payment</a> : null}
          {charges.method === 'card' && clientSecret ? <DeliveryCardPayment key={clientSecret} clientSecret={clientSecret}
            publishableKey={publishableKey} id={groupId} onConfirm={() => run(confirm)} /> : null}
          {charges.method !== 'bank' && !(charges.method === 'card' && clientSecret) ? <button type="button" className="solid-button" disabled={busy}
            onClick={() => run(() => charges.method === 'card' ? pay('card') : pay('telebirr'))}>Continue {paymentNames[charges.method]} payment</button> : null}
          <button type="button" className="ghost-button" disabled={busy} onClick={() => run(confirm)}>I&apos;ve paid — check status</button>
        </div> : null}
        {charges.status === 'bank_review' && !admin ? <button type="button" className="ghost-button" disabled={busy}
          onClick={() => run(confirm)}>Check bank transfer status</button> : null}
        {charges.status === 'bank_review' && admin ? <div className="action-row">
          <button type="button" className="solid-button" disabled={busy} onClick={() => run(() => bankReview('bank-confirm'))}>Confirm bank funds received</button>
          <button type="button" className="ghost-button" disabled={busy} onClick={() => run(() => bankReview('bank-reject'))}>Reject — no funds received</button>
        </div> : null}
      </> : <p>The destination hub has not assessed customs charges yet.</p>}
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      {busy ? <p role="status">Updating shipment payment...</p> : null}
    </section>
  </article>
}
