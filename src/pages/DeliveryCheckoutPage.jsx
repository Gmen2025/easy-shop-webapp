import { useCallback, useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { apiRequest, getSelectedDatabaseName } from '../api/client'
import { deliveryRequest } from '../api/delivery'
import { completeDeliveryCheckout } from '../features/cart/cartSlice'
import { ADDRESS_FIELDS, addressText, buildQuotePayload, calculateDeliveryPricing, cartLineKey, cartMatchesQuote } from '../utils/delivery'
import { formatCurrency } from '../utils/format'
import DeliveryCardPayment from '../components/DeliveryCardPayment'
import DeliveryMap from '../components/DeliveryMap'
import DeliveryWindow from '../components/DeliveryWindow'
import CartContents from '../components/CartContents'
import CheckoutHeader from '../components/CheckoutHeader'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { editAddress } from '../utils/addressAutocomplete'
import { ExchangeReceipt, InternationalReceipt } from '../components/CheckoutReceipts'
import { cashOnDeliveryAvailable, checkoutPreview, completesProductCart, inspectPendingCheckout, money, nativeCurrency, paymentAmount, paymentMethods, rateIsActive } from '../utils/checkoutPayment'

export default function DeliveryCheckoutPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const items = useSelector((state) => state.cart.items)
  const user = useSelector((state) => state.auth.user)
  const database = getSelectedDatabaseName()
  const navigation = useLocation()
  const draft = navigation.state?.checkoutDraft
  const restoredDraft = draft?.database === database && draft?.userId === (user?._id || user?.id) ? draft : null
  const [step, setStep] = useState(id ? 2 : navigation.state?.checkoutStep || 0)
  const heading = useRef(null)
  const [paymentCurrency, setPaymentCurrency] = useState(restoredDraft?.paymentCurrency || nativeCurrency(database))
  const [exchange, setExchange] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const pendingKey = `deliveryCheckout_${database}_${user?._id || user?.id}`
  const draftKey = `${pendingKey}_draft`
  const [addresses, setAddresses] = useState([])
  const [saved, setSaved] = useState([])
  const [quantities, setQuantities] = useState(restoredDraft?.quantities || {})
  const [mode, setMode] = useState(restoredDraft?.mode || 'STANDARD')
  const [scheduled, setScheduled] = useState(restoredDraft?.scheduled || '')
  const [group, setGroup] = useState(null)
  const [selections, setSelections] = useState({})
  const [banks, setBanks] = useState([])
  const [bankId, setBankId] = useState('')
  const [method, setMethod] = useState('bank')
  const [reference, setReference] = useState('')
  const [sender, setSender] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [pendingCheckout, setPendingCheckout] = useState(null)
  const guard = useRef(false)
  const run = useCallback(async (action) => {
    if (guard.current) return
    guard.current = true
    setBusy(true)
    setError('')
    try { await action() } catch (failure) { setError(failure.message) }
    finally { guard.current = false; setBusy(false) }
  }, [])

  const checkPreviousCheckout = useCallback(async () => {
    const previousId = localStorage.getItem(pendingKey)
    const previous = await inspectPendingCheckout(previousId, (checkoutId) =>
      deliveryRequest(`checkouts/${checkoutId}`))
    setPendingCheckout(previous?.blocksNewQuote ? previous.checkout : null)
    if (previous && completesProductCart(previous.checkout)) {
      dispatch(completeDeliveryCheckout({ id: previous.checkout._id, cart: previous.checkout.cart }))
    }
    if (!previous || ['placed', 'cancelled'].includes(previous.checkout.status)) {
      if (localStorage.getItem(pendingKey) === previousId) localStorage.removeItem(pendingKey)
    }
    return previous
  }, [dispatch, pendingKey])

  useEffect(() => {
    let current = true
    const load = async () => {
      if (!id) await checkPreviousCheckout()
      const result = id ? await deliveryRequest(`checkouts/${id}`) : await Promise.all([
        deliveryRequest('delivery-current-address'), deliveryRequest('delivery-addresses'),
      ])
      if (!current) return
      if (id) {
        setGroup(result)
        setStep(result.kind === 'service' || result.status !== 'quote' ? 3 : 2)
        setMode(result.deliveryMode || 'STANDARD')
        setScheduled(result.scheduledFor ? result.scheduledFor.slice(0, 16) : '')
        setSelections(Object.fromEntries(result.deliveries.map((delivery) => [delivery.key, delivery.vehicle])))
        // Prepared payments retain their original rate even after the daily policy expires.
        if (result.status !== 'quote') return
        const [accounts, policy] = await Promise.all([
          deliveryRequest(`delivery-bank-accounts?currency=${result.currency.toUpperCase()}`),
          result.exchangeRate ? apiRequest('/exchange-rate/') : Promise.resolve(null),
        ])
        if (!current) return
        setBanks(accounts); setBankId(accounts[0]?._id || ''); setExchange(policy)
      } else {
        const international = /usa/i.test(database) && paymentCurrency === 'etb'
        const [accounts, policy] = await Promise.all([
          deliveryRequest(`delivery-bank-accounts?currency=${paymentCurrency.toUpperCase()}`),
          paymentCurrency !== nativeCurrency(database) ? apiRequest('/exchange-rate/') : Promise.resolve(null),
        ])
        if (!current) return
        const [address, existing] = result
        const initial = international && !/^(ethiopia|ethio|et)$/i.test(address.country) ?
          { ...editAddress(address, 'country', 'Ethiopia'), address1: '', address2: '', city: '', zip: '' } : address
        setAddresses(restoredDraft?.paymentCurrency === paymentCurrency ? restoredDraft.addresses : [{ ...initial, id: 'current' }])
        setSaved(international ? existing.filter((entry) => /^(ethiopia|ethio|et)$/i.test(entry.country)) : existing)
        setBanks(accounts); setBankId(accounts[0]?._id || ''); setExchange(policy)
      }
    }
    load().catch((failure) => { if (current) setError(failure.message) })
      .finally(() => { if (current) setBusy(false) })
    return () => { current = false }
  }, [id, paymentCurrency, database, checkPreviousCheckout, restoredDraft])

  useEffect(() => {
    heading.current?.scrollIntoView({ block: 'start' })
    heading.current?.focus({ preventScroll: true })
  }, [step])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (group && completesProductCart(group) && localStorage.getItem(pendingKey) === group._id) {
      dispatch(completeDeliveryCheckout({ id: group._id, cart: group.cart }))
      localStorage.removeItem(pendingKey)
    }
  }, [dispatch, group, pendingKey])

  async function showResult(result) {
    setGroup(result)
    if (completesProductCart(result) && localStorage.getItem(pendingKey) === result._id) {
      dispatch(completeDeliveryCheckout({ id: result._id, cart: result.cart }))
      localStorage.removeItem(pendingKey)
    }
  }
  async function confirm() {
    if (group?.paymentMethod === 'cash' && !cashOnDeliveryAvailable(database, import.meta.env.DEV)) {
      throw new Error('USA cash checkout can only be completed in a development build.')
    }
    const result = await deliveryRequest(`checkouts/${id}/confirm`, {
      method: 'POST', data: { reference, sender }, timeoutMs: 60000,
    })
    await showResult(result)
  }
  const initialQuantities = (key, addressIndex) => quantities[key]?.[addresses[addressIndex]?.id] ??
    (addressIndex === 0 ? items.find((item) => cartLineKey(item.product) === key)?.quantity || 0 : 0)
  function effectiveQuantities() {
    return Object.fromEntries(items.map(({ product }) => [cartLineKey(product),
      Object.fromEntries(addresses.map((address, index) => [address.id, initialQuantities(cartLineKey(product), index)])),
    ]))
  }
  function removeAddress(addressId) {
    setQuantities(effectiveQuantities())
    setAddresses((previous) => previous.filter((address) => address.id !== addressId))
  }
  function editCheckout(targetStep) {
    run(async () => {
      const stored = sessionStorage.getItem(draftKey)
      const previousDraft = stored ? JSON.parse(stored) : null
      if (previousDraft?.groupId === id && (!Array.isArray(previousDraft.addresses) || !previousDraft.quantities)) {
        throw new Error('The saved address draft is incomplete. Return to the cart to enter your addresses again.')
      }
      navigate('/cart', { state: { checkoutStep: targetStep,
        checkoutDraft: previousDraft?.groupId === id ? previousDraft : null } })
    })
  }
  const pending = localStorage.getItem(pendingKey)
  const international = Boolean(group?.international || (!id && /usa/i.test(database) && paymentCurrency === 'etb'))
  const service = group?.kind === 'service'
  const converted = Boolean(group?.exchangeRate || (!id && paymentCurrency !== nativeCurrency(database)))
  const pricing = group?.status === 'quote' ? calculateDeliveryPricing(group.deliveries, selections) : null
  const preview = group?.status === 'quote' ? checkoutPreview(group, selections, calculateDeliveryPricing) : null
  const methods = group ? paymentMethods(group, database, exchange, import.meta.env.DEV) : []
  const needsVehicle = group?.deliveries.some((delivery) => !selections[delivery.key])
  const convertedAvailable = !converted || rateIsActive(exchange, now)
  const currencyOptions = <fieldset disabled={busy} className="delivery-fieldset">
    <label>Payment currency & destination<select value={paymentCurrency} onChange={(event) => {
      setPaymentCurrency(event.target.value)
      setQuantities({})
      setError('')
      setExchange(null)
      setBanks([])
      setBankId('')
      setBusy(true)
    }}>
      {/usa/i.test(database) ? <>
        <option value="usd">Pay USD - domestic USA delivery</option>
        <option value="etb">Pay birr - ship US products to Ethiopia</option>
      </> : <>
        <option value="etb">Pay birr - Ethiopia delivery</option>
        <option value="usd">Pay USD - Ethiopia delivery</option>
      </>}
    </select></label>
    <p>Changing the payment currency reloads addresses and allocations before quoting.</p>
    {converted ? <p role="status">{exchange?.message || 'Loading the daily exchange policy.'}
      {rateIsActive(exchange, now) ? ` 1 USD = ${exchange.birrPerUsd} ETB; expires ${new Date(exchange.expiresAt).toLocaleString()}.` : ' New converted checkouts require an active rate applied within 24 hours.'}</p> : null}
    {converted ? <button className="ghost-button" onClick={() => run(async () => {
      setExchange(await apiRequest('/exchange-rate/'))
      setNow(Date.now())
    })}>Refresh daily exchange policy</button> : null}
    {international ? <p>Enter Ethiopian recipient addresses. US stores deliver to the consolidation hub.
      International shipping includes final delivery; import duties and customs are excluded.
      Only ETB bank transfer is supported, verified by Admin before fulfillment.</p> : null}
  </fieldset>
  return <section className="page-stack delivery-page">
    <section className="panel">
      <div ref={heading} tabIndex={-1} className="checkout-step-focus">
      {!id && step === 0 ? <CartContents disabled={busy} onCheckout={() => setStep(1)}>{currencyOptions}</CartContents> : <>
        <CheckoutHeader step={step} title={group && group.status !== 'quote' ? 'Saved payment & order status' :
          ['', 'Delivery Address', 'Choose Delivery Method', 'Payment Method', 'Order Summary'][step]}
          disabled={busy} onBack={() => {
            if (group?.status !== 'quote' && id) navigate('/delivery-checkouts')
            else if (id && step === 2) editCheckout(1)
            else if (service) navigate('/service-requests')
            else setStep(Math.max(0, step - 1))
          }} />
        <Link to="/delivery-checkouts">My delivery checkouts</Link>
      </>}
      </div>
      {error ? <p className="error-text" role="alert"><strong>Checkout error: </strong>{error}</p> : null}
      {busy ? <p role="status">Working on your checkout. Please wait...</p> : null}
      {id ? <button className="ghost-button" disabled={busy} onClick={() => run(async () => {
        const result = await deliveryRequest(`checkouts/${id}`)
        await showResult(result)
        setSelections(Object.fromEntries(result.deliveries.map((delivery) => [delivery.key, delivery.vehicle])))
        if (result.status === 'quote') {
          const [accounts, policy] = await Promise.all([
            deliveryRequest(`delivery-bank-accounts?currency=${result.currency.toUpperCase()}`),
            result.exchangeRate ? apiRequest('/exchange-rate/') : Promise.resolve(null),
          ])
          setBanks(accounts); setBankId(accounts[0]?._id || ''); setExchange(policy)
          setNow(Date.now())
        }
      })}>Refresh saved checkout / recover interrupted request</button> : null}
      {!id && pendingCheckout ? <div className="checkout-warning" role="alert">
        <strong>Previous checkout needs attention.</strong>
        <p>{pendingCheckout.status === 'bank_review' ?
          'Your bank transfer is awaiting review. Do not send another payment.' :
          'You have an unpaid reservation. Resume it or cancel it safely before starting another checkout.'}</p>
        <Link to={`/delivery-checkouts/${pendingCheckout._id}`}>Resume previous checkout / check payment status</Link>
      </div> : null}
      {!id && pending && !pendingCheckout ? <p>
        <Link to={`/delivery-checkouts/${pending}`}>Open saved checkout / verify its status</Link>
      </p> : null}
      <fieldset disabled={busy} className="delivery-fieldset">
        {!id ? <>
          {step === 1 ? <>
          <p>Allocate every unit to one address. Pickup stores are selected from eligible matching-price stock nearest the delivery address, including the default store.</p>
          {addresses.map((address, index) => <article className="order-card" key={address.id}>
            <h2>Drop-off {index + 1}</h2>
            <div className="form-grid">{ADDRESS_FIELDS.map(([field, label]) => field === 'address1' ?
              <AddressAutocomplete key={`${field}-${address.country}`} label={label} value={address.address1} country={address.country} maxLength={300}
                onChange={(value) => setAddresses((previous) => previous.map((entry) =>
                  entry.id === address.id ? editAddress(entry, 'address1', value) : entry))}
                onSelect={(selected) => setAddresses((previous) => previous.map((entry) =>
                  entry.id === address.id ? { ...entry, ...selected } : entry))} /> :
              <label key={field}>{label}
              <input value={address[field] || ''} maxLength={300} onChange={(event) =>
                setAddresses((previous) => previous.map((entry) => entry.id === address.id ? editAddress(entry, field, event.target.value) : entry))} />
            </label>)}</div>
            {items.map(({ product, quantity }) => <label className="delivery-allocation" key={cartLineKey(product)}>
              {product.name}: units to this drop-off (of {quantity})
              <input type="number" min="0" max={quantity} step="1" value={initialQuantities(cartLineKey(product), index)}
                onChange={(event) => {
                  const values = effectiveQuantities()
                  values[cartLineKey(product)][address.id] = event.target.value
                  setQuantities(values)
                }} />
            </label>)}
            <div className="action-row">
              <button className="ghost-button" onClick={() => setQuantities(Object.fromEntries(items.map(({ product, quantity }) =>
                [cartLineKey(product), Object.fromEntries(addresses.map((entry) => [entry.id, entry.id === address.id ? quantity : 0]))])))}>
                Send all items to {address.label || `drop-off ${index + 1}`}
              </button>
              <button className="ghost-button" onClick={() => run(async () => {
                const stored = await deliveryRequest(address._id ? `delivery-addresses/${address._id}` : 'delivery-addresses', {
                  method: address._id ? 'PUT' : 'POST', data: address,
                })
                setAddresses((previous) => previous.map((entry) => entry.id === address.id ? { ...stored, id: address.id } : entry))
                setSaved((previous) => [...previous.filter((entry) => entry._id !== stored._id), stored])
              })}>Save address for future orders</button>
              {addresses.length > 1 ? <button className="ghost-button" onClick={() => removeAddress(address.id)}>Remove drop-off</button> : null}
            </div>
          </article>)}
          <div className="action-row">
            <button className="ghost-button" disabled={addresses.length >= 10} onClick={() => {
              setQuantities(effectiveQuantities())
              setAddresses((previous) => [...previous, { id: crypto.randomUUID(), country: international || !/usa/i.test(database) ? 'Ethiopia' : 'United States' }])
            }}>Add drop-off</button>
          </div>
          {saved.length ? <div className="order-card"><h3>Saved addresses</h3>{saved.map((address) => <div key={address._id} className="action-row">
            <span>{address.label}: {addressText(address)}</span>
            <button className="ghost-button" disabled={addresses.length >= 10} onClick={() => {
              setQuantities(effectiveQuantities())
              setAddresses((previous) => [...previous, { ...address, id: crypto.randomUUID() }])
            }}>Use as another drop-off</button>
            <button className="ghost-button" onClick={() => run(async () => {
              await deliveryRequest(`delivery-addresses/${address._id}`, { method: 'DELETE' })
              setSaved((previous) => previous.filter((entry) => entry._id !== address._id))
              setAddresses((previous) => previous.map((entry) => entry._id === address._id ? { ...entry, _id: undefined } : entry))
            })}>Delete saved address</button>
          </div>)}</div> : null}
          <button className="solid-button mobile-cart-checkout" disabled={!items.length} onClick={() => run(async () => {
            buildQuotePayload(items, addresses, effectiveQuantities(), 'STANDARD', '')
            setStep(2)
          })}>Save & continue to delivery</button>
          </> : null}
          {step === 2 ? <>
          <div className="checkout-options" role="radiogroup" aria-label="Delivery speed">
            {[
              ['STANDARD', 'Standard delivery', 'Standard business-day delivery. Route and vehicle fees are calculated below.'],
              ['EXPRESS', 'Express delivery', 'Faster delivery with the regional express surcharge.'],
              ['SCHEDULED', 'Scheduled delivery', 'Choose a future delivery date and time.'],
            ].map(([value, label, description]) => <label className={`checkout-option${mode === value ? ' selected' : ''}`} key={value}>
              <input type="radio" name="delivery-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
              <span><strong>{label}</strong><small>{description}</small></span>
            </label>)}
          </div>
          {international ? <p>Delivery speed covers arrival at the US consolidation hub, not final arrival in Ethiopia.</p> : null}
          {mode === 'SCHEDULED' ? <label>Delivery date & time<input type="datetime-local" value={scheduled} onChange={(event) => setScheduled(event.target.value)} /></label> : null}
          <button className="solid-button mobile-cart-checkout" disabled={!items.length || !convertedAvailable} onClick={() => run(async () => {
            const previous = await checkPreviousCheckout()
            if (previous?.blocksNewQuote) throw new Error(previous.checkout.status === 'bank_review' ?
              'Your previous bank transfer is awaiting review. Check its status; do not pay again.' :
              'Resume or cancel your previous unpaid reservation before starting another.')
            if (previous && completesProductCart(previous.checkout)) {
              throw new Error('Your previous checkout completed. Review your updated cart before requesting another quote.')
            }
            if (converted && !rateIsActive(exchange)) throw new Error('The daily rate expired. Reload the exchange policy before requesting a converted quote.')
            const payload = buildQuotePayload(items, addresses, effectiveQuantities(), mode, scheduled)
            const quote = await deliveryRequest('checkouts/quote', { method: 'POST', data: { ...payload, paymentCurrency }, timeoutMs: 120000 })
            localStorage.setItem(pendingKey, quote._id)
            sessionStorage.setItem(draftKey, JSON.stringify({
              groupId: quote._id, database, userId: user?._id || user?.id,
              addresses, quantities: effectiveQuantities(), mode, scheduled, paymentCurrency,
            }))
            navigate(`/delivery-checkouts/${quote._id}`)
          })}>Calculate Google route & delivery quote</button>
          </> : null}
        </> : null}
        {group ? <>
          <p>Checkout #{group._id} | <strong>{group.status}</strong> | Payment: {group.paymentStatus}</p>
          <DeliveryWindow value={group} />
          {service ? <p>Service request #{group.serviceRequest}. Pay the Admin ETB quote in USD; fulfillment remains in Ethiopia.
            Submitted or paid service payments require support review and manual refund handling before cancellation.</p> : null}
          <InternationalReceipt group={group} />
          {group.status !== 'quote' ? <ExchangeReceipt value={group} /> : null}
          {group.status === 'quote' ? <>
            <p>Quote expires {new Date(group.expiresAt).toLocaleString()}. Stock is not reserved until you continue.</p>
            {step === 2 || step === 4 ? <>
            {group.deliveries.map((delivery) => <article className="order-card" key={delivery.key}>
              <h2>Pickup: {delivery.store.name}</h2><p>{delivery.store.address}</p>
              <p>{international ? 'US consolidation hub' : 'Drop-off'}: {delivery.address.label} - {addressText(delivery.address)}</p>
              <p>Google driving route: {(/usa/i.test(database) ? delivery.distanceKm / 1.609344 : delivery.distanceKm).toFixed(2)} {/usa/i.test(database) ? 'miles' : 'km'}</p>
              {delivery.lines.map((line) => <p key={`${line.key}:${line.product}`}>{line.quantity} x {line.name || line.product} at {formatCurrency(line.price)}</p>)}
              <p>Cargo: {delivery.cargo.weightKg ?? 'Unknown'} kg / {delivery.cargo.volumeLiters ?? 'Unknown'} liters</p>
              {delivery.requiresVehicleSelection ? <p role="note">Measurements are incomplete. Choose a vehicle manually; capacity cannot be guaranteed.</p> : null}
              {step === 2 ? <label>Vehicle<select value={selections[delivery.key] || ''} onChange={(event) =>
                setSelections((previous) => ({ ...previous, [delivery.key]: event.target.value }))}>
                <option value="">Choose a vehicle</option>
                {delivery.vehicleOptions.map((option) => <option key={option.type} value={option.type}>{option.type} - unshared route {formatCurrency(option.fee)}</option>)}
              </select></label> : <p>Vehicle: {selections[delivery.key]}</p>}
              <p>Delivery share: {formatCurrency(pricing.byKey[delivery.key].deliveryFee)}
                {pricing.byKey[delivery.key].storeCount > 1 ? ` (${pricing.byKey[delivery.key].storeCount} nearby stores share this vehicle fee)` : ''}</p>
              {step === 2 ? <DeliveryMap pickup={delivery.store.location} dropoff={delivery.address.location} /> : null}
            </article>)}
            {step === 2 ? <div className="action-row">
              <button className="ghost-button" onClick={() => editCheckout(2)}>Change delivery speed / recalculate routes</button>
              <button className="solid-button mobile-cart-checkout" disabled={needsVehicle} onClick={() => setStep(3)}>Continue to payment</button>
            </div> : null}
            </> : null}
            <p>{service ? 'Service quote' : 'Products'}: {formatCurrency(group.itemsSubtotal)} | Delivery: {formatCurrency(pricing.deliveryFee)}</p>
            {international ? <p>International shipping: {money(group.international.shippingFee, 'usd')}</p> : null}
            <h2>Estimated total: {formatCurrency(preview.total)}</h2>
            {group.exchangeRate ? <section className="order-card">
              <h3>Payment estimate: {money(preview.payment, group.currency)}</h3>
              <p>1 USD = {group.exchangeRate.birrPerUsd} ETB. Applied {new Date(group.exchangeRate.appliedAt).toLocaleString()} ({group.exchangeRate.source}).
                The server locks the final payment after vehicle selection. Product and service prices remain in the native regional currency.</p>
              {!rateIsActive(exchange, now) ? <p role="alert">{exchange?.message || 'Reload to verify the current daily rate before reserving.'}</p> : null}
            </section> : null}
            {step === 3 ? <>
            <div className="checkout-options" role="radiogroup" aria-label="Payment method">
              {methods.map((value) => <label key={value} className={`checkout-option${method === value ? ' selected' : ''}`}>
                <input type="radio" name="payment-method" checked={method === value} value={value} onChange={() => setMethod(value)} />
                <span><strong>{{ bank: 'Bank transfer', card: 'Credit / debit card', cash: 'Cash on delivery' }[value]}</strong>
                  <small>{{ bank: 'Transfer the saved total once; Admin verifies the funds.', card: 'Pay the saved total securely with the matching Stripe merchant.', cash: 'Pay on each delivery. No online payment is taken.' }[value]}</small></span>
              </label>)}
            </div>
            {/usa/i.test(database) && !converted && !international ? <p role="status">{import.meta.env.DEV ?
              'Development cash checkout creates real USA orders. Use test products; cash is collected on each delivery.' :
              'USA cash on delivery is available only during development.'}</p> : null}
            {method === 'bank' ? <label>Bank account<select value={bankId} onChange={(event) => setBankId(event.target.value)}>
              <option value="">Select an active account</option>{banks.map((bank) => <option value={bank._id} key={bank._id}>{bank.bankName} - {bank.accountNumber}</option>)}
            </select></label> : null}
            <button className="solid-button mobile-cart-checkout" disabled={needsVehicle || !methods.includes(method) || (method === 'bank' && !bankId)}
              onClick={() => setStep(4)}>Review order</button>
            </> : null}
            {step === 4 ? <>
            <h2>Review your order</h2>
            <p>Payment method: {method === 'cash' ? 'Cash on delivery' : method === 'card' ? 'Credit / debit card' : 'Bank transfer'}</p>
            {method === 'bank' ? <p>Bank: {banks.find((bank) => bank._id === bankId)?.bankName}</p> : null}
            <div className="action-row">
              {!service ? <button className="ghost-button" onClick={() => setStep(2)}>Change delivery method</button> : null}
              <button className="ghost-button" onClick={() => setStep(3)}>Change payment method</button>
              {!service ? <button className="ghost-button" onClick={() => editCheckout(1)}>Change addresses & quantities</button> : null}
            </div>
            <button className="solid-button" disabled={Boolean(group.exchangeRate && !rateIsActive(exchange, now)) || (method === 'bank' && !bankId)} onClick={() => run(async () => {
              if (group.exchangeRate && !rateIsActive(exchange)) throw new Error('The daily rate expired. Refresh the saved checkout before reserving.')
              if (!service && pending === group._id && !cartMatchesQuote(items, group)) throw new Error('Your cart changed. Cancel this quote and request a fresh one.')
              if (!methods.includes(method)) throw new Error('Select a supported payment method for this checkout.')
              if (group.deliveries.some((delivery) => !selections[delivery.key])) throw new Error('Choose a vehicle for every delivery.')
              if (!service && pending === group._id) localStorage.setItem(pendingKey, group._id)
              await showResult(await deliveryRequest(`checkouts/${id}/prepare`, {
                method: 'POST', timeoutMs: 60000, data: {
                  method, bankAccountId: bankId,
                  ...(method === 'cash' && /usa/i.test(database) ? { developmentCashOnDelivery: import.meta.env.DEV === true } : {}),
                  selections: group.deliveries.map((delivery) => ({ key: delivery.key, vehicle: selections[delivery.key] })),
                },
              }))
            })}>{service ? 'Reserve service payment' : 'Reserve stock & continue to payment'}</button>
            </> : null}
          </> : <><h2>Saved total: {formatCurrency(group.totalPrice)}</h2>
            <h3>Amount to pay: {money(paymentAmount(group), group.currency)}</h3>
            {group.status === 'bank_review' ? <p role="status">Transfer submitted for review, not yet confirmed for fulfillment.
              Do not send another payment. Stock remains reserved until Admin verifies or rejects the receipt.</p> : null}
            {group.paymentMethod === 'bank' ? <div className="order-card">
              <p>{group.bankAccount?.bankName} - {group.bankAccount?.accountNumber} - {group.bankAccount?.accountHolderName}</p>
              {group.status === 'awaiting_payment' ? <p>Send {money(paymentAmount(group), group.currency)} once. Payment is verified by Admin.
                If funds were sent after the hold expired, contact support; do not pay again.</p> :
                <p>Saved receipt: {group.bankSender || 'Sender not submitted'} - {group.bankReference || 'Reference not submitted'}.
                  {' '}Payment status: {group.paymentStatus}. Do not send another payment.</p>}
            </div> : null}
            {group.status === 'awaiting_payment' ? <>
              <p>Reservation expires {new Date(group.expiresAt).toLocaleString()}. Do not start a second payment if a request fails.</p>
              {group.paymentMethod === 'bank' ? <>
                <label>Sender name<input maxLength={300} value={sender} onChange={(event) => setSender(event.target.value)} /></label>
                <label>Transfer reference<input maxLength={300} value={reference} onChange={(event) => setReference(event.target.value)} /></label>
                <button className="solid-button" onClick={() => run(confirm)}>Submit bank transfer reference</button>
              </> : null}
              {group.paymentMethod === 'card' ? <button className="solid-button" onClick={() => run(async () => {
                const payment = await deliveryRequest(`checkouts/${id}/payment`, { method: 'POST', timeoutMs: 60000 })
                await showResult(payment.group)
                setClientSecret(payment.clientSecret || '')
              })}>Load secure card payment</button> : null}
              <button className="ghost-button"
                disabled={group.paymentMethod === 'cash' && !cashOnDeliveryAvailable(database, import.meta.env.DEV)}
                onClick={() => run(confirm)}>{group.paymentMethod === 'cash' ? 'Confirm cash on delivery order' : 'Check payment status / reconcile'}</button>
              {group.paymentMethod === 'cash' ? <p>{cashOnDeliveryAvailable(database, import.meta.env.DEV) ?
                'No online payment is taken. Cash is collected on each delivery.' :
                'This USA cash reservation was started during development. Cash confirmation is disabled in production; cancel the unpaid reservation or contact support.'}</p> : null}
              <button className="ghost-button" onClick={() => run(async () => {
                if (!window.confirm('Cancel only an unpaid reservation. If bank funds were sent, contact support first. Successful card payments are recovered instead of cancelled.')) return
                await showResult(await deliveryRequest(`checkouts/${id}/cancel`, { method: 'POST' }))
                if (localStorage.getItem(pendingKey) === id) localStorage.removeItem(pendingKey)
              })}>Cancel unpaid reservation</button>
            </> : null}
            <Link className="ghost-button" to={`/delivery-checkouts?selected=${id}`}>View deliveries & tracking</Link>
          </>}
          {group.status === 'quote' || group.status === 'cancelled' ? <button className="ghost-button" onClick={() => {
            if (localStorage.getItem(pendingKey) === id) localStorage.removeItem(pendingKey)
            navigate(service ? '/service-requests' : '/cart')
          }}>{service ? 'Return to service requests' : group.status === 'quote' ? 'Discard quote & edit cart' : 'Return to cart'}</button> : null}
        </> : null}
      </fieldset>
      {clientSecret && group?.status === 'awaiting_payment' ? <DeliveryCardPayment key={clientSecret} clientSecret={clientSecret}
        publishableKey={group.stripePublishableKey} dedicatedMerchant={Boolean(group.exchangeRate)} id={id} onConfirm={confirm} /> : null}
    </section>
  </section>
}
