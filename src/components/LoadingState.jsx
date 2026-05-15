function LoadingState({ label = 'Loading...' }) {
  return (
    <div className="status-card" role="status">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  )
}

export default LoadingState