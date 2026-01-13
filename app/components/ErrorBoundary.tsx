'use client'

import React from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  serverLogs: Array<{ timestamp: number; level: string; message: string }>
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

class ErrorBoundaryClass extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private logInterval: NodeJS.Timeout | null = null

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      serverLogs: [],
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({
      error,
      errorInfo,
    })

    // Fetch server logs
    this.fetchServerLogs()
    this.logInterval = setInterval(() => this.fetchServerLogs(), 2000)
  }

  componentWillUnmount() {
    if (this.logInterval) {
      clearInterval(this.logInterval)
    }
  }

  fetchServerLogs = async () => {
    try {
      const response = await fetch('/api/logs', { cache: 'no-store' })
      if (response.ok) {
        const data = await response.json()
        if (data && data.logs && Array.isArray(data.logs)) {
          this.setState({ serverLogs: data.logs })
        }
      }
    } catch (e) {
      console.error('Failed to fetch server logs:', e)
    }
  }

  render() {
    if (this.state.hasError) {
      const error = this.state.error
      const errorInfo = this.state.errorInfo

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          backgroundColor: '#111827',
          color: 'white',
          fontFamily: "'Times New Roman', Times, serif",
          padding: '20px',
          overflow: 'auto'
        }}>
          <h1 style={{ fontSize: '28px', marginBottom: '20px', color: '#ef4444', fontWeight: 'bold' }}>
            Application Error
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
              💡 What You Can Do
            </h2>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: '1.8', color: '#f1f5f9' }}>
              <li>Click <strong>"Reload Page"</strong> below to try again</li>
              <li>Check the <strong>Server Logs</strong> section below for detailed error information</li>
              <li>Open browser console (F12) to see additional error details</li>
              <li>Verify the dev server is running in your terminal</li>
              <li>If the error persists, check the terminal where <code style={{ backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '3px' }}>npm run dev</code> is running</li>
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

            {error && (
              <>
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
              </>
            )}

            {errorInfo && errorInfo.componentStack && (
              <div style={{ marginBottom: '20px' }}>
                <strong style={{ color: '#fbbf24', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                  Component Stack:
                </strong>
                <pre style={{
                  backgroundColor: '#0f172a',
                  padding: '12px',
                  borderRadius: '4px',
                  overflow: 'auto',
                  fontSize: '11px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '300px',
                  border: '1px solid #1e293b',
                  color: '#f1f5f9'
                }}>
                  {errorInfo.componentStack}
                </pre>
              </div>
            )}

            {error && 'name' in error && (
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
                  color: '#f1f5f9'
                }}>
                  {error.name || 'Error'}
                </code>
              </div>
            )}

            {this.state.serverLogs.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <strong style={{ color: '#fbbf24', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                  Server Logs ({this.state.serverLogs.length} entries):
                </strong>
                <div style={{
                  backgroundColor: '#0f172a',
                  padding: '12px',
                  borderRadius: '4px',
                  border: '1px solid #1e293b',
                  maxHeight: '400px',
                  overflow: 'auto'
                }}>
                  {this.state.serverLogs.map((log, index) => (
                    <div
                      key={index}
                      style={{
                        marginBottom: index < this.state.serverLogs.length - 1 ? '8px' : '0',
                        paddingBottom: index < this.state.serverLogs.length - 1 ? '8px' : '0',
                        borderBottom: index < this.state.serverLogs.length - 1 ? '1px solid #1e293b' : 'none',
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

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                this.setState({
                  hasError: false,
                  error: null,
                  errorInfo: null,
                })
                window.location.reload()
              }}
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
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Export as default for easier import
export default ErrorBoundaryClass

