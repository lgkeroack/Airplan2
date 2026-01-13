import { readFile, writeFile, stat, mkdir } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'
import { parseOpenAirFile, convertToApiFormat } from './openair-parser'
import { serverLogger } from './server-logger'

// Check if a polygon is valid
function isValidPolygon(polygon: Array<{ latitude: number; longitude: number }> | undefined): boolean {
  if (!polygon || polygon.length < 3) return false

  // Check for invalid coordinates
  for (const p of polygon) {
    if (isNaN(p.latitude) || isNaN(p.longitude)) return false
    if (Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) return false
  }

  // Check for degenerate polygon
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const p of polygon) {
    minLat = Math.min(minLat, p.latitude)
    maxLat = Math.max(maxLat, p.latitude)
    minLon = Math.min(minLon, p.longitude)
    maxLon = Math.max(maxLon, p.longitude)
  }

  const latRange = maxLat - minLat
  const lonRange = maxLon - minLon

  // Polygon must have some area
  if (latRange < 0.0009 && lonRange < 0.0009) return false

  return true
}

// Filter out airspaces with invalid geometry
function filterValidAirspaces(data: AirspaceData[]): AirspaceData[] {
  return data.filter((item) => {
    if (item.polygon) {
      return isValidPolygon(item.polygon)
    }
    if (item.coordinates && item.radius) {
      return true
    }
    // Final fallback: at least coordinates
    return !!item.coordinates
  })
}

// Calculate and add bounding box to airspace for fast viewport filtering
function addAirspaceBounds(data: AirspaceData[]): AirspaceData[] {
  return data.map(item => {
    let north = -90, south = 90, east = -180, west = 180

    if (item.polygon && item.polygon.length > 0) {
      item.polygon.forEach(p => {
        if (p.latitude > north) north = p.latitude
        if (p.latitude < south) south = p.latitude
        if (p.longitude > east) east = p.longitude
        if (p.longitude < west) west = p.longitude
      })
    } else if (item.coordinates && item.radius) {
      // Calculate approximate bounds for circle (1 NM ≈ 0.0166 degrees)
      const latDegree = item.radius * (1 / 60)
      const lonDegree = item.radius * (1 / (60 * Math.cos(item.coordinates.latitude * Math.PI / 180)))
      north = item.coordinates.latitude + latDegree
      south = item.coordinates.latitude - latDegree
      east = item.coordinates.longitude + lonDegree
      west = item.coordinates.longitude - lonDegree
    } else if (item.coordinates) {
      north = south = item.coordinates.latitude
      east = west = item.coordinates.longitude
    }

    return {
      ...item,
      bounds: { north, south, east, west }
    }
  })
}

export interface AirspaceData {
  id: string
  notamNumber: string
  type: string
  location: string
  effectiveStart: string
  effectiveEnd: string
  message: string
  coordinates?: {
    latitude: number
    longitude: number
  }
  radius?: number // in nautical miles
  altitude?: {
    floor: number
    ceiling: number
  }
  polygon?: Array<{ latitude: number; longitude: number }>
  bounds?: {
    north: number
    south: number
    east: number
    west: number
  }
  metadata?: {
    fileName: string
    fileSize: number
    lastModified: string
    source: string
  }
}

// Check if two polygons have nearly identical geometry
function polygonsMatch(
  poly1: Array<{ latitude: number; longitude: number }>,
  poly2: Array<{ latitude: number; longitude: number }>
): boolean {
  if (!poly1 || !poly2 || poly1.length < 3 || poly2.length < 3) return false

  // Polygons must have similar number of points (within 20%)
  const lenDiff = Math.abs(poly1.length - poly2.length)
  const maxLen = Math.max(poly1.length, poly2.length)
  if (lenDiff / maxLen > 0.2) return false

  // Calculate centroids
  const getCentroid = (poly: Array<{ latitude: number; longitude: number }>) => {
    const sumLat = poly.reduce((sum, p) => sum + p.latitude, 0)
    const sumLon = poly.reduce((sum, p) => sum + p.longitude, 0)
    return { lat: sumLat / poly.length, lon: sumLon / poly.length }
  }

  const c1 = getCentroid(poly1)
  const c2 = getCentroid(poly2)

  // Centroids must be very close (within ~0.5 nautical miles / 0.008 degrees)
  const centroidDist = Math.sqrt(
    Math.pow(c1.lat - c2.lat, 2) + Math.pow(c1.lon - c2.lon, 2)
  )
  if (centroidDist > 0.008) return false

  // Calculate bounding boxes
  const getBounds = (poly: Array<{ latitude: number; longitude: number }>) => {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
    for (const p of poly) {
      minLat = Math.min(minLat, p.latitude)
      maxLat = Math.max(maxLat, p.latitude)
      minLon = Math.min(minLon, p.longitude)
      maxLon = Math.max(maxLon, p.longitude)
    }
    return {
      minLat, maxLat, minLon, maxLon,
      width: maxLon - minLon, height: maxLat - minLat
    }
  }

  const b1 = getBounds(poly1)
  const b2 = getBounds(poly2)

  // Bounding boxes must have similar dimensions (within 10%)
  const widthDiff = Math.abs(b1.width - b2.width) / Math.max(b1.width, b2.width, 0.001)
  const heightDiff = Math.abs(b1.height - b2.height) / Math.max(b1.height, b2.height, 0.001)

  return widthDiff < 0.1 && heightDiff < 0.1
}

// Extract route identifier from RNAV route name (e.g., "T601" from "T601 Fixed RNAV Route")
function extractRouteId(name: string): string | null {
  const match = name.match(/([A-Z]\d+)/i)
  return match ? match[1] : null
}

// Get base name pattern for grouping (e.g., "Fixed RNAV Route" from "T601 Fixed RNAV Route")
function getRouteBaseName(name: string): string {
  return name.replace(/[A-Z]\d+\s*/gi, '').trim()
}

// Cache interface for storing consolidation mappings
interface ConsolidationCache {
  dataHash: string
  mappings: Array<{
    ids: string[]
    mergedId: string
    mergedName: string
  }>
  timestamp: number
}

// Calculate hash of data for cache invalidation
function calculateDataHash(data: AirspaceData[]): string {
  const hash = createHash('sha256')
  // Create a stable representation of the data
  const dataStr = JSON.stringify(
    data.map(item => ({
      id: item.id,
      type: item.type,
      notamNumber: item.notamNumber,
      altitude: item.altitude,
      polygonLength: item.polygon?.length || 0,
      hasRadius: item.radius !== undefined
    }))
  )
  hash.update(dataStr)
  return hash.digest('hex')
}

// Load consolidation cache from file
async function loadConsolidationCache(): Promise<ConsolidationCache | null> {
  try {
    const cachePath = join(process.cwd(), '.next', 'consolidation-cache.json')
    const content = await readFile(cachePath, 'utf-8')
    const cache: ConsolidationCache = JSON.parse(content)

    // Check if cache is less than 7 days old
    const cacheAge = Date.now() - cache.timestamp
    if (cacheAge > 7 * 24 * 60 * 60 * 1000) {
      return null // Cache expired
    }

    return cache
  } catch (error) {
    return null // Cache doesn't exist or is invalid
  }
}

// Save consolidation cache to file
async function saveConsolidationCache(cache: ConsolidationCache): Promise<void> {
  try {
    const cachePath = join(process.cwd(), '.next', 'consolidation-cache.json')
    await writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save consolidation cache:', error)
  }
}

// Check if two circles match (same center and radius)
function circlesMatch(
  circle1: { coordinates?: { latitude: number; longitude: number }; radius?: number },
  circle2: { coordinates?: { latitude: number; longitude: number }; radius?: number }
): boolean {
  if (!circle1.coordinates || !circle2.coordinates) return false
  if (circle1.radius === undefined || circle2.radius === undefined) return false

  // Centers must be very close (within ~0.5 nautical miles / 0.008 degrees)
  const centerDist = Math.sqrt(
    Math.pow(circle1.coordinates.latitude - circle2.coordinates.latitude, 2) +
    Math.pow(circle1.coordinates.longitude - circle2.coordinates.longitude, 2)
  )
  if (centerDist > 0.008) return false

  // Radii must be very similar (within 5%)
  const radiusDiff = Math.abs(circle1.radius - circle2.radius) / Math.max(circle1.radius, circle2.radius, 0.1)
  return radiusDiff < 0.05
}

// Check if two airspaces have matching geometry
function airspacesMatch(airspace1: AirspaceData, airspace2: AirspaceData): boolean {
  // Both must have same altitude range
  const alt1 = airspace1.altitude
  const alt2 = airspace2.altitude
  if (alt1?.floor !== alt2?.floor || alt1?.ceiling !== alt2?.ceiling) {
    return false
  }

  // Check polygon matching
  if (airspace1.polygon && airspace2.polygon) {
    return polygonsMatch(airspace1.polygon, airspace2.polygon)
  }

  // Check circle matching
  if (airspace1.coordinates && airspace1.radius !== undefined &&
    airspace2.coordinates && airspace2.radius !== undefined) {
    return circlesMatch(airspace1, airspace2)
  }

  return false
}

// Consolidate all similar/duplicate airspaces (not just RNAV routes)
export async function consolidateSimilarAirspaces(data: AirspaceData[]): Promise<AirspaceData[]> {
  if (data.length === 0) return data

  serverLogger.log(`Consolidating similar airspaces from ${data.length} entries...`)
  console.log(`Consolidating similar airspaces from ${data.length} entries...`)

  // Group airspaces by type and altitude for efficient matching
  const groups: Map<string, AirspaceData[]> = new Map()

  for (const item of data) {
    const altKey = `${item.altitude?.floor || 0}-${item.altitude?.ceiling || 0}`
    const key = `${item.type}|${altKey}`

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(item)
  }

  const consolidated: AirspaceData[] = []
  let totalMerged = 0

  // Process each group
  for (const [key, group] of groups) {
    if (group.length === 1) {
      consolidated.push(group[0])
      continue
    }

    // Find matching airspaces within this group
    const processed = new Set<number>()

    for (let i = 0; i < group.length; i++) {
      if (processed.has(i)) continue

      const cluster: AirspaceData[] = [group[i]]
      processed.add(i)

      // Find all airspaces with matching geometry
      let foundNew = true
      while (foundNew) {
        foundNew = false
        for (let j = 0; j < group.length; j++) {
          if (processed.has(j)) continue

          // Check if this airspace matches any in the cluster
          for (const clusterAirspace of cluster) {
            if (airspacesMatch(clusterAirspace, group[j])) {
              cluster.push(group[j])
              processed.add(j)
              foundNew = true
              break
            }
          }
        }
      }

      if (cluster.length === 1) {
        consolidated.push(cluster[0])
      } else {
        // Merge multiple matching airspaces
        totalMerged += cluster.length - 1

        // Combine names
        const names = cluster.map(a => a.notamNumber || a.location).filter((n, i, arr) => arr.indexOf(n) === i)
        const mergedName = names.length > 1
          ? `${cluster[0].type}: ${names.join(', ')}`
          : names[0] || cluster[0].notamNumber || cluster[0].location

        const merged: AirspaceData = {
          ...cluster[0],
          id: `merged-${cluster.map(a => a.id).join('-').substring(0, 100)}`,
          notamNumber: mergedName,
          location: mergedName,
          message: `${cluster[0].type}: ${mergedName} (${cluster[0].altitude?.floor || 0} to ${cluster[0].altitude?.ceiling || 18000} ft) - ${cluster.length} airspaces merged`,
        }

        consolidated.push(merged)
      }
    }
  }

  serverLogger.log(`Consolidated ${data.length} airspaces into ${consolidated.length} (merged ${totalMerged} duplicates)`)
  console.log(`Consolidated ${data.length} airspaces into ${consolidated.length} (merged ${totalMerged} duplicates)`)

  return consolidated
}

// Consolidate overlapping RNAV routes with similar names
async function consolidateRnavRoutes(data: AirspaceData[]): Promise<AirspaceData[]> {
  const rnavPattern = /RNAV|Fixed.*Route|T\d{3}|Q\d{3}|V\d{3}|J\d{3}/i

  // Separate RNAV routes from other airspaces
  const rnavRoutes: AirspaceData[] = []
  const otherAirspaces: AirspaceData[] = []

  for (const item of data) {
    if (rnavPattern.test(item.notamNumber) || rnavPattern.test(item.location)) {
      rnavRoutes.push(item)
    } else {
      otherAirspaces.push(item)
    }
  }

  if (rnavRoutes.length === 0) {
    return data
  }

  // Calculate data hash for cache validation
  const dataHash = calculateDataHash(rnavRoutes)

  // Try to load from cache
  const cache = await loadConsolidationCache()
  const useCache = cache && cache.dataHash === dataHash

  if (useCache) {
    serverLogger.log(`Using cached consolidation mappings (${cache!.mappings.length} groups)`)
    console.log(`Using cached consolidation mappings (${cache!.mappings.length} groups)`)

    // Apply cached mappings
    const idToItem = new Map<string, AirspaceData>()
    rnavRoutes.forEach(route => idToItem.set(route.id, route))

    const consolidatedRoutes: AirspaceData[] = []
    const processedIds = new Set<string>()

    for (const mapping of cache!.mappings) {
      const routes = mapping.ids.map(id => idToItem.get(id)).filter((r): r is AirspaceData => r !== undefined)

      if (routes.length === 0) continue

      routes.forEach(r => processedIds.add(r.id))

      if (routes.length === 1) {
        consolidatedRoutes.push(routes[0])
      } else {
        const routeIds = routes
          .map(r => extractRouteId(r.notamNumber))
          .filter((id): id is string => id !== null)
          .sort()

        const baseName = getRouteBaseName(routes[0].notamNumber)
        const combinedName = routeIds.length > 0
          ? `${routes[0].type} ${routeIds.join(', ')} ${baseName}`
          : mapping.mergedName

        const merged: AirspaceData = {
          ...routes[0],
          id: mapping.mergedId,
          notamNumber: combinedName,
          location: combinedName,
          message: `${routes[0].type}: ${combinedName} (${routes[0].altitude?.floor || 0} to ${routes[0].altitude?.ceiling || 18000} ft) - ${routes.length} routes merged`,
        }

        consolidatedRoutes.push(merged)
      }
    }

    // Add any routes not in cache (shouldn't happen, but just in case)
    rnavRoutes.forEach(route => {
      if (!processedIds.has(route.id)) {
        consolidatedRoutes.push(route)
      }
    })

    serverLogger.log(`Consolidated ${rnavRoutes.length} RNAV routes into ${consolidatedRoutes.length} (from cache)`)
    console.log(`Consolidated ${rnavRoutes.length} RNAV routes into ${consolidatedRoutes.length} (from cache)`)
    return [...otherAirspaces, ...consolidatedRoutes]
  }

  // Perform expensive geometry matching (not cached)
  serverLogger.log('Performing geometry matching for RNAV consolidation (this may take a moment)...')
  console.log('Performing geometry matching for RNAV consolidation (this may take a moment)...')

  // Group RNAV routes by type, altitude, and base name
  const groups: Map<string, AirspaceData[]> = new Map()

  for (const route of rnavRoutes) {
    const baseName = getRouteBaseName(route.notamNumber)
    const altKey = `${route.altitude?.floor || 0}-${route.altitude?.ceiling || 0}`
    const key = `${route.type}|${altKey}|${baseName}`

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(route)
  }

  // Consolidate each group with geometry matching
  const consolidatedRoutes: AirspaceData[] = []
  const cacheMappings: ConsolidationCache['mappings'] = []

  for (const [key, routes] of groups) {
    if (routes.length === 1) {
      consolidatedRoutes.push(routes[0])
      continue
    }

    // Find overlapping routes within this group using geometry matching
    const processed = new Set<number>()

    for (let i = 0; i < routes.length; i++) {
      if (processed.has(i)) continue

      const cluster: AirspaceData[] = [routes[i]]
      processed.add(i)

      // Find all routes that have matching geometry with any in the cluster
      let foundNew = true
      while (foundNew) {
        foundNew = false
        for (let j = 0; j < routes.length; j++) {
          if (processed.has(j)) continue

          // Check if this route has matching geometry with any in the cluster
          for (const clusterRoute of cluster) {
            const clusterPolygon = clusterRoute.polygon
            const routePolygon = routes[j].polygon
            if (clusterPolygon && routePolygon &&
              polygonsMatch(clusterPolygon, routePolygon)) {
              cluster.push(routes[j])
              processed.add(j)
              foundNew = true
              break
            }
          }
        }
      }

      if (cluster.length === 1) {
        consolidatedRoutes.push(cluster[0])
      } else {
        const routeIds = cluster
          .map(r => extractRouteId(r.notamNumber))
          .filter((id): id is string => id !== null)
          .sort()

        const baseName = getRouteBaseName(cluster[0].notamNumber)
        const combinedName = routeIds.length > 0
          ? `${cluster[0].type} ${routeIds.join(', ')} ${baseName}`
          : cluster[0].notamNumber

        const mergedId = `merged-${cluster.map(r => r.id).join('-').substring(0, 100)}`
        const merged: AirspaceData = {
          ...cluster[0],
          id: mergedId,
          notamNumber: combinedName,
          location: combinedName,
          message: `${cluster[0].type}: ${combinedName} (${cluster[0].altitude?.floor || 0} to ${cluster[0].altitude?.ceiling || 18000} ft) - ${cluster.length} routes merged`,
        }

        consolidatedRoutes.push(merged)

        // Save mapping for cache
        cacheMappings.push({
          ids: cluster.map(r => r.id),
          mergedId,
          mergedName: combinedName
        })
      }
    }
  }

  // Save cache
  await saveConsolidationCache({
    dataHash,
    mappings: cacheMappings,
    timestamp: Date.now()
  })

  serverLogger.log(`Consolidated ${rnavRoutes.length} RNAV routes into ${consolidatedRoutes.length} (cache saved)`)
  console.log(`Consolidated ${rnavRoutes.length} RNAV routes into ${consolidatedRoutes.length} (cache saved)`)

  return [...otherAirspaces, ...consolidatedRoutes]
}

// Get cache directory path
function getCacheDir(): string {
  return join(process.cwd(), 'data', 'cache')
}

// Ensure cache directory exists
async function ensureCacheDir(): Promise<void> {
  const cacheDir = getCacheDir()
  try {
    await mkdir(cacheDir, { recursive: true })
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error
    }
  }
}

// Calculate hash of source files for cache invalidation
async function calculateSourceHash(): Promise<string> {
  const hash = createHash('sha256')

  try {
    // Hash US file
    const usFilePath = join(process.cwd(), 'data', 'allusa.txt')
    const usContent = await readFile(usFilePath, 'utf-8')
    hash.update('US:')
    hash.update(usContent)
  } catch (error) {
    hash.update('US:missing')
  }

  try {
    // Hash Canadian file (fetch and hash)
    const response = await fetch(
      'https://soaringweb.org/Airspace/NA/CanAirspace318nolowE.txt',
      {
        headers: { 'User-Agent': 'TopographicAirspaceApp/1.0' },
      }
    )
    if (response.ok) {
      const caContent = await response.text()
      hash.update('CA:')
      hash.update(caContent)
    } else {
      hash.update('CA:missing')
    }
  } catch (error) {
    hash.update('CA:missing')
  }

  return hash.digest('hex')
}

// Get path for concatenated base data file
function getConcatenatedBasePath(): string {
  return join(getCacheDir(), 'base-airspace-concatenated.json')
}

// Get path for source hash file
function getSourceHashPath(): string {
  return join(getCacheDir(), 'base-source-hash.txt')
}

// Save concatenated data to file
async function saveConcatenatedData(data: AirspaceData[], sourceHash: string): Promise<void> {
  await ensureCacheDir()
  const dataPath = getConcatenatedBasePath()
  const hashPath = getSourceHashPath()

  await writeFile(dataPath, JSON.stringify(data, null, 2), 'utf-8')
  await writeFile(hashPath, sourceHash, 'utf-8')

  serverLogger.log(`Saved concatenated data to ${dataPath} (${data.length} entries)`)
  console.log(`Saved concatenated data to ${dataPath} (${data.length} entries)`)
}

// Load concatenated data from file
async function loadConcatenatedData(): Promise<AirspaceData[] | null> {
  try {
    const dataPath = getConcatenatedBasePath()
    const hashPath = getSourceHashPath()

    // Check if files exist
    try {
      await stat(dataPath)
      await stat(hashPath)
    } catch {
      return null // Files don't exist
    }

    // Verify source hash matches
    const savedHash = await readFile(hashPath, 'utf-8')
    const currentHash = await calculateSourceHash()

    if (savedHash.trim() !== currentHash) {
      serverLogger.log('Source files changed, will regenerate concatenated data')
      console.log('Source files changed, will regenerate concatenated data')
      return null // Source files changed
    }

    // Load and return concatenated data
    const content = await readFile(dataPath, 'utf-8')
    const data = JSON.parse(content) as AirspaceData[]

    serverLogger.log(`Loaded concatenated data from cache (${data.length} entries)`)
    console.log(`Loaded concatenated data from cache (${data.length} entries)`)
    return data
  } catch (error: any) {
    serverLogger.error('Error loading concatenated data', error)
    console.error('Error loading concatenated data:', error)
    return null
  }
}

// Process and concatenate base airspace data (one-time operation)
async function processBaseAirspaceData(): Promise<AirspaceData[]> {
  let allData: AirspaceData[] = []

  serverLogger.log('Processing base airspace data (US + Canadian)...')
  console.log('Processing base airspace data (US + Canadian)...')

  // Load raw data
  serverLogger.log('Loading US airspace data...')
  const usData = await loadUSAirspace()
  serverLogger.log(`Loaded ${usData.length} US airspace entries`)
  console.log(`Loaded ${usData.length} US airspace entries`)
  allData = [...allData, ...usData]

  serverLogger.log('Loading Canadian airspace data...')
  const caData = await loadCanadianAirspace()
  serverLogger.log(`Loaded ${caData.length} Canadian airspace entries`)
  console.log(`Loaded ${caData.length} Canadian airspace entries`)
  allData = [...allData, ...caData]

  serverLogger.log(`Total airspace entries before filtering: ${allData.length}`)
  console.log(`Total airspace entries before filtering: ${allData.length}`)

  // Filter out invalid geometry
  serverLogger.log('Filtering invalid geometry...')
  allData = filterValidAirspaces(allData)

  serverLogger.log(`Total airspace entries after filtering: ${allData.length}`)
  console.log(`Total airspace entries after filtering: ${allData.length}`)

  // Add bounding boxes
  serverLogger.log('Adding bounding boxes for fast filtering...')
  allData = addAirspaceBounds(allData)

  // Consolidate overlapping RNAV routes with matching geometry, altitude, and class
  serverLogger.log('Consolidating RNAV routes (this may take a moment)...')
  console.log('Consolidating RNAV routes (this may take a moment)...')
  allData = await consolidateRnavRoutes(allData)

  serverLogger.log(`Total airspace entries after consolidation: ${allData.length}`)
  console.log(`Total airspace entries after consolidation: ${allData.length}`)

  return allData
}

// Load Canadian airspace data from URL (server-side only)
async function loadCanadianAirspace(): Promise<AirspaceData[]> {
  try {
    const response = await fetch(
      'https://soaringweb.org/Airspace/NA/CanAirspace318nolowE.txt',
      {
        headers: {
          'User-Agent': 'TopographicAirspaceApp/1.0',
        },
      }
    )

    if (!response.ok) {
      console.error(`Failed to fetch Canadian airspace file: ${response.status} ${response.statusText}`)
      return []
    }

    const content = await response.text()
    const parsed = parseOpenAirFile(content, 'CA')
    const converted = convertToApiFormat(parsed, 'CA')

    return converted
  } catch (error: any) {
    console.error('Error fetching Canadian airspace:', error)
    return []
  }
}

// Load US airspace data from local file (server-side only)
async function loadUSAirspace(): Promise<AirspaceData[]> {
  try {
    const filePath = join(process.cwd(), 'data', 'allusa.txt')
    const content = await readFile(filePath, 'utf-8')
    const parsed = parseOpenAirFile(content, 'US')
    const converted = convertToApiFormat(parsed, 'US')

    return converted
  } catch (error: any) {
    console.error('Error reading US airspace file:', error)
    return []
  }
}

// Load all airspace data (server-side only)
export async function loadAirspaceData(country: 'US' | 'CA' | 'ALL' = 'ALL'): Promise<AirspaceData[]> {
  try {
    // Collect metadata for built-in files
    const usFilePath = join(process.cwd(), 'data', 'allusa.txt')
    const usStats = await stat(usFilePath).catch(() => null)

    // Check if concatenated data exists
    const cachedData = await loadConcatenatedData()

    if (cachedData) {
      serverLogger.log('Using cached concatenated base airspace data')
      console.log('Using cached concatenated base airspace data')

      // Inject current metadata into cached data since stats might change
      return cachedData.map(item => {
        if (item.id.startsWith('US-')) {
          return {
            ...item,
            metadata: {
              fileName: 'allusa.txt',
              fileSize: usStats?.size || 0,
              lastModified: usStats?.mtime.toISOString() || new Date().toISOString(),
              source: 'Built-in (US)'
            }
          }
        }
        if (item.id.startsWith('CA-')) {
          // Canada is remote, we don't have easy stat, use a fallback
          return {
            ...item,
            metadata: {
              fileName: 'CanAirspace318nolowE.txt',
              fileSize: 0, // Remote size unknown without HEAD request
              lastModified: new Date().toISOString(),
              source: 'Built-in (CA)'
            }
          }
        }
        return item
      })
    }

    // Process and save concatenated data
    serverLogger.log('Concatenated data not found or outdated, processing...')
    console.log('Concatenated data not found or outdated, processing...')
    const processedData = await processBaseAirspaceData()

    // Add metadata
    const dataWithMetadata = processedData.map(item => {
      if (item.id.startsWith('US-')) {
        return {
          ...item,
          metadata: {
            fileName: 'allusa.txt',
            fileSize: usStats?.size || 0,
            lastModified: usStats?.mtime.toISOString() || new Date().toISOString(),
            source: 'Built-in (US)'
          }
        }
      }
      if (item.id.startsWith('CA-')) {
        return {
          ...item,
          metadata: {
            fileName: 'CanAirspace318nolowE.txt',
            fileSize: 0,
            lastModified: new Date().toISOString(),
            source: 'Built-in (CA)'
          }
        }
      }
      return item
    })

    // Save for future use
    const sourceHash = await calculateSourceHash()
    await saveConcatenatedData(dataWithMetadata, sourceHash)

    serverLogger.log('Base airspace data concatenated and saved')
    console.log('Base airspace data concatenated and saved')
    return dataWithMetadata
  } catch (error: any) {
    serverLogger.error('Error loading airspace data', error)
    console.error('Error loading airspace data:', error)
    return []
  }
}

// Process and save uploaded file data (one-time per file)
export async function processUploadedFile(
  content: string,
  fileName: string
): Promise<AirspaceData[]> {
  const fileHash = createHash('sha256').update(content).digest('hex')
  const cachePath = join(getCacheDir(), `uploaded-${fileHash}.json`)
  const fileSize = Buffer.byteLength(content, 'utf-8')
  const uploadDate = new Date().toISOString()

  // Check if already processed
  try {
    const s = await stat(cachePath)
    serverLogger.log(`Loading cached processed data for ${fileName}`)
    console.log(`Loading cached processed data for ${fileName}`)
    const cached = await readFile(cachePath, 'utf-8')
    const data = JSON.parse(cached) as AirspaceData[]
    serverLogger.log(`Loaded ${data.length} entries from cache for ${fileName}`)

    // Inject current metadata
    return data.map(item => ({
      ...item,
      metadata: {
        fileName,
        fileSize,
        lastModified: uploadDate,
        source: 'User Upload'
      }
    }))
  } catch {
    // File doesn't exist or error, process below
  }

  serverLogger.log(`Processing uploaded file: ${fileName}`)
  console.log(`Processing uploaded file: ${fileName}`)

  // Parse and convert
  const parsed = parseOpenAirFile(content, 'USER')
  let converted = convertToApiFormat(parsed, 'USER')

  serverLogger.log(`Parsed ${converted.length} entries from ${fileName}`)

  // Filter invalid geometry
  converted = filterValidAirspaces(converted)

  serverLogger.log(`After filtering: ${converted.length} entries`)

  // Consolidate all similar/duplicate airspaces (simplifies the file)
  converted = await consolidateSimilarAirspaces(converted)

  serverLogger.log(`After consolidation: ${converted.length} entries (simplified)`)

  // Add metadata
  const withMetadata = converted.map(item => ({
    ...item,
    metadata: {
      fileName,
      fileSize,
      lastModified: uploadDate,
      source: 'User Upload'
    }
  }))

  // Save processed data
  await ensureCacheDir()
  await writeFile(cachePath, JSON.stringify(withMetadata, null, 2), 'utf-8')

  serverLogger.log(`Saved processed data for ${fileName} (${withMetadata.length} entries)`)
  console.log(`Saved processed data for ${fileName} (${withMetadata.length} entries)`)

  return withMetadata
}

