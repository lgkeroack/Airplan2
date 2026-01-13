'use client'

import { useEffect, useState } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string; originalError?: any }
  reset: () => void
}) {
  const [serverLogs, setServerLogs] = useState<Array<{ timestamp: number; level: string; message: string }>>([])

  useEffect(() => {
    // Log the error to console with full details
    console.error('Application error:', error)
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)
    console.error('Error name:', error.name)
    if (error.originalError) {
      console.error('Original error:', error.originalError)
    }
    if (error.digest) {
      console.error('Error digest:', error.digest)
    }

    // Fetch server logs
    const fetchLogs = async () => {
      try {
        const response = await fetch('/api/logs', { cache: 'no-store' })
        if (response.ok) {
          const data = await response.json()
          if (data && data.logs && Array.isArray(data.logs)) {
            setServerLogs(data.logs)
          }
        }
      } catch (e) {
        console.error('Failed to fetch server logs:', e)
      }
    }

    fetchLogs()
    // Poll for new logs every 2 seconds
    const interval = setInterval(fetchLogs, 2000)
    return () => clearInterval(interval)
  }, [error])

  // Try to get full error details
  const errorDetails = error.originalError || error
  const errorString = typeof errorDetails === 'object'
    ? JSON.stringify(errorDetails, Object.getOwnPropertyNames(errorDetails), 2)
    : String(errorDetails)

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
      fontFamily: "'Times New Roman', Times, serif",
      padding: '20px',
      overflow: 'auto'
    }}>
      <h1 style={{ fontSize: '28px', marginBottom: '20px', color: '#ef4444', fontWeight: 'bold' }}>
        Internal Server Error
      </h1>

      <div style={{
        backgroundColor: '#1f2937',
        border: '2px solid #fbbf24',
        borderRadius: '8px',
        padding: '20px',
        maxWidth: '900px',
        width: '100%',
        marginBottom: '20px',
        boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.3)'
      }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px', color: '#fbbf24', fontWeight: 'bold' }}>
          💡 Quick Troubleshooting
        </h2>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: '1.8', color: '#f1f5f9' }}>
          <li>Check the <strong>Server Logs</strong> section below for detailed error information</li>
          <li>Make sure the dev server is running: <code style={{ backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '3px' }}>npm run dev</code></li>
          <li>Verify you're accessing the correct port (check your terminal output)</li>
          <li>Try refreshing the page or clicking "Try Again" below</li>
          <li>Check the browser console (F12) for additional client-side errors</li>
        </ul>
      </div>

      <div style={{
        backgroundColor: '#1f2937',
        border: '2px solid #374151',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '900px',
        width: '100%',
        marginBottom: '20px',
        boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.3)'
      }}>
        <h2 style={{ fontSize: '20px', marginBottom: '16px', color: '#fca5a5', fontWeight: 'bold' }}>
          Error Details:
        </h2>

        <div style={{ marginBottom: '20px' }}>
          <strong style={{ color: '#fbbf24', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
            Error Message:
          </strong>
          <pre style={{
            backgroundColor: '#0f172a',
            padding: '12px',
            borderRadius: '4px',
            overflow: 'auto',
            fontSize: '13px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            border: '1px solid #1e293b',
            color: '#f1f5f9'
          }}>
            {error.message || 'Unknown error'}
          </pre>
        </div>

        {error.name && (
          <div style={{ marginBottom: '20px' }}>
            <strong style={{ color: '#fbbf24', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
              Error Type:
            </strong>
            <code style={{
              backgroundColor: '#0f172a',
              padding: '6px 12px',
              borderRadius: '4px',
              fontSize: '13px',
              border: '1px solid #1e293b',
              color: '#f1f5f9',
              display: 'inline-block'
            }}>
              {error.name}
            </code>
          </div>
        )}

        {error.stack && (
          <div style={{ marginBottom: '20px' }}>
            <strong style={{ color: '#fbbf24', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
              Stack Trace:
            </strong>
            <pre style={{
              backgroundColor: '#0f172a',
              padding: '12px',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '11px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '500px',
              border: '1px solid #1e293b',
              color: '#f1f5f9'
            }}>
              {error.stack}
            </pre>
          </div>
        )}

        {error.digest && (
          <div style={{ marginBottom: '20px' }}>
            <strong style={{ color: '#fbbf24', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
              Error Digest:
            </strong>
            <code style={{
              backgroundColor: '#0f172a',
              padding: '6px 12px',
              borderRadius: '4px',
              fontSize: '13px',
              border: '1px solid #1e293b',
              color: '#f1f5f9',
              display: 'inline-block'
            }}>
              {error.digest}
            </code>
          </div>
        )}

        {error.originalError && (
          <div style={{ marginBottom: '20px' }}>
            <strong style={{ color: '#fbbf24', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
              Full Error Object:
            </strong>
            <pre style={{
              backgroundColor: '#0f172a',
              padding: '12px',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '11px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '400px',
              border: '1px solid #1e293b',
              color: '#f1f5f9'
            }}>
              {errorString}
            </pre>
          </div>
        )}

        {serverLogs.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <strong style={{ color: '#fbbf24', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
              Server Logs ({serverLogs.length} entries):
            </strong>
            <div style={{
              backgroundColor: '#0f172a',
              padding: '12px',
              borderRadius: '4px',
              border: '1px solid #1e293b',
              maxHeight: '400px',
              overflow: 'auto'
            }}>
              {serverLogs.map((log, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: index < serverLogs.length - 1 ? '8px' : '0',
                    paddingBottom: index < serverLogs.length - 1 ? '8px' : '0',
                    borderBottom: index < serverLogs.length - 1 ? '1px solid #1e293b' : 'none',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: log.level === 'error' ? '#ef4444' : log.level === 'warn' ? '#fbbf24' : '#f1f5f9'
                  }}
                >
                  <span style={{ color: '#6b7280' }}>
                    [{new Date(log.timestamp).toLocaleTimeString()}]
                  </span>
                  <span style={{ marginLeft: '8px', fontWeight: log.level === 'error' ? 'bold' : 'normal' }}>
                    [{log.level.toUpperCase()}]
                  </span>
                  <span style={{ marginLeft: '8px' }}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={reset}
        style={{
          padding: '12px 24px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '2px 2px 0px rgba(0, 0, 0, 0.2)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#2563eb'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#3b82f6'
        }}
      >
        Try Again
      </button>
    </div>
  )
}

