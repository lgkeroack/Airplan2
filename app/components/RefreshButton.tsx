'use client'

import { useState } from 'react'

interface RefreshButtonProps {
  onRefresh: () => Promise<void>
  disabled?: boolean
}

export default function RefreshButton({ onRefresh, disabled = false }: RefreshButtonProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true)
      setRefreshError(null)
      
      // Call the update API endpoint
      const response = await fetch('/api/airspace/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sources: ['FAA', 'TFR', 'CANADA']
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        setLastRefresh(new Date())
        // Trigger data refresh in parent component
        await onRefresh()
      } else {
        setRefreshError(result.message || 'Failed to update airspace data')
        console.error('Refresh errors:', result.errors)
      }
    } catch (error: any) {
      setRefreshError(`Error: ${error.message}`)
      console.error('Error refreshing data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '4px'
    }}>
      <button
        onClick={handleRefresh}
        disabled={disabled || isRefreshing}
        style={{
          padding: '8px 16px',
          backgroundColor: isRefreshing ? '#9ca3af' : '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: disabled || isRefreshing ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          if (!disabled && !isRefreshing) {
            e.currentTarget.style.backgroundColor = '#2563eb'
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !isRefreshing) {
            e.currentTarget.style.backgroundColor = '#3b82f6'
          }
        }}
      >
        {isRefreshing ? (
          <>
            <span style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: 'white',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite'
            }}></span>
            Updating...
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Refresh Data
          </>
        )}
      </button>
      {lastRefresh && !refreshError && (
        <div style={{
          fontSize: '11px',
          color: '#6b7280',
          textAlign: 'right'
        }}>
          Last updated: {lastRefresh.toLocaleTimeString()}
        </div>
      )}
      {refreshError && (
        <div style={{
          fontSize: '11px',
          color: '#dc2626',
          textAlign: 'right',
          maxWidth: '200px'
        }}>
          {refreshError}
        </div>
      )}
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

