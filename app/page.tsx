import { Suspense } from 'react'
import { loadAirspaceData } from '@/lib/load-airspace-data'
import ErrorBoundary from './components/ErrorBoundary'
import ClientErrorCatcher from './components/ClientErrorCatcher'
import ConsoleLogger from './components/ConsoleLogger'
import PageDebugger from './components/PageDebugger'
import AirspaceMapLoader from './components/AirspaceMapLoader'
import { serverLogger } from '@/lib/server-logger'

async function AirspaceDataLoader() {
  // Load and parse airspace data server-side (returns parsed data, not file contents)
  let airspaceData: any[] = []
  try {
    serverLogger.log('[Server] Starting to load airspace data...')
    console.log('[Server] Starting to load airspace data...')
    
    airspaceData = await loadAirspaceData('ALL')
    
    serverLogger.log(`[Server] Successfully loaded ${airspaceData.length} airspace entries`)
    console.log(`[Server] Successfully loaded ${airspaceData.length} airspace entries`)
    
    if (!Array.isArray(airspaceData)) {
      const error = new Error(`Expected array but got ${typeof airspaceData}`)
      serverLogger.error('[Server] Invalid data type', { type: typeof airspaceData })
      console.error('[Server] Invalid data type:', typeof airspaceData)
      throw error
    }
    
    serverLogger.log('[Server] Data validation passed')
    console.log('[Server] Data validation passed')
  } catch (error: any) {
    serverLogger.error('[Server] ERROR in AirspaceDataLoader', error)
    console.error('[Server] ERROR in AirspaceDataLoader:', error)
    console.error('[Server] Error message:', error?.message)
    console.error('[Server] Error stack:', error?.stack)
    console.error('[Server] Error name:', error?.name)
    console.error('[Server] Error type:', typeof error)
    
    try {
      const errorStr = JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
      serverLogger.error('[Server] Full error object', { error: errorStr })
      console.error('[Server] Full error object:', errorStr)
    } catch (e) {
      serverLogger.error('[Server] Could not stringify error object', e)
      console.error('[Server] Could not stringify error object:', e)
    }
    
    // Re-throw the error with more context
    const enhancedError = new Error(
      `Failed to load airspace data: ${error?.message || 'Unknown error'}`
    )
    if (error?.stack) {
      enhancedError.stack = error.stack
    }
    ;(enhancedError as any).originalError = error
    throw enhancedError
  }

  return airspaceData
}

async function MapWithData() {
  try {
    serverLogger.log('[Server] MapWithData: Starting to load data...')
    console.log('[Server] MapWithData: Starting to load data...')
    
    const airspaceData = await AirspaceDataLoader()
    
    serverLogger.log(`[Server] MapWithData: Data loaded, rendering map with ${airspaceData.length} entries`)
    console.log('[Server] MapWithData: Data loaded, rendering map with', airspaceData.length, 'entries')
    
    return <AirspaceMapLoader initialData={airspaceData} />
  } catch (error: any) {
    serverLogger.error('[Server] MapWithData: Error caught', error)
    console.error('[Server] MapWithData: Error caught:', error)
    throw error
  }
}

export default function Home() {
  serverLogger.log('[Server] Home component rendering')
  console.log('[Server] Home component rendering')
  
  return (
    <ClientErrorCatcher>
      <PageDebugger />
      <main style={{ position: 'relative', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: '#111827' }}>
        <ErrorBoundary>
          <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>Loading map...</div>}>
            <MapWithData />
          </Suspense>
        </ErrorBoundary>
        <ConsoleLogger />
      </main>
    </ClientErrorCatcher>
  )
}
