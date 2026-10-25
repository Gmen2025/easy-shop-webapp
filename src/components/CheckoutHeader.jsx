export default function CheckoutHeader({ step = 0, title, onBack, disabled = false }) {
  return <header className="mobile-cart checkout-header">
    <div className="mobile-cart-brand">
      {onBack ? <button type="button" className="ghost-button" disabled={disabled} aria-label="Back to previous checkout step" onClick={onBack}>&lt;</button> : null}
      <svg viewBox="0 0 40 44" aria-hidden="true"><path d="M8 13h24l3 27H5L8 13Z" fill="#ffdb00" /><path d="M14 14V9a6 6 0 0 1 12 0v5" fill="none" stroke="currentColor" strokeWidth="3" /></svg>
      <div><strong>Addu Genet Eshop</strong><p>Global Products - Local Access</p></div>
    </div>
    <ol className="mobile-cart-progress" aria-label="Checkout steps">
      {['Cart', 'Address', 'Delivery', 'Payment'].map((label, index) => <li key={label}
        className={index < Math.min(step, 3) ? 'checkout-step-complete' : ''}
        aria-current={index === Math.min(step, 3) ? 'step' : undefined}>
        <span>{index + 1}</span>{label}
      </li>)}
    </ol>
    {title ? <h1>{title}</h1> : null}
  </header>
}
