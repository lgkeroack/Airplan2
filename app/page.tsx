import { Suspense } from 'react'
import { loadAirspaceData } from '@/lib/load-airspace-data'
import ErrorBoundary from './components/ErrorBoundary'
import ClientErrorCatcher from './components/ClientErrorCatcher'
import ConsoleLogger from './components/ConsoleLogger'
import PageDebugger from './components/PageDebugger'
import AirspaceMapLoader from './components/AirspaceMapLoader'
import Walkthrough from './components/Walkthrough'
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
        <Walkthrough />
        <ErrorBoundary>
          <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>Loading map...</div>}>
            <MapWithData />
          </Suspense>
        </ErrorBoundary>
        <ConsoleLogger />

        {/* SEO content — visible to crawlers, positioned off-screen for map UX */}
        <div
          style={{
            position: 'absolute',
            left: '-9999px',
            width: '1px',
            height: '1px',
            overflow: 'hidden',
          }}
          aria-hidden="false"
        >
          <h1>Airplan — Interactive Airspace Visualization for Pilots</h1>
          <p>
            Airplan is a free, interactive airspace visualization tool built for
            pilots, student pilots, and aviation enthusiasts. Explore controlled
            and uncontrolled airspace on a detailed topographic map of the United
            States. Click any location to retrieve the full vertical air column
            — from surface-level Class D and Class C shelves up to Class A
            airspace at FL180 and above.
          </p>
          <h2>Features</h2>
          <ul>
            <li>Click-to-query airspace at any point on the map</li>
            <li>3D air-column visualization showing floor and ceiling altitudes</li>
            <li>Color-coded airspace classes (B, C, D, E, and restricted areas)</li>
            <li>Route planning with terrain profile and airspace intersection warnings</li>
            <li>Topographic base map with elevation data</li>
            <li>Thermal soaring data overlay for glider pilots</li>
          </ul>
          <h2>How It Works</h2>
          <p>
            Airplan parses official FAA airspace definition files and renders
            them as interactive 3D cylinders on a Mapbox-powered topographic
            map. When you click a location, the app queries the airspace
            database and displays a vertical cross-section of every airspace
            layer above that point, helping you understand what clearances or
            communications are required before entering.
          </p>
          <h2>Who Is Airplan For?</h2>
          <p>
            Whether you are a VFR student pilot learning about airspace
            classifications, an instrument-rated pilot planning a cross-country
            route, or a drone operator checking restricted areas, Airplan gives
            you an intuitive, visual way to understand the national airspace
            system.
          </p>
        </div>
      </main>
    </ClientErrorCatcher>
  )
}
