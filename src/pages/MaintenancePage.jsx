import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { getSelectedDatabaseName } from '../api/client'

function MaintenancePage() {
  const error = useSelector((state) => state.maintenance.error)
  const usaRegionEnabled = useSelector((state) => state.maintenance.usaRegionEnabled)
  const usaRestricted = /usa/i.test(getSelectedDatabaseName()) && usaRegionEnabled !== true
  return (
    <section className="maintenance-wrap">
      <article className="maintenance-card">
        <p className="maintenance-pill">Service Notice</p>
        <h1>{usaRestricted ? 'USA storefront access is limited.' : 'We are currently under maintenance.'}</h1>
        {error && <p role="alert">{error}</p>}
        <p>
          {usaRestricted ? 'Sign in with an administrator or approved verified tester account, or select Ethiopia in the menu.' :
            'The storefront is temporarily paused while we apply updates. Please check back in a few minutes.'}
        </p>
        <div className="maintenance-actions">
          <Link className="solid-button" to="/login">
            Admin / Tester Login
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