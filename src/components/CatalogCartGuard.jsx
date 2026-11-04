import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import useCatalogPricing from '../features/products/useCatalogPricing'
import { unresolvedCartItems } from '../utils/catalogPricing'
import { removeFromCart } from '../features/cart/cartSlice'
import { cartLineKey } from '../utils/delivery'
import CatalogPricingNotice from './CatalogPricingNotice'

export default function CatalogCartGuard({ children }) {
  const pricing = useCatalogPricing()
  const items = useSelector((state) => state.cart.items)
  const dispatch = useDispatch()
  if (pricing.status !== 'ready') return <section className="panel"><h1>Cart pricing unavailable</h1><CatalogPricingNotice /></section>
  const unresolved = pricing.enabled ? unresolvedCartItems(items) : []
  if (!unresolved.length) return children
  return <section className="panel page-stack">
    <h1>Choose store prices before checkout</h1>
    <p role="alert">Nearest-store pricing is enabled. These older catalog items have no selected store. Remove each item and reopen its details to choose a location and add it again. Checkout is blocked; catalog prices will not be used.</p>
    {unresolved.map((item) => <div className="action-row" key={cartLineKey(item.product)}>
      <Link to={`/products/${encodeURIComponent(item.product.id || item.product._id)}`}>{item.product.name}: choose location and store</Link>
      <button className="danger-button" onClick={() => dispatch(removeFromCart(cartLineKey(item.product)))}>Remove old item</button>
    </div>)}
  </section>
}
