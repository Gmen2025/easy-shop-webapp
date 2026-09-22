import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getServiceRequests, updateServiceRequest } from '../api/serviceRequests'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'

function formatStatus(status) {
  return String(status || 'new')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value) {
  if (!value) {
    return 'Date unavailable'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
}

function ServiceRequestsPage() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionId, setActionId] = useState('')

  useEffect(() => {
    let isCurrent = true

    getServiceRequests()
      .then((response) => {
        if (!isCurrent) {
          return
        }

        setRequests(Array.isArray(response) ? response : response?.items || [])
      })
      .catch((requestError) => {
        if (isCurrent) {
          setError(requestError.message || 'Unable to load your service requests.')
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoading(false)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [])

  function loadRequests() {
    setLoading(true)
    setError('')

    getServiceRequests()
      .then((response) => {
        setRequests(Array.isArray(response) ? response : response?.items || [])
      })
      .catch((requestError) => {
        setError(requestError.message || 'Unable to load your service requests.')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  async function cancelRequest(request) {
    const requestId = request._id || request.id
    if (!requestId || !window.confirm('Cancel this service request?')) {
      return
    }

    setActionId(requestId)
    setError('')
    try {
      const updated = await updateServiceRequest(requestId, { status: 'cancelled' })
      setRequests((current) => current.map((item) => (
        (item._id || item.id) === requestId ? updated : item
      )))
    } catch (requestError) {
      setError(requestError.message || 'Unable to cancel this service request.')
    } finally {
      setActionId('')
    }
  }

  if (loading && requests.length === 0) {
    return <LoadingState label="Loading your service requests..." />
  }

  if (error && requests.length === 0) {
    return <ErrorState message={error} onRetry={loadRequests} />
  }

  return (
    <section className="panel service-requests-page">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Support</p>
          <h2>Service Request History</h2>
        </div>
        <span>{requests.length} request{requests.length === 1 ? '' : 's'}</span>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="section-note">Refreshing your requests...</p> : null}

      {requests.length === 0 ? (
        <div className="empty-state">
          <p>You have not submitted a service request yet.</p>
          <Link className="solid-button" to="/service-request">
            Request Service
          </Link>
        </div>
      ) : (
        <div className="service-requests-list">
          {requests.map((request) => (
            <article className="service-request-card" key={request._id || request.id}>
              <div className="service-request-card-header">
                <div>
                  <strong>{request.machineType || 'Machine service'}</strong>
                  <p>{request.country || 'Country unavailable'}</p>
                </div>
                <span className={`request-status request-status-${request.status || 'new'}`}>
                  {formatStatus(request.status)}
                </span>
              </div>
              <dl className="service-request-summary">
                <div>
                  <dt>Submitted</dt>
                  <dd>{formatDate(request.createdAt || request.dateCreated)}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{request.serviceLocation || request.locationCity || 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd>{request.priority || 'Normal'}</dd>
                </div>
                <div>
                  <dt>Contact phone</dt>
                  <dd>{request.contactPhone || request.customer?.phone || 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{request.locationAddress || 'Not provided'}</dd>
                </div>
              </dl>
              {request.problemDescription ? <p>{request.problemDescription}</p> : null}
              {!['completed', 'cancelled'].includes(request.status) ? (
                <div className="inline-actions">
                  <button
                    type="button"
                    className="ghost-button danger-button"
                    onClick={() => cancelRequest(request)}
                    disabled={actionId === (request._id || request.id)}
                  >
                    {actionId === (request._id || request.id) ? 'Cancelling...' : 'Cancel Request'}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default ServiceRequestsPage
