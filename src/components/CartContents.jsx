import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { clearCart, removeFromCart, updateCartQuantity } from '../features/cart/cartSlice'
import { cartLineKey } from '../utils/delivery'
import { formatCurrency, getPrimaryProductImage } from '../utils/format'
import CheckoutHeader from './CheckoutHeader'

const placeholder = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f1f3f5"/><path d="m60 28 30 16v32L60 92 30 76V44Zm0 0v32m-30-16 30 16 30-16M60 60v32" fill="none" stroke="#929ca8" stroke-width="3"/></svg>')}`

export default function CartContents({ disabled = false, onCheckout, children }) {
  const dispatch = useDispatch()
  const items = useSelector((state) => state.cart.items)
  const user = useSelector((state) => state.auth.user)
  const subtotal = items.reduce((total, { product, quantity }) => total + product.price * quantity, 0)
  function changeQuantity(product, quantity) {
    dispatch(updateCartQuantity({ productId: cartLineKey(product), quantity }))
  }
  return <section className="mobile-cart" aria-label="Shopping cart">
    <CheckoutHeader />
    <div className="mobile-cart-heading">
      <h1>Your Cart ({items.length})</h1>
      {items.length ? <button type="button" className="mobile-cart-text-button" disabled={disabled} onClick={() => {
        if (window.confirm('Clear your cart? Remove all items from this cart?')) dispatch(clearCart())
      }}>Clear cart</button> : null}
    </div>
    {user ? <Link className="mobile-cart-history" to="/delivery-checkouts">My multi-delivery checkouts</Link> : null}
    {items.length ? <>
      <div className="mobile-cart-list">
        {items.map(({ product, quantity }) => <article className="mobile-cart-item" key={cartLineKey(product)}>
          <img className="mobile-cart-image" src={getPrimaryProductImage(product, placeholder)} alt={product.name} onError={(event) => {
            if (event.currentTarget.getAttribute('src') !== placeholder) event.currentTarget.src = placeholder
          }} />
          <div className="mobile-cart-info">
            <h2>{product.name}</h2>
            <p className="mobile-cart-store">{product.storefrontId ? product.storefrontName || `Store ${product.storefrontId}` : 'Main catalog'}</p>
            <p className="mobile-cart-price">{formatCurrency(product.price)}</p>
            <div className="mobile-cart-quantity" role="group" aria-label={`${product.name} quantity`}>
              <button type="button" disabled={disabled} aria-label={`Decrease ${product.name} quantity`} onClick={() => {
                if (quantity === 1) dispatch(removeFromCart(cartLineKey(product)))
                else changeQuantity(product, quantity - 1)
              }}>-</button>
              <input aria-label={`Quantity for ${product.name}`} type="number" min="1" step="1" max={product.countInStock > 0 ? product.countInStock : undefined}
                value={quantity} disabled={disabled} onChange={(event) => changeQuantity(product, Number(event.target.value))} />
              <button type="button" disabled={disabled || (product.countInStock > 0 && quantity >= product.countInStock)}
                aria-label={`Increase ${product.name} quantity`} onClick={() => changeQuantity(product, quantity + 1)}>+</button>
            </div>
          </div>
          <div className="mobile-cart-actions">
            <button type="button" className="mobile-cart-text-button" disabled={disabled} aria-label={`Remove ${product.name}`}
              onClick={() => dispatch(removeFromCart(cartLineKey(product)))}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" /></svg>Remove
            </button>
            <strong aria-label={`Line total for ${product.name}`}>{formatCurrency(product.price * quantity)}</strong>
          </div>
        </article>)}
      </div>
      {children}
      <div className="mobile-cart-summary">
        <p>Delivery fees are calculated after choosing addresses, delivery speed and vehicles. Only server-confirmed charges apply.</p>
        <h2>Products subtotal: <span>{formatCurrency(subtotal)}</span></h2>
        <button type="button" className="solid-button mobile-cart-checkout" disabled={disabled} onClick={() => {
          if (onCheckout) onCheckout()
          else document.getElementById('cart-checkout-details')?.focus()
        }}>Proceed to Checkout</button>
      </div>
    </> : <div className="empty-state mobile-cart-empty">
      <p>Your cart is empty</p>
      <Link className="solid-button" to="/">Continue shopping</Link>
    </div>}
  </section>
}
