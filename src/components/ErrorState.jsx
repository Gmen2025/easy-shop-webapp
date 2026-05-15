function ErrorState({ message, onRetry }) {
  return (
    <div className="status-card error-card" role="alert">
      <h3>Something went wrong</h3>
      <p>{message || 'Please try again.'}</p>
      {onRetry ? (
        <button type="button" className="solid-button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}

export default ErrorState