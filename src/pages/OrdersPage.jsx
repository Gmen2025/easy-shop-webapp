import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchUserOrders } from '../features/orders/ordersSlice'
import { formatCurrency, getEntityId, getPrimaryProductImage } from '../utils/format'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'

const statusSteps = ['Pending', 'Processing', 'Shipped', 'Delivered']

function getOrderPaymentDetails(order) {
  const paymentMethod = String(order?.paymentMethod || 'N/A').trim() || 'N/A'
  const paymentMeta = order?.paymentMeta && typeof order.paymentMeta === 'object'
    ? order.paymentMeta
    : {}

  const bankName = String(
    paymentMeta.bankName || paymentMeta.bank || paymentMeta.bank_name || order?.bankName || '',
  ).trim()
  const senderName = String(
    paymentMeta.senderName || paymentMeta.sender || paymentMeta.sender_name || order?.senderName || '',
  ).trim()
  const transferReference = String(
    paymentMeta.transferReference ||
    paymentMeta.reference ||
    paymentMeta.transfer_reference ||
    order?.transferReference ||
    '',
  ).trim()
  const isBankTransfer = /bank\s*transfer/i.test(paymentMethod)

  return {
    paymentMethod,
    isBankTransfer,
    bankName,
    senderName,
    transferReference,
  }
}

function isObjectIdLike(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''))
}

function getDeliveryModeLabel(deliveryMode) {
  const labels = {
    SAME_DAY: 'Same Day',
    NEXT_DAY: 'Next Day',
    SCHEDULED: 'Scheduled',
  }
  return labels[deliveryMode] || 'Same Day'
}

function getStatusIndex(status) {
  const index = statusSteps.indexOf(status)
  if (index >= 0) {
    return index
  }
  if (status === 'Cancelled') {
    return -1
  }
  return 0
}

function StatusTracker({ status }) {
  const currentIndex = getStatusIndex(status)
  const isCancelled = status === 'Cancelled'

  if (isCancelled) {
    return <p className="status-cancelled">Order cancelled</p>
  }

  return (
    <div className="status-tracker" aria-label={`Order status ${status}`}>
      {statusSteps.map((step, index) => (
        <div
          key={step}
          className={`status-step ${index <= currentIndex ? 'done' : ''}`}
        >
          <span className="status-dot" />
          <small>{step}</small>
        </div>
      ))}
    </div>
  )
}

function OrdersPage() {
  const dispatch = useDispatch()
  const user = useSelector((state) => state.auth.user)
  const userId = user?._id || user?.id || null
  const { items, loading, error } = useSelector((state) => state.orders)

  useEffect(() => {
    if (isObjectIdLike(userId)) {
      dispatch(fetchUserOrders(userId))
    }
  }, [dispatch, userId])

  if (loading && items.length === 0) {
    return <LoadingState label="Loading your orders..." />
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          if (isObjectIdLike(userId)) {
            dispatch(fetchUserOrders(userId))
          }
        }}
      />
    )
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Order History</h2>
        <span>{items.length} orders</span>
      </div>
      {loading ? <p className="section-note">Refreshing your orders...</p> : null}

      {items.length === 0 ? (
        <div className="empty-state">
          <p>You have no orders yet.</p>
        </div>
      ) : (
        <div className="orders-list">
          {items.map((order) => {
            const paymentDetails = getOrderPaymentDetails(order)

            return (
              <article className="order-card" key={getEntityId(order)}>
                <div className="order-head">
                  <strong>Order #{getEntityId(order)}</strong>
                  <span>{order.status}</span>
                </div>
                <p>
                  User: <strong>{order.user?.name || 'Customer'}</strong>
                </p>
                <p>Email: {order.user?.email || order.customerEmail || 'N/A'}</p>
                <p>Phone: {order.phone || order.user?.phone || 'N/A'}</p>
                <p>Address 1: {order.shippingAddress1 || 'N/A'}</p>
                <p>Address 2: {order.shippingAddress2 || 'N/A'}</p>
                <p>
                  {order.city || 'N/A'}, {order.zip || 'N/A'}, {order.country || 'N/A'}
                </p>
                <p>
                  Delivery: <strong>{getDeliveryModeLabel(order.deliveryMode)}</strong>
                  {' '}(Fee: {formatCurrency(order.deliveryFee)})
                </p>
                {order.deliveryMode === 'SCHEDULED' && order.scheduledFor ? (
                  <p>Scheduled For: {new Date(order.scheduledFor).toLocaleString()}</p>
                ) : null}
                <p>
                  Total: <strong>{formatCurrency(order.totalPrice)}</strong>
                </p>
                <p>Payment Method: {paymentDetails.paymentMethod}</p>
                {paymentDetails.isBankTransfer && paymentDetails.bankName ? (
                  <p>Bank Name: {paymentDetails.bankName}</p>
                ) : null}
                {paymentDetails.isBankTransfer && paymentDetails.senderName ? (
                  <p>Sender Name: {paymentDetails.senderName}</p>
                ) : null}
                {paymentDetails.isBankTransfer && paymentDetails.transferReference ? (
                  <p>Transfer Ref: {paymentDetails.transferReference}</p>
                ) : null}
                <p>
                  Date:{' '}
                  {new Date(order.dateOrdered).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </p>
                <div className="order-items-block">
                  {(order.orderItems || []).map((item) => {
                    const product = item.product || {}
                    const quantity = Number(item.quantity || 0)
                    const price = Number(product.price || 0)
                    const subtotal = quantity * price

                    return (
                      <div className="order-item-row" key={getEntityId(item)}>
                        <img
                          src={getPrimaryProductImage(product, 'https://placehold.co/64x64?text=Item')}
                          alt={product.name || 'Order item'}
                          width="54"
                          height="54"
                        />
                        <div>
                          <small>{product.name || 'Unnamed item'}</small>
                          <small>
                            Qty: {quantity} | Price: {formatCurrency(price)} | Subtotal:{' '}
                            {formatCurrency(subtotal)}
                          </small>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <StatusTracker status={order.status} />
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default OrdersPage