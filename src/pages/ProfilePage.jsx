import { Link, Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'

function ProfilePage() {
  const user = useSelector((state) => state.auth.user)

  function readProfileField(keys) {
    for (const key of keys) {
      const value = user?.[key]
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value)
      }
    }

    return 'Not provided'
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <section className="page-stack profile-page">
      <section className="hero-panel">
        <p className="eyebrow">Account center</p>
        <h1>My Profile</h1>
        <p>Review your customer details, privacy options, and support contacts.</p>
      </section>

      <section className="profile-grid">
        <article className="panel profile-card">
          <div>
            <p className="eyebrow">My Profile</p>
            <h2>Customer details</h2>
          </div>
          <dl className="profile-details">
            <div>
              <dt>Customer Name</dt>
              <dd>{readProfileField(['name'])}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{readProfileField(['email'])}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{readProfileField(['phone'])}</dd>
            </div>
            <div>
              <dt>Address Line 1</dt>
              <dd>{readProfileField(['addressLine1', 'shippingAddress1', 'address1'])}</dd>
            </div>
            <div>
              <dt>Address Line 2</dt>
              <dd>{readProfileField(['addressLine2', 'shippingAddress2', 'address2'])}</dd>
            </div>
            <div>
              <dt>City</dt>
              <dd>{readProfileField(['city'])}</dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>{readProfileField(['country'])}</dd>
            </div>
            <div>
              <dt>Zipcode</dt>
              <dd>{readProfileField(['postalCode', 'zip'])}</dd>
            </div>
          </dl>
          <div className="action-row">
            <Link className="solid-button" to="/edit-profile">
              Edit Profile
            </Link>
          </div>
        </article>

        <article className="panel privacy-card">
          <div>
            <p className="eyebrow">Privacy and Account</p>
            <h2>Privacy Policy and account controls</h2>
          </div>
          <p className="section-note">
            Review how your data is handled and use the edit screen to delete your account.
          </p>
          <div className="action-row">
            <Link className="ghost-button" to="/privacy-policy">
              Privacy Policy
            </Link>
            <Link className="ghost-button" to="/edit-profile">
              Account Deletion
            </Link>
          </div>
        </article>

        <article className="panel support-card">
          <div>
            <p className="eyebrow">Help and Support</p>
            <h2>Need assistance?</h2>
          </div>
          <div className="support-list">
            <div className="support-item">
              <span>Phone</span>
              <a href="tel:+251912345678">+251 912 345 678</a>
            </div>
            <div className="support-item">
              <span>Email</span>
              <a href="mailto:support@addugenetshop.com">support@addugenetshop.com</a>
            </div>
          </div>
        </article>
      </section>
    </section>
  )
}

export default ProfilePage