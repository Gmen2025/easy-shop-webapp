import { Link } from 'react-router-dom'

function MaintenancePage() {
  return (
    <section className="maintenance-wrap">
      <article className="maintenance-card">
        <p className="maintenance-pill">Service Notice</p>
        <h1>We are currently under maintenance.</h1>
        <p>
          The storefront is temporarily paused while we apply updates. Please check
          back in a few minutes.
        </p>
        <div className="maintenance-actions">
          <Link className="solid-button" to="/login">
            Admin Login
          </Link>
          <button
            type="button"
            className="ghost-button"
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
      </article>
    </section>
  )
}

export default MaintenancePage