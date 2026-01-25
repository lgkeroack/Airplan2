import { NextResponse } from 'next/server'
import { serverLogger } from '@/lib/server-logger'

export const dynamic = 'force-dynamic'

// Batch points into smaller chunks to avoid URL length limits
const BATCH_SIZE = 50  // Reasonable batch size for Open-Elevation API

// Fetch elevation data from Open-Elevation API
// https://open-elevation.com/
async function fetchElevationFromAPI(points: Array<{ lat: number; lon: number }>) {
  try {
    // Process in batches to avoid 414 Request-URI Too Large errors
    const batches: Array<Array<{ lat: number; lon: number }>> = []
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      batches.push(points.slice(i, i + BATCH_SIZE))
    }

    console.log(`[Elevation API] Processing ${points.length} points in ${batches.length} batches`)
    
    const allResults: Array<{ elevation: number | null }> = []
    
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx]
      const locationsString = batch
        .map(p => `${p.lat},${p.lon}`)
        .join('|')

      const url = `https://api.open-elevation.com/api/v1/lookup?locations=${locationsString}`
      
      // Add delay between batches to avoid rate limiting
      if (batchIdx > 0) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      
      let retries = 2
      let success = false
      
      while (retries > 0 && !success) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 15000)
          
          const response = await fetch(url, {
            signal: controller.signal
          })
          clearTimeout(timeoutId)
          
          if (response.status === 429) {
            // Rate limited - wait and retry
            console.warn(`[Elevation API] Rate limited on batch ${batchIdx}, waiting 1s before retry...`)
            retries--
            await new Promise(resolve => setTimeout(resolve, 1000))
            continue
          }
          
          if (!response.ok) {
            console.error(`Open-Elevation API error: ${response.status} ${response.statusText} for batch ${batchIdx} with ${batch.length} points`)
            // Return nulls for this batch on failure
            allResults.push(...batch.map(() => ({ elevation: null })))
            success = true
            continue
          }

          const data = await response.json()
          if (data.results && Array.isArray(data.results)) {
            // Log sample results from this batch to verify data
            if (batchIdx === 0) {
              const samples = data.results.slice(0, 3).map((r: any, i: number) => 
                `(${batch[i].lat.toFixed(4)}, ${batch[i].lon.toFixed(4)}) = ${r.elevation}m`
              )
              console.log(`[Elevation API] Batch 0 samples:`, samples.join(', '))
            }
            allResults.push(...data.results.map((r: any) => ({ elevation: r.elevation ?? null })))
            success = true
          } else {
            console.error(`[Elevation API] Unexpected response format for batch ${batchIdx}:`, data)
            allResults.push(...batch.map(() => ({ elevation: null })))
            success = true
          }
        } catch (batchError) {
          console.error(`Error fetching batch ${batchIdx}: ${batchError}`)
          retries--
          if (retries === 0) {
            allResults.push(...batch.map(() => ({ elevation: null })))
          } else {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }
      }
    }
    
    // Summary stats
    const validCount = allResults.filter(r => r.elevation !== null).length
    const elevations = allResults.filter(r => r.elevation !== null).map(r => r.elevation as number)
    const minElev = elevations.length > 0 ? Math.min(...elevations) : null
    const maxElev = elevations.length > 0 ? Math.max(...elevations) : null
    console.log(`[Elevation API] Results: ${validCount}/${allResults.length} valid, range: ${minElev}m to ${maxElev}m`)
    
    return allResults
  } catch (error) {
    console.error('Failed to fetch elevation from Open-Elevation API:', error)
    return null
  }
}

export async function POST(request: Request) {
  const startTime = Date.now()
  const requestId = Math.random().toString(36).substring(7)

  try {
    const body = await request.json()
    const { points } = body

    if (!Array.isArray(points)) {
      return NextResponse.json(
        { error: 'Invalid request: points must be an array' },
        { status: 400 }
      )
    }

    if (points.length === 0) {
      return NextResponse.json({ results: [] })
    }

    // Validate points have lat/lon
    for (const point of points) {
      if (typeof point.lat !== 'number' || typeof point.lon !== 'number') {
        return NextResponse.json(
          { error: 'Invalid point format: each point must have lat and lon' },
          { status: 400 }
        )
      }
    }

    serverLogger.log(`[API] [${requestId}] /api/elevation: Fetching elevation for ${points.length} points`)

    // Fetch elevation data
    const results = await fetchElevationFromAPI(points)

    if (!results) {
      serverLogger.log(`[API] [${requestId}] Elevation fetch failed`)
      return NextResponse.json({
        results: points.map(() => ({ elevation: null }))
      })
    }

    serverLogger.log(`[API] [${requestId}] Successfully fetched elevation for ${results.length} points`)

    return NextResponse.json({
      results: results
    })
  } catch (error: any) {
    const errorTime = Date.now() - startTime
    serverLogger.error(`[API] [${requestId}] /api/elevation ERROR`, error)
    console.error(`[API] [${requestId}] /api/elevation ERROR:`, error)

    return NextResponse.json(
      {
        error: 'Failed to fetch elevation data',
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

