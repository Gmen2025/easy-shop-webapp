import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../features/auth/authSlice'

const icons = {
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  edit: 'm16 3 5 5-12 12-6 1 1-6L16 3M14 5l5 5',
  list: 'M9 5H5v16h14V5h-4M9 3h6v4H9zM8 12h8M8 16h8',
  exit: 'M9 3H3v18h6M10 12h11m-5-5 5 5-5 5',
  box: 'm12 3 9 5v9l-9 5-9-5V8l9-5M3 8l9 5 9-5M12 13v9M7 6l10 5',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  truck: 'M1 4h13v13H1zM14 9h5l4 5v3h-9M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4M19 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  cancel: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M8 8l8 8M16 8l-8 8',
  card: 'M2 4h20v16H2zM2 9h20M6 15h4',
  shield: 'm12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6l9-4M8 12l3 3 5-6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  support: 'M3 14v-3a9 9 0 0 1 18 0v3M3 12h4v8H3zM17 12h4v8h-4zM17 20c0 2-3 2-5 2',
  mail: 'M2 4h20v16H2zM2 5l10 8L22 5',
  phone: 'M6 2h4l1 6-3 2a15 15 0 0 0 6 6l2-3 6 1v4c0 6-9 3-14-2S0 2 6 2',
  chat: 'M21 11a9 9 0 0 1-9 9H7l-5 3 2-7a9 9 0 1 1 17-5M8 11h8M8 7h5',
  send: 'm2 10 20-8-6 20-5-8-9-4ZM11 14 22 2',
}

function ProfileIcon({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]} /></svg>
}

function Tile({ title, subtitle, icon, tone, to, href }) {
  const content = <>
    <span className="account-tile-icon"><ProfileIcon name={icon} /></span>
    <strong>{title}</strong><span>{subtitle}</span><span aria-hidden="true" className="account-chevron">&gt;</span>
  </>
  const className = `account-tile account-tone-${tone}`
  return to ? <Link className={className} to={to}>{content}</Link> :
    <a className={className} href={href} {...(href.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{content}</a>
}

function ProfilePage() {
  const user = useSelector((state) => state.auth.user)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const fields = [
    ['Customer Name', ['name']], ['Email', ['email']], ['Phone', ['phone']],
    ['Address Line 1', ['addressLine1', 'shippingAddress1', 'address1']],
    ['Address Line 2', ['addressLine2', 'shippingAddress2', 'address2']],
    ['City', ['city']], ['Country', ['country']], ['Zipcode', ['postalCode', 'zip']],
  ]
  const read = (keys) => keys.map((key) => user?.[key])
    .find((value) => value !== undefined && value !== null && String(value).trim()) || 'Not provided'

  if (!user) return <Navigate to="/login" replace />

  return <section className="account-profile" aria-label="My Profile">
    <h1 className="account-page-title">My Account</h1>
    <Link to="/edit-profile" className="account-identity" aria-label="Edit your profile">
      <span className="account-avatar"><ProfileIcon name="user" /></span>
      <span className="account-identity-text">
        <strong>{user.name || 'My Account'}</strong>
        <span><ProfileIcon name="mail" />{user.email || 'Email not provided'}</span>
        <span><ProfileIcon name="phone" />{user.phone || 'Add a phone number'}</span>
      </span>
      <span aria-hidden="true">&gt;</span>
    </Link>

    <nav className="account-actions" aria-label="Account actions">
      <Link to="/edit-profile"><ProfileIcon name="edit" />Edit Profile</Link>
      <Link to="/service-requests"><ProfileIcon name="list" />My Service Requests</Link>
      <button type="button" onClick={() => { dispatch(logout()); navigate('/') }}>
        <ProfileIcon name="exit" />Sign Out
      </button>
    </nav>

    <section className="account-section" aria-labelledby="account-orders-title">
      <Link to="/orders" className="account-section-heading">
        <span className="account-heading-icon account-gold"><ProfileIcon name="box" /></span>
        <span><h2 id="account-orders-title">Order List</h2><span>View and manage your orders</span></span>
        <span aria-hidden="true" className="account-row-chevron">&gt;</span>
      </Link>
      <div className="account-tiles">
        <Tile title="Track Delivery" subtitle="Follow your order and drop-offs" icon="pin" tone="green" to="/delivery-checkouts" />
        <Tile title="Deliveries" subtitle="View your order history" icon="truck" tone="blue" to="/orders" />
        <Tile title="Cancellation" subtitle="Manage eligible delivery cancellations" icon="cancel" tone="red" to="/delivery-checkouts" />
        <Tile title="Payment" subtitle="View checkout payments and refunds" icon="card" tone="purple" to="/delivery-checkouts" />
      </div>
    </section>

    <section className="account-section" aria-labelledby="account-privacy-title">
      <div className="account-section-heading">
        <span className="account-heading-icon account-blue"><ProfileIcon name="shield" /></span>
        <span><h2 id="account-privacy-title">Privacy &amp; Account</h2><span>Manage your privacy and account settings</span></span>
      </div>
      {[
        ['Account Settings', 'Update your personal details and contact information', 'edit', '/edit-profile'],
        ['Privacy Policy', 'Learn how we protect your data', 'list', '/privacy-policy'],
        ['Terms of Service', 'Review the terms for using our services', 'list', '/terms.html'],
        ['Account Deletion', 'Review and confirm account deletion', 'trash', '/edit-profile'],
      ].map(([title, subtitle, icon, to]) => {
        const content = <><span className={`account-heading-icon ${icon === 'trash' ? 'account-red' : 'account-blue'}`}><ProfileIcon name={icon} /></span>
          <span><strong>{title}</strong><small>{subtitle}</small></span><span aria-hidden="true" className="account-row-chevron">&gt;</span></>
        return to.endsWith('.html') ? <a key={title} className="account-row" href={to}>{content}</a> :
          <Link key={title} className="account-row" to={to}>{content}</Link>
      })}
      <details className="account-details">
        <summary>Customer details</summary>
        <dl className="profile-details">{fields.map(([label, keys]) =>
          <div key={label}><dt>{label}</dt><dd>{read(keys)}</dd></div>)}</dl>
      </details>
    </section>

    <section className="account-section" aria-labelledby="account-support-title">
      <div className="account-section-heading">
        <span className="account-heading-icon account-green"><ProfileIcon name="support" /></span>
        <span><h2 id="account-support-title">Help &amp; Support</h2><span>We're here to help you</span></span>
      </div>
      <div className="account-tiles">
        <Tile title="Email" subtitle="easyshop@addugeneteshop.com" icon="mail" tone="blue" href="mailto:easyshop@addugeneteshop.com" />
        <Tile title="Phone" subtitle="+251 954 141 473" icon="phone" tone="blue" href="tel:+251954141473" />
        <Tile title="WhatsApp" subtitle="Chat with us" icon="chat" tone="green" href="https://wa.me/251954141473" />
        <Tile title="Telegram" subtitle="Message @BettyT58" icon="send" tone="blue" href="https://t.me/BettyT58" />
      </div>
      <p className="account-support-hours">Support Hours: Mon-Sat, 9 AM - 6 PM</p>
      <Link className="account-service-link" to="/service-request">Request Service</Link>
    </section>
  </section>
}

export default ProfilePage
