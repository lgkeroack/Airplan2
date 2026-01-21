'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100vw',
      backgroundColor: '#111827',
      color: 'white',
      padding: '20px',
    }}>
      <h1 style={{ fontSize: '28px', marginBottom: '20px', color: '#ef4444' }}>
        Something went wrong!
      </h1>
      <p style={{ marginBottom: '20px' }}>{error.message || 'An error occurred'}</p>
      <button
        onClick={reset}
        style={{
          padding: '12px 24px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '14px',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}
