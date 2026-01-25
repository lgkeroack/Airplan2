'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Loading from '../loading'
import type { AirspaceData } from '@/lib/types'
import { clientLogger } from '@/lib/client-logger'

// Dynamically import the map component to disable SSR (Leaflet requires browser APIs)
const AirspaceMap = dynamic(() => import('./AirspaceMap'), {
  ssr: false,
  loading: () => <Loading />
})

export default function MapWrapper() {
  const [airspaceData, setAirspaceData] = useState<AirspaceData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    clientLogger.info('MapWrapper', 'Component mounted')
    clientLogger.debug('MapWrapper', 'Initial state', { isLoading, error: error || null, dataCount: airspaceData.length })
    
    return () => {
      clientLogger.info('MapWrapper', 'Component unmounting')
    }
  }, [])

  useEffect(() => {
    async function loadData() {
      const startTime = Date.now()
      try {
        clientLogger.info('MapWrapper', 'Starting to load airspace data from API')
        clientLogger.debug('MapWrapper', 'Fetch request initiated', { url: '/api/airspace-data', cache: 'no-store' })
        
        setIsLoading(true)
        setError(null)

        const response = await fetch('/api/airspace-data', {
          cache: 'no-store'
        })

        const fetchTime = Date.now() - startTime
        clientLogger.info('MapWrapper', 'API response received', { 
          status: response.status, 
          statusText: response.statusText,
          fetchTime: `${fetchTime}ms`,
          ok: response.ok 
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unable to read error response')
          clientLogger.error('MapWrapper', 'API request failed', { 
            status: response.status, 
            statusText: response.statusText,
            errorText 
          })
          throw new Error(`Failed to load airspace data: ${response.status} ${response.statusText}`)
        }

        const parseStart = Date.now()
        const data = await response.json()
        const parseTime = Date.now() - parseStart
        
        clientLogger.info('MapWrapper', 'Data parsed successfully', { 
          entryCount: data.length,
          parseTime: `${parseTime}ms`,
          totalTime: `${Date.now() - startTime}ms`
        })
        
        if (!Array.isArray(data)) {
          clientLogger.error('MapWrapper', 'Invalid data type received', { 
            expected: 'array', 
            received: typeof data,
            data: data 
          })
          throw new Error(`Expected array but got ${typeof data}`)
        }

        clientLogger.debug('MapWrapper', 'Setting airspace data', { count: data.length })
        setAirspaceData(data)
        setIsLoading(false)
        
        clientLogger.info('MapWrapper', 'Data loading completed successfully', { 
          totalTime: `${Date.now() - startTime}ms`,
          entryCount: data.length 
        })
      } catch (err: any) {
        const errorTime = Date.now() - startTime
        clientLogger.error('MapWrapper', 'Error loading airspace data', err)
        clientLogger.error('MapWrapper', 'Error details', {
          message: err?.message,
          stack: err?.stack,
          name: err?.name,
          time: `${errorTime}ms`
        })
        
        setError(err?.message || 'Failed to load airspace data')
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  useEffect(() => {
    if (isLoading) {
      clientLogger.debug('MapWrapper', 'Loading state changed', { isLoading: true })
    }
  }, [isLoading])

  useEffect(() => {
    if (error) {
      clientLogger.warn('MapWrapper', 'Error state set', { error })
    }
  }, [error])

  useEffect(() => {
    if (airspaceData.length > 0 && !isLoading) {
      clientLogger.info('MapWrapper', 'Airspace data ready', { count: airspaceData.length })
    }
  }, [airspaceData, isLoading])

  if (isLoading) {
    clientLogger.debug('MapWrapper', 'Rendering loading state')
    return <Loading />
  }

  if (error) {
    clientLogger.warn('MapWrapper', 'Rendering error state', { error })
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#111827',
        color: 'white',
        fontFamily: 'monospace',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <h1 style={{ color: '#ef4444' }}>Error Loading Airspace Data</h1>
        <p>{error}</p>
        <button
          onClick={() => {
            clientLogger.info('MapWrapper', 'Reload button clicked')
            window.location.reload()
          }}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Reload Page
        </button>
      </div>
    )
  }

  clientLogger.info('MapWrapper', 'Rendering AirspaceMap component', { dataCount: airspaceData.length })
  return <AirspaceMap initialData={airspaceData} />
}
