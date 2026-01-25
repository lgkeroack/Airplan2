import { NextResponse } from 'next/server'
import { loadAirspaceData } from '@/lib/load-airspace-data'
import { serverLogger } from '@/lib/server-logger'

// Mark route as dynamic
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const startTime = Date.now()
  const requestId = Math.random().toString(36).substring(7)
  
  try {
    const url = new URL(request.url)
    const userAgent = request.headers.get('user-agent') || 'unknown'
    const referer = request.headers.get('referer') || 'unknown'
    
    serverLogger.log(`[API] [${requestId}] /api/airspace-data: Request received`)
    serverLogger.log(`[API] [${requestId}] Request details`, {
      method: 'GET',
      url: url.toString(),
      userAgent,
      referer,
      timestamp: new Date().toISOString()
    })
    console.log(`[API] [${requestId}] /api/airspace-data: Starting to load airspace data...`)
    
    const loadStart = Date.now()
    const airspaceData = await loadAirspaceData('ALL')
    const loadTime = Date.now() - loadStart
    
    serverLogger.log(`[API] [${requestId}] Successfully loaded ${airspaceData.length} airspace entries in ${loadTime}ms`)
    console.log(`[API] [${requestId}] Successfully loaded ${airspaceData.length} airspace entries`)
    
    if (!Array.isArray(airspaceData)) {
      const error = new Error(`Expected array but got ${typeof airspaceData}`)
      serverLogger.error(`[API] [${requestId}] Invalid data type`, { type: typeof airspaceData })
      console.error(`[API] [${requestId}] Invalid data type:`, typeof airspaceData)
      return NextResponse.json(
        { error: 'Invalid data type returned from loadAirspaceData' },
        { status: 500 }
      )
    }
    
    serverLogger.log(`[API] [${requestId}] Data validation passed`)
    console.log(`[API] [${requestId}] Data validation passed`)
    
    const serializeStart = Date.now()
    const response = NextResponse.json(airspaceData, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Request-ID': requestId,
        'X-Response-Time': `${Date.now() - startTime}ms`,
        'X-Data-Count': airspaceData.length.toString()
      },
    })
    const serializeTime = Date.now() - serializeStart
    const totalTime = Date.now() - startTime
    
    serverLogger.log(`[API] [${requestId}] Response prepared`, {
      dataCount: airspaceData.length,
      serializeTime: `${serializeTime}ms`,
      totalTime: `${totalTime}ms`,
      loadTime: `${loadTime}ms`
    })
    console.log(`[API] [${requestId}] Response sent in ${totalTime}ms (load: ${loadTime}ms, serialize: ${serializeTime}ms)`)
    
    return response
  } catch (error: any) {
    const errorTime = Date.now() - startTime
    serverLogger.error(`[API] [${requestId}] ERROR`, error)
    serverLogger.error(`[API] [${requestId}] Error details`, {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      time: `${errorTime}ms`
    })
    console.error(`[API] [${requestId}] ERROR:`, error)
    console.error(`[API] [${requestId}] Error message:`, error?.message)
    console.error(`[API] [${requestId}] Error stack:`, error?.stack)
    
    return NextResponse.json(
      { 
        error: 'Failed to load airspace data',
        message: error?.message || 'Unknown error',
        requestId
      },
      { 
        status: 500,
        headers: {
          'X-Request-ID': requestId,
          'X-Response-Time': `${errorTime}ms`
        }
      }
    )
  }
}
