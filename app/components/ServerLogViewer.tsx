'use client'

import { useEffect, useState, useRef } from 'react'

interface LogEntry {
  timestamp: number
  level: string
  message: string
}

export default function ServerLogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [lastTimestamp, setLastTimestamp] = useState(0)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    let retryCount = 0
    const MAX_RETRIES = 3

    const fetchLogs = async () => {
      if (!isMounted) return
      
      try {
        const url = lastTimestamp > 0 
          ? `/api/logs?since=${lastTimestamp}`
          : '/api/logs'
        
        const response = await fetch(url, {
          cache: 'no-store',
          method: 'GET',
        })
        
        if (!response.ok) {
          // If 404, logs endpoint might not be ready yet
          if (response.status === 404) {
            retryCount++
            if (retryCount < MAX_RETRIES) {
              // Retry after a delay
              setTimeout(fetchLogs, 1000)
            }
            return
          }
          // Don't throw for other errors, just log
          if (response.status !== 404) {
            console.warn(`Failed to fetch logs: ${response.status}`)
          }
          return
        }
        
        // Reset retry count on success
        retryCount = 0
        
        const data = await response.json()
        
        if (data && data.logs && Array.isArray(data.logs) && data.logs.length > 0) {
          setLogs(prev => {
            const newLogs = [...prev, ...data.logs]
            // Keep only last 500 logs
            return newLogs.slice(-500)
          })
          
          // Update last timestamp
          const latestTimestamp = Math.max(...data.logs.map((l: LogEntry) => l.timestamp))
          if (latestTimestamp > lastTimestamp) {
            setLastTimestamp(latestTimestamp)
          }
          
          // Scroll to bottom
          setTimeout(() => {
            logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
          }, 100)
        }
      } catch (error) {
        // Silently handle network errors - logs endpoint might not be ready
        if (error instanceof TypeError && error.message.includes('fetch')) {
          retryCount++
          if (retryCount < MAX_RETRIES) {
            setTimeout(fetchLogs, 1000)
          }
          return
        }
        // Only log non-network errors
        if (!(error instanceof TypeError)) {
          console.error('Failed to fetch logs:', error)
        }
      }
    }

    // Fetch immediately
    fetchLogs()
    
    // Then poll every 500ms, but only if we got a successful response
    const interval = setInterval(() => {
      if (isMounted && retryCount < MAX_RETRIES) {
        fetchLogs()
      }
    }, 500)
    
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [isOpen, lastTimestamp])

  // Also output to browser console
  useEffect(() => {
    if (logs.length === 0) return
    
    const latestLog = logs[logs.length - 1]
    const logMessage = `[Server ${new Date(latestLog.timestamp).toLocaleTimeString()}] [${latestLog.level}] ${latestLog.message}`
    
    if (latestLog.level === 'error') {
      console.error(logMessage)
    } else if (latestLog.level === 'warn') {
      console.warn(logMessage)
    } else {
      console.log(logMessage)
    }
  }, [logs])

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          zIndex: 9999,
          padding: '8px 12px',
          backgroundColor: '#1f2937',
          border: '2px solid #374151',
          borderRadius: '4px',
          color: 'white',
          fontSize: '12px',
          cursor: 'pointer',
          fontFamily: "'Times New Roman', Times, serif"
        }}
      >
        Show Server Logs
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      width: '600px',
      maxHeight: '400px',
      backgroundColor: '#1f2937',
      border: '2px solid #374151',
      borderRadius: '8px',
      boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.3)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Times New Roman', Times, serif"
    }}>
      <div style={{
        padding: '12px',
        borderBottom: '1px solid #374151',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, color: 'white', fontSize: '14px', fontWeight: 'bold' }}>
          Server Logs ({logs.length})
        </h3>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '0 8px'
          }}
        >
          ×
        </button>
      </div>
      
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px',
        fontSize: '11px',
        fontFamily: 'monospace',
        backgroundColor: '#0f172a'
      }}>
        {logs.map((log, index) => (
          <div
            key={index}
            style={{
              marginBottom: '4px',
              padding: '4px',
              color: log.level === 'error' ? '#fca5a5' : 
                     log.level === 'warn' ? '#fbbf24' : 
                     '#e5e7eb',
              borderLeft: `3px solid ${
                log.level === 'error' ? '#ef4444' : 
                log.level === 'warn' ? '#f59e0b' : 
                '#3b82f6'
              }`,
              paddingLeft: '8px'
            }}
          >
            <span style={{ color: '#9ca3af' }}>
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            {' '}
            <span style={{ 
              fontWeight: 'bold',
              color: log.level === 'error' ? '#ef4444' : 
                     log.level === 'warn' ? '#f59e0b' : 
                     '#60a5fa'
            }}>
              [{log.level.toUpperCase()}]
            </span>
            {' '}
            {log.message}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  )
}

