import { useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import {
  clearCart,
  removeFromCart,
  updateCartQuantity,
} from '../features/cart/cartSlice'
import { clearOrderState, createOrder } from '../features/orders/ordersSlice'
import {
  clearPaymentState,
  createPaymentIntent,
} from '../features/payment/paymentSlice'
import StripeCardCheckout from '../components/StripeCardCheckout'
import TelebirrCheckout from '../components/TelebirrCheckout'
import { getSelectedDatabaseName } from '../api/client'
import { formatCurrency, getPrimaryProductImage } from '../utils/format'

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripeKey ? loadStripe(stripeKey) : null

function CartPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [shippingAddress1, setShippingAddress1] = useState('Bole Road')
  const [city, setCity] = useState('Addis Ababa')
  const [zip, setZip] = useState('1000')
  const [country, setCountry] = useState('Ethiopia')
  const [phone, setPhone] = useState('+251900000000')
  const [cardError, setCardError] = useState('')

  const user = useSelector((state) => state.auth.user)
  const { items } = useSelector((state) => state.cart)
  const { creating, error, successMessage } = useSelector((state) => state.orders)
  const payment = useSelector((state) => state.payment)
  const selectedDb = getSelectedDatabaseName()
  const isEthio = selectedDb === 'E_Shopping'

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

  function getOrderPayload() {
    return {
      orderItems: items.map((item) => ({
        product: item.product.id,
        quantity: item.quantity,
      })),
      shippingAddress1,
      city,
      zip,
      country,
      phone,
      user: user._id,
      customerEmail: user.email,
      status: paymentMethod === 'card' ? 'Processing' : 'Pending',
    }
  }

  async function placeOrderAfterPayment() {
    if (!user?._id) {
      setCardError('Please log in before completing Telebirr checkout.')
      navigate('/login')
      return
    }

    setCardError('')
    dispatch(clearOrderState())

    const action = await dispatch(createOrder(getOrderPayload()))
    if (createOrder.fulfilled.match(action)) {
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

    dispatch(clearOrderState())

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

    const action = await dispatch(createOrder(getOrderPayload()))
    if (createOrder.fulfilled.match(action)) {
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
          <input value={city} onChange={(event) => setCity(event.target.value)} required />
          <input value={zip} onChange={(event) => setZip(event.target.value)} required />
          <input
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            required
          />
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
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