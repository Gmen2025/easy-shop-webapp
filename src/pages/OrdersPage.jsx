import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchUserOrders } from '../features/orders/ordersSlice'
import { formatCurrency, getEntityId } from '../utils/format'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'

const statusSteps = ['Pending', 'Processing', 'Shipped', 'Delivered']

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
  const { items, loading, error } = useSelector((state) => state.orders)

  useEffect(() => {
    if (user?._id) {
      dispatch(fetchUserOrders(user._id))
    }
  }, [dispatch, user])

  if (loading) {
    return <LoadingState label="Loading your orders..." />
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => dispatch(fetchUserOrders(user._id))} />
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Order History</h2>
        <span>{items.length} orders</span>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>You have no orders yet.</p>
        </div>
      ) : (
        <div className="orders-list">
          {items.map((order) => (
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
                Total: <strong>{formatCurrency(order.totalPrice)}</strong>
              </p>
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
                        src={product.image || 'https://placehold.co/64x64?text=Item'}
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
          ))}
        </div>
      )}
    </section>
  )
}

export default OrdersPage