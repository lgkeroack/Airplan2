import { serverLogger } from './server-logger'
import { createHash } from 'crypto'

import { AirspaceData } from './types'
export type { AirspaceData }


// Check if a polygon is valid
export function isValidPolygon(polygon: Array<{ latitude: number; longitude: number }> | undefined): boolean {
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
export function filterValidAirspaces(data: AirspaceData[]): AirspaceData[] {
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

// Check if two polygons have nearly identical geometry
export function polygonsMatch(
    poly1: Array<{ latitude: number; longitude: number }>,
    poly2: Array<{ latitude: number; longitude: number }>
): boolean {
    if (!poly1 || !poly2 || poly1.length < 3 || poly2.length < 3) return false

    const lenDiff = Math.abs(poly1.length - poly2.length)
    const maxLen = Math.max(poly1.length, poly2.length)
    if (lenDiff / maxLen > 0.2) return false

    const getCentroid = (poly: Array<{ latitude: number; longitude: number }>) => {
        const sumLat = poly.reduce((sum, p) => sum + p.latitude, 0)
        const sumLon = poly.reduce((sum, p) => sum + p.longitude, 0)
        return { lat: sumLat / poly.length, lon: sumLon / poly.length }
    }

    const c1 = getCentroid(poly1)
    const c2 = getCentroid(poly2)

    const centroidDist = Math.sqrt(
        Math.pow(c1.lat - c2.lat, 2) + Math.pow(c1.lon - c2.lon, 2)
    )
    if (centroidDist > 0.008) return false

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

    const widthDiff = Math.abs(b1.width - b2.width) / Math.max(b1.width, b2.width, 0.001)
    const heightDiff = Math.abs(b1.height - b2.height) / Math.max(b1.height, b2.height, 0.001)

    return widthDiff < 0.1 && heightDiff < 0.1
}

// Check if two circles match
export function circlesMatch(
    circle1: { coordinates?: { latitude: number; longitude: number }; radius?: number },
    circle2: { coordinates?: { latitude: number; longitude: number }; radius?: number }
): boolean {
    if (!circle1.coordinates || !circle2.coordinates) return false
    if (circle1.radius === undefined || circle2.radius === undefined) return false

    const centerDist = Math.sqrt(
        Math.pow(circle1.coordinates.latitude - circle2.coordinates.latitude, 2) +
        Math.pow(circle1.coordinates.longitude - circle2.coordinates.longitude, 2)
    )
    if (centerDist > 0.008) return false

    const radiusDiff = Math.abs(circle1.radius - circle2.radius) / Math.max(circle1.radius, circle2.radius, 0.1)
    return radiusDiff < 0.05
}

// Check if two airspaces have matching geometry
export function airspacesMatch(airspace1: AirspaceData, airspace2: AirspaceData): boolean {
    const alt1 = airspace1.altitude
    const alt2 = airspace2.altitude
    if (alt1?.floor !== alt2?.floor || alt1?.ceiling !== alt2?.ceiling) {
        return false
    }

    if (airspace1.polygon && airspace2.polygon) {
        return polygonsMatch(airspace1.polygon, airspace2.polygon)
    }

    if (airspace1.coordinates && airspace1.radius !== undefined &&
        airspace2.coordinates && airspace2.radius !== undefined) {
        return circlesMatch(airspace1, airspace2)
    }

    return false
}

// Consolidate similar airspaces
export async function consolidateSimilarAirspaces(data: AirspaceData[]): Promise<AirspaceData[]> {
    if (data.length === 0) return data

    serverLogger.log(`Consolidating similar airspaces from ${data.length} entries...`)

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

    for (const [key, group] of groups) {
        if (group.length === 1) {
            consolidated.push(group[0])
            continue
        }

        const processed = new Set<number>()

        for (let i = 0; i < group.length; i++) {
            if (processed.has(i)) continue

            const cluster: AirspaceData[] = [group[i]]
            processed.add(i)

            let foundNew = true
            while (foundNew) {
                foundNew = false
                for (let j = 0; j < group.length; j++) {
                    if (processed.has(j)) continue

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
                totalMerged += cluster.length - 1
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
    return consolidated
}

// Extract route identifier from RNAV route name (e.g., "T601" from "T601 Fixed RNAV Route")
export function extractRouteId(name: string): string | null {
    const match = name.match(/([A-Z]\d+)/i)
    return match ? match[1] : null
}

// Get base name pattern for grouping (e.g., "Fixed RNAV Route" from "T601 Fixed RNAV Route")
export function getRouteBaseName(name: string): string {
    return name.replace(/[A-Z]\d+\s*/gi, '').trim()
}

// Cache interface for storing consolidation mappings
export interface ConsolidationCache {
    dataHash: string
    mappings: Array<{
        ids: string[]
        mergedId: string
        mergedName: string
    }>
    timestamp: number
}

// Calculate hash of data for cache invalidation
export function calculateDataHash(data: AirspaceData[]): string {
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
