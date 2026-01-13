'use client'

import { useEffect, useState } from 'react'

export default function ClientErrorCatcher({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Catch unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[Client] Unhandled promise rejection:', event.reason)
      setError(`Promise Rejection: ${event.reason?.message || event.reason}`)
      event.preventDefault()
    }

    // Catch uncaught errors
    const handleError = (event: ErrorEvent) => {
      console.error('[Client] Uncaught error:', event.error)
      setError(`Uncaught Error: ${event.message}\nAt: ${event.filename}:${event.lineno}`)
      event.preventDefault()
    }

    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleError)

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleError)
    }
  }, [])

  if (error) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.9)',
        color: '#ff5555',
        padding: '40px',
        zIndex: 99999,
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        overflow: 'auto'
      }}>
        <h1 style={{ color: 'white', marginBottom: '20px' }}>Client-Side Error Detected</h1>
        <div style={{ backgroundColor: '#1a1a1a', padding: '20px', borderRadius: '8px', border: '1px solid #ff5555' }}>
          {error}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            backgroundColor: '#ff5555',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Reload Page
        </button>
      </div>
    )
  }

  return <>{children}</>
}

