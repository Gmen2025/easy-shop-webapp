import { Link, useSearchParams } from 'react-router-dom'

function PaymentCancelPage() {
  const [searchParams] = useSearchParams()
  const reason = searchParams.get('reason') || 'Payment was cancelled or not completed.'

  return (
    <section className="auth-wrap">
      <div className="panel auth-form">
        <h2>Payment Cancelled</h2>
        <p>{reason}</p>
        <Link to="/cart" className="solid-button">
          Back To Cart
        </Link>
        <Link to="/" className="ghost-button">
          Continue Shopping
        </Link>
      </div>
    </section>
  )
}

export default PaymentCancelPage