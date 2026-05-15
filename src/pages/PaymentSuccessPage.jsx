import { Link } from 'react-router-dom'

function PaymentSuccessPage() {
  return (
    <section className="auth-wrap">
      <div className="panel auth-form">
        <h2>Payment Successful</h2>
        <p>Your card payment was confirmed and your order was placed.</p>
        <Link to="/orders" className="solid-button">
          View My Orders
        </Link>
        <Link to="/" className="ghost-button">
          Continue Shopping
        </Link>
      </div>
    </section>
  )
}

export default PaymentSuccessPage