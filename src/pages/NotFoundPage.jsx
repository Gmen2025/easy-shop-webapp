import { Link } from 'react-router-dom'

function NotFoundPage() {
  return (
    <section className="auth-wrap">
      <div className="panel auth-form">
        <h2>Page Not Found</h2>
        <p>The page you requested does not exist.</p>
        <Link to="/" className="solid-button">
          Return Home
        </Link>
      </div>
    </section>
  )
}

export default NotFoundPage