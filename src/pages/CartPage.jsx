import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import toast from 'react-hot-toast'
import {
  clearCart,
  removeFromCart,
  updateCartQuantity,
} from '../features/cart/cartSlice'
import {
  clearOrderState,
  createOrderWithInventorySync,
  validateOrderInventory,
} from '../features/orders/ordersSlice'
import {
  clearPaymentState,
  createPaymentIntent,
} from '../features/payment/paymentSlice'
import { fetchCurrentUserProfile, saveUserProfile } from '../features/auth/authSlice'
import StripeCardCheckout from '../components/StripeCardCheckout'
import TelebirrCheckout from '../components/TelebirrCheckout'
import { apiRequest, getSelectedDatabaseName } from '../api/client'
import { formatCurrency, getPrimaryProductImage } from '../utils/format'
import countries from '../../data/countries.json'

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripeKey ? loadStripe(stripeKey) : null
const countryOptions = countries
  .map((countryItem) => String(countryItem?.name || '').trim())
  .filter(Boolean)

function isObjectIdLike(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''))
}

function CartPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [cardError, setCardError] = useState('')

  const user = useSelector((state) => state.auth.user)
  const userId = user?._id || user?.id || null
  const { items } = useSelector((state) => state.cart)
  const { creating, error, successMessage } = useSelector((state) => state.orders)
  const payment = useSelector((state) => state.payment)
  const selectedDb = getSelectedDatabaseName()
  const isEthio = selectedDb === 'E_Shopping'
  const [latestOrderPrefill, setLatestOrderPrefill] = useState(null)

  const [shippingAddress1, setShippingAddress1] = useState('')
  const [shippingAddress2, setShippingAddress2] = useState('')
  const [city, setCity] = useState('')
  const [zip, setZip] = useState('')
  const [country, setCountry] = useState('')
  const [phone, setPhone] = useState('')

  function getCheckoutDraftKey() {
    const dbName = getSelectedDatabaseName() || 'default'
    const id = userId || 'guest'
    return `checkoutDraft_${dbName}_${id}`
  }

  function persistCheckoutDraft(payload) {
    localStorage.setItem(getCheckoutDraftKey(), JSON.stringify(payload))
  }

  function readCheckoutDraft() {
    const raw = localStorage.getItem(getCheckoutDraftKey())
    if (!raw) {
      return null
    }

    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }

  function readNonEmpty(source, keys) {
    for (const key of keys) {
      const value = source?.[key]
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value)
      }
    }

    return ''
  }

  function hydrated(profile, orderPrefill, keys) {
    return readNonEmpty(profile, keys) || readNonEmpty(orderPrefill, keys)
  }

  useEffect(() => {
    const draft = readCheckoutDraft()
    if (!draft) {
      return
    }

    setShippingAddress1((current) => current || String(draft.shippingAddress1 || ''))
    setShippingAddress2((current) => current || String(draft.shippingAddress2 || ''))
    setCity((current) => current || String(draft.city || ''))
    setZip((current) => current || String(draft.zip || ''))
    setCountry((current) => current || String(draft.country || ''))
    setPhone((current) => current || String(draft.phone || ''))
  }, [userId])

  useEffect(() => {
    if (!isObjectIdLike(userId)) {
      return
    }

    dispatch(fetchCurrentUserProfile())
  }, [dispatch, userId])

  useEffect(() => {
    setShippingAddress1((current) =>
      current || hydrated(user, latestOrderPrefill, ['shippingAddress1', 'addressLine1', 'address1']),
    )
    setShippingAddress2((current) =>
      current || hydrated(user, latestOrderPrefill, ['shippingAddress2', 'addressLine2', 'address2']),
    )
    setCity((current) => current || hydrated(user, latestOrderPrefill, ['city']))
    setZip((current) => current || hydrated(user, latestOrderPrefill, ['zip', 'postalCode']))
    setCountry((current) => current || hydrated(user, latestOrderPrefill, ['country']))
    setPhone((current) => current || hydrated(user, latestOrderPrefill, ['phone']))
  }, [user, latestOrderPrefill])

  useEffect(() => {
    if (!isObjectIdLike(userId)) {
      return
    }

    let cancelled = false

    async function fillFromLatestOrder() {
      try {
        const userOrdersPayload = await apiRequest(`/orders/get/userorders/${userId}`)
        const userOrders = Array.isArray(userOrdersPayload)
          ? userOrdersPayload
          : Array.isArray(userOrdersPayload?.orders)
            ? userOrdersPayload.orders
            : Array.isArray(userOrdersPayload?.data)
              ? userOrdersPayload.data
              : Array.isArray(userOrdersPayload?.data?.orders)
                ? userOrdersPayload.data.orders
                : []

        if (!userOrders.length || cancelled) {
          return
        }

        const latestOrder = [...userOrders].sort((a, b) => {
          const aTime = new Date(a?.dateOrdered || a?.createdAt || 0).getTime()
          const bTime = new Date(b?.dateOrdered || b?.createdAt || 0).getTime()
          return bTime - aTime
        })[0]

        if (!latestOrder || cancelled) {
          return
        }

        setLatestOrderPrefill(latestOrder)
      } catch {
        // Keep current form values if order history cannot be loaded.
      }
    }

    fillFromLatestOrder()

    return () => {
      cancelled = true
    }
  }, [userId])

  // Set payment method based on database
  const defaultPaymentMethod = isEthio ? 'telebirr' : 'card'
  const [paymentMethod, setPaymentMethod] = useState(defaultPaymentMethod)

  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    )
    return {
      subtotal,
      itemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
    }
  }, [items])

  function notifyLowStockAfterCheckout(orderPayload) {
    const lowStockProducts = Array.isArray(orderPayload?.lowStockProducts)
      ? orderPayload.lowStockProducts
      : []

    if (!lowStockProducts.length) {
      return
    }

    const minimumThreshold = Number(orderPayload?.minimumStockThreshold || 1)
    const summary = lowStockProducts
      .slice(0, 3)
      .map((item) => `${item.productName}: ${item.remainingStock} left`)
      .join(' | ')
    const extraCount = lowStockProducts.length - 3
    const suffix = extraCount > 0 ? ` | +${extraCount} more` : ''

    toast.error(
      `Low stock alert (min ${minimumThreshold}): ${summary}${suffix}`,
      { duration: 6500 },
    )
  }

  function getOrderPayload() {
    return {
      orderItems: items.map((item) => ({
        product: item.product.id,
        quantity: item.quantity,
      })),
      shippingAddress1,
      shippingAddress2,
      city,
      zip,
      country,
      phone,
      user: userId,
      customerEmail: user.email,
      status: paymentMethod === 'card' ? 'Processing' : 'Pending',
    }
  }

  function getCheckoutProfilePayload() {
    return {
      phone: phone.trim(),
      addressLine1: shippingAddress1.trim(),
      shippingAddress1: shippingAddress1.trim(),
      addressLine2: shippingAddress2.trim(),
      shippingAddress2: shippingAddress2.trim(),
      city: city.trim(),
      postalCode: zip.trim(),
      zip: zip.trim(),
      country: country.trim(),
    }
  }

  async function placeOrderAfterPayment() {
    if (!userId) {
      setCardError('Please log in before completing Telebirr checkout.')
      navigate('/login')
      return
    }

    setCardError('')
    dispatch(clearOrderState())

    const action = await dispatch(createOrderWithInventorySync(getOrderPayload()))
    if (createOrderWithInventorySync.fulfilled.match(action)) {
      notifyLowStockAfterCheckout(action.payload)
      dispatch(clearCart())
      dispatch(clearPaymentState())
      navigate('/payment/success')
      return
    }

    const message =
      action?.error?.message ||
      action?.payload?.message ||
      'Order creation failed after payment initialization. Please try again.'
    setCardError(message)
  }

  async function initializeCardIntent() {
    setCardError('')
    dispatch(clearPaymentState())
    const stripeAction = await dispatch(
      createPaymentIntent({
        amount: Math.max(50, Math.round(totals.subtotal * 100)),
        currency: 'usd',
        orderId: `draft-${Date.now()}`,
      }),
    )

    if (createPaymentIntent.rejected.match(stripeAction)) {
      setCardError('Unable to initialize card payment. Please try again.')
    }
  }

  async function handleCheckout(event) {
    event.preventDefault()
    if (!user) {
      navigate('/login')
      return
    }

    const checkoutProfilePayload = getCheckoutProfilePayload()
    persistCheckoutDraft(checkoutProfilePayload)

    const saveProfileAction = await dispatch(saveUserProfile(checkoutProfilePayload))
    if (saveUserProfile.rejected.match(saveProfileAction)) {
      const saveError =
        saveProfileAction.payload ||
        saveProfileAction.error?.message ||
        'Please save your checkout details before continuing.'
      setCardError(String(saveError))
      toast.error(String(saveError))
      return
    }

    setCardError('')
    dispatch(clearOrderState())

    const validationAction = await dispatch(validateOrderInventory(getOrderPayload()))
    if (validateOrderInventory.rejected.match(validationAction)) {
      const rawMessage =
        validationAction?.payload?.message || validationAction?.error?.message || ''
      const message =
        rawMessage && rawMessage !== 'Rejected'
          ? rawMessage
          : 'Unable to validate inventory right now. Please try again.'
      setCardError(message)
      toast.error(message)
      dispatch(clearPaymentState())
      return
    }

    if (paymentMethod === 'card') {
      if (!stripePromise) {
        setCardError(
          'Missing VITE_STRIPE_PUBLISHABLE_KEY. Add it to your frontend environment.',
        )
        return
      }
      if (!payment.clientSecret) {
        await initializeCardIntent()
      }
      return
    }

    const action = await dispatch(createOrderWithInventorySync(getOrderPayload()))
    if (createOrderWithInventorySync.fulfilled.match(action)) {
      notifyLowStockAfterCheckout(action.payload)
      dispatch(clearCart())
      dispatch(clearPaymentState())
      navigate('/orders')
    }
  }

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>Your Cart</h2>
          <span>{totals.itemsCount} items</span>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <p>Your cart is empty.</p>
            <Link to="/" className="solid-button">
              Continue Shopping
            </Link>
          </div>
        ) : (
          <div className="cart-list">
            {items.map((item) => (
              <article key={item.product.id} className="cart-item">
                <img
                  src={getPrimaryProductImage(item.product, 'https://placehold.co/120x120?text=Item')}
                  alt={item.product.name}
                />
                <div>
                  <h3>{item.product.name}</h3>
                  <p>{formatCurrency(item.product.price)}</p>
                </div>
                <input
                  type="number"
                  min="1"
                  max={item.product.countInStock || 999}
                  value={item.quantity}
                  onChange={(event) =>
                    dispatch(
                      updateCartQuantity({
                        productId: item.product.id,
                        quantity: Number(event.target.value || 1),
                      }),
                    )
                  }
                />
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => dispatch(removeFromCart(item.product.id))}
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel checkout-panel">
        <h2>Checkout</h2>
        <p className="checkout-total">Total: {formatCurrency(totals.subtotal)}</p>
        <form className="checkout-form" onSubmit={handleCheckout}>
          <label htmlFor="payment-method">Payment Method</label>
          <select
            id="payment-method"
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
          >
            {isEthio ? <option value="cod">Cash On Delivery</option> : null}
            {isEthio ? (
              <option value="telebirr">Telebirr</option>
            ) : (
              <option value="card">Stripe Card</option>
            )}
          </select>

          <input
            value={shippingAddress1}
            onChange={(event) => setShippingAddress1(event.target.value)}
            placeholder="Shipping Address"
            required
          />
          <input
            value={shippingAddress2}
            onChange={(event) => setShippingAddress2(event.target.value)}
            placeholder="Address Line 2"
          />
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="City"
            required
          />
          <input
            value={zip}
            onChange={(event) => setZip(event.target.value)}
            placeholder="Postal Code"
            required
          />
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            required
          >
            <option value="">Select country</option>
            {country && !countryOptions.includes(country) ? (
              <option value={country}>{country}</option>
            ) : null}
            {countryOptions.map((countryName) => (
              <option key={countryName} value={countryName}>
                {countryName}
              </option>
            ))}
          </select>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Phone"
            required
          />

          {error ? <p className="form-error">{error}</p> : null}
          {successMessage ? <p className="form-success">{successMessage}</p> : null}
          {payment.error ? <p className="form-error">{payment.error}</p> : null}
          {cardError ? <p className="form-error">{cardError}</p> : null}
          {payment.clientSecret ? (
            <p className="form-success">
              Stripe payment initialized.
            </p>
          ) : null}

          {paymentMethod === 'card' && payment.clientSecret && stripePromise ? (
            <Elements stripe={stripePromise}>
              <StripeCardCheckout
                clientSecret={payment.clientSecret}
                onConfirmed={placeOrderAfterPayment}
                onError={(message) => {
                  setCardError(message)
                  navigate(`/payment/cancel?reason=${encodeURIComponent(message)}`)
                }}
              />
            </Elements>
          ) : null}

          {paymentMethod === 'telebirr' ? (
            <TelebirrCheckout
              amount={totals.subtotal}
              onConfirmed={placeOrderAfterPayment}
              onError={(message) => {
                setCardError(message)
              }}
            />
          ) : null}

          <button
            type="submit"
            className="solid-button"
            disabled={
              creating ||
              payment.creatingIntent ||
              items.length === 0 ||
              (paymentMethod === 'telebirr' && isEthio) ||
              (paymentMethod === 'card' && !!payment.clientSecret)
            }
          >
            {creating || payment.creatingIntent
              ? 'Processing...'
              : paymentMethod === 'card'
                ? payment.clientSecret
                  ? 'Use Card Form Above'
                  : 'Start Card Payment'
                : paymentMethod === 'telebirr'
                  ? 'Use Telebirr Form Above'
                  : 'Place Order'}
          </button>
        </form>
      </section>
    </section>
  )
}

export default CartPage