'use client'

import { useEffect } from 'react'

// Component that fetches server logs and outputs them to browser console
export default function ConsoleLogger() {
  useEffect(() => {
    let lastTimestamp = 0
    let isMounted = true

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
          // Silently handle 404s - endpoint might not be ready
          if (response.status === 404) {
            return
          }
          return
        }
        
        const data = await response.json()
        
        if (data && data.logs && Array.isArray(data.logs) && data.logs.length > 0) {
          // Output each log to console
          data.logs.forEach((log: { timestamp: number; level: string; message: string }) => {
            const logMessage = `[Server ${new Date(log.timestamp).toLocaleTimeString()}] [${log.level}] ${log.message}`
            
            if (log.level === 'error') {
              console.error(logMessage)
            } else if (log.level === 'warn') {
              console.warn(logMessage)
            } else {
              console.log(logMessage)
            }
          })
          
          // Update last timestamp
          const latestTimestamp = Math.max(...data.logs.map((l: { timestamp: number }) => l.timestamp))
          if (latestTimestamp > lastTimestamp) {
            lastTimestamp = latestTimestamp
          }
        }
      } catch (error) {
        // Silently handle errors - endpoint might not be ready
      }
    }

    // Poll every 500ms for new logs
    const interval = setInterval(fetchLogs, 500)
    
    // Initial fetch
    fetchLogs()
    
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  return null // This component doesn't render anything
}

