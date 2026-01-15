'use client'

import { useState, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Line, Html } from '@react-three/drei'
import { BufferAttribute, DoubleSide, BufferGeometry, Color, MOUSE } from 'three'
import type { AirspaceData } from '@/lib/types'
import { pointInPolygon } from '@/lib/point-in-airspace'

export interface RouteElevationCellData {
    lat: number
    lon: number
    elevation: number | null
}

interface AirspaceRouteProps {
    route: Array<{ lat: number; lon: number }>
    routeCorridor: Array<{ lat: number; lon: number }>
    routeRadius: number
    onElevationCellsChange?: (cells: RouteElevationCellData[], minElev: number, maxElev: number) => void
    hasAirspace?: boolean
    airspacesAlongRoute?: AirspaceData[]
    isExpanded?: boolean
    onToggleExpand?: () => void
}

interface RouteElevationCell {
    x: number  // 3D position along route
    y: number  // 3D position across route (perpendicular)
    lat: number
    lon: number
    elevation: number | null
}

// Get color for elevation (terrain colormap) - same as cylinder
function getElevationColor(elevation: number, minElev: number, maxElev: number): string {
    const range = maxElev - minElev || 1
    const t = Math.max(0, Math.min(1, (elevation - minElev) / range))
    
    if (elevation <= 0) {
        return '#4a90d9'
    } else if (t < 0.25) {
        const lt = t / 0.25
        const r = Math.floor(34 + lt * (139 - 34))
        const g = Math.floor(139 + lt * (195 - 139))
        const b = Math.floor(34 + lt * (74 - 34))
        return `rgb(${r},${g},${b})`
    } else if (t < 0.6) {
        const lt = (t - 0.25) / 0.35
        const r = Math.floor(139 + lt * (160 - 139))
        const g = Math.floor(195 - lt * (195 - 140))
        const b = Math.floor(74 + lt * (100 - 74))
        return `rgb(${r},${g},${b})`
    } else {
        const lt = (t - 0.6) / 0.4
        const r = Math.floor(160 + lt * (220 - 160))
        const g = Math.floor(140 + lt * (220 - 140))
        const b = Math.floor(100 + lt * (220 - 100))
        return `rgb(${r},${g},${b})`
    }
}

// Convert lat/lon to 3D coordinates along route
function latLonToRouteCoords(
    lat: number,
    lon: number,
    route: Array<{ lat: number; lon: number }>,
    routeRadius: number
): { x: number; y: number } | null {
    // Find the closest point on the route
    let minDist = Infinity
    let closestSegment = 0
    let closestT = 0
    
    for (let i = 0; i < route.length - 1; i++) {
        const p1 = route[i]
        const p2 = route[i + 1]
        
        // Convert to km
        const dx = (p2.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
        const dy = (p2.lat - p1.lat) * 111
        const segLenSq = dx * dx + dy * dy
        
        if (segLenSq === 0) continue
        
        // Vector from p1 to point (in km)
        const px = (lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
        const py = (lat - p1.lat) * 111
        
        // Project point onto segment
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / segLenSq))
        
        // Closest point on segment (in km from p1)
        const projX = t * dx
        const projY = t * dy
        
        // Distance from point to closest point on segment
        const distX = px - projX
        const distY = py - projY
        const dist = Math.sqrt(distX * distX + distY * distY)
        
        if (dist < minDist) {
            minDist = dist
            closestSegment = i
            closestT = t
        }
    }
    
    // If point is too far from route, return null
    if (minDist > routeRadius * 1.5) return null
    
    // Calculate position along route (x = distance along route, y = perpendicular offset)
    let routeDistance = 0
    for (let i = 0; i < closestSegment; i++) {
        const p1 = route[i]
        const p2 = route[i + 1]
        const dx = (p2.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
        const dy = (p2.lat - p1.lat) * 111
        routeDistance += Math.sqrt(dx * dx + dy * dy)
    }
    
    // Add distance along current segment
    const p1 = route[closestSegment]
    const p2 = route[closestSegment + 1]
    const segDx = (p2.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
    const segDy = (p2.lat - p1.lat) * 111
    const segLen = Math.sqrt(segDx * segDx + segDy * segDy)
    routeDistance += closestT * segLen
    
    // Calculate perpendicular offset
    if (segLen === 0) return null
    
    // Perpendicular vector (normalized)
    const perpX = -segDy / segLen
    const perpY = segDx / segLen
    
    // Vector from closest point to actual point (in km)
    const closestLon = p1.lon + closestT * (p2.lon - p1.lon)
    const closestLat = p1.lat + closestT * (p2.lat - p1.lat)
    const pointDx = (lon - closestLon) * 111 * Math.cos(lat * Math.PI / 180)
    const pointDy = (lat - closestLat) * 111
    
    // Project onto perpendicular
    const offset = pointDx * perpX + pointDy * perpY
    
    // Normalize: route length maps to 3D x, radius maps to 3D y
    const totalRouteLength = route.reduce((sum, p, i) => {
        if (i === 0) return 0
        const p1 = route[i - 1]
        const dx = (p.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
        const dy = (p.lat - p1.lat) * 111
        return sum + Math.sqrt(dx * dx + dy * dy)
    }, 0)
    
    const scaleX = totalRouteLength > 0 ? 10 / totalRouteLength : 1  // Scale to fit in ~10 units
    const scaleY = routeRadius > 0 ? 3 / (routeRadius * 2) : 1  // Scale to fit in ~3 units
    
    return {
        x: routeDistance * scaleX - 5,  // Center around 0
        y: offset * scaleY
    }
}

// Render terrain along route
function RouteTerrain({ 
    cells, 
    minElev, 
    maxElev, 
    route,
    routeRadius
}: { 
    cells: RouteElevationCell[], 
    minElev: number, 
    maxElev: number,
    route: Array<{ lat: number; lon: number }>,
    routeRadius: number
}) {
    const verticalExaggeration = 4.0
    const subdivisions = 20  // For smooth terrain
    
    const terrainGeometry = useMemo(() => {
        if (cells.length === 0) return null
        
        const geometry = new BufferGeometry()
        const vertices: number[] = []
        const colors: number[] = []
        
        // Find max positive elevation for normalization
        const maxPositiveElev = Math.max(...cells.map(c => c.elevation ?? 0).filter(e => e > 0), 1)
        const maxHeight = 0.5  // Max terrain height in 3D units
        
        // Helper to get height at a point (with bilinear interpolation)
        const getHeight = (x: number, y: number): number => {
            if (cells.length === 0) return 0
            
            // Find closest cells for interpolation
            const cellSize = 0.5  // Approximate cell size in 3D units
            const searchRadius = cellSize * 2
            
            const nearbyCells: Array<{ cell: RouteElevationCell; dist: number }> = []
            for (const cell of cells) {
                const dx = x - cell.x
                const dy = y - cell.y
                const dist = Math.sqrt(dx * dx + dy * dy)
                if (dist < searchRadius) {
                    nearbyCells.push({ cell, dist })
                }
            }
            
            if (nearbyCells.length === 0) return 0
            
            // Use inverse distance weighting
            nearbyCells.sort((a, b) => a.dist - b.dist)
            const closest = nearbyCells[0]
            if (closest.dist < 0.01) {
                // Very close, use directly
                const elev = closest.cell.elevation ?? 0
                return elev > 0 ? (elev / maxPositiveElev) * maxHeight * verticalExaggeration : 0
            }
            
            // Weighted average of nearby cells
            let totalWeight = 0
            let weightedSum = 0
            for (const { cell, dist } of nearbyCells.slice(0, 4)) {  // Use 4 closest
                const weight = 1 / (dist + 0.01)  // Avoid division by zero
                const elev = cell.elevation ?? 0
                weightedSum += elev * weight
                totalWeight += weight
            }
            
            const avgElev = totalWeight > 0 ? weightedSum / totalWeight : 0
            return avgElev > 0 ? (avgElev / maxPositiveElev) * maxHeight * verticalExaggeration : 0
        }
        
        // Helper to get elevation at a point
        const getElev = (x: number, y: number): number => {
            if (cells.length === 0) return 0
            
            const cellSize = 0.5
            const searchRadius = cellSize * 2
            
            const nearbyCells: Array<{ cell: RouteElevationCell; dist: number }> = []
            for (const cell of cells) {
                const dx = x - cell.x
                const dy = y - cell.y
                const dist = Math.sqrt(dx * dx + dy * dy)
                if (dist < searchRadius) {
                    nearbyCells.push({ cell, dist })
                }
            }
            
            if (nearbyCells.length === 0) return 0
            
            nearbyCells.sort((a, b) => a.dist - b.dist)
            const closest = nearbyCells[0]
            if (closest.dist < 0.01) {
                return closest.cell.elevation ?? 0
            }
            
            // Weighted average
            let totalWeight = 0
            let weightedSum = 0
            for (const { cell, dist } of nearbyCells.slice(0, 4)) {
                const weight = 1 / (dist + 0.01)
                const elev = cell.elevation ?? 0
                weightedSum += elev * weight
                totalWeight += weight
            }
            
            return totalWeight > 0 ? weightedSum / totalWeight : 0
        }
        
        // Get bounds
        const minX = Math.min(...cells.map(c => c.x))
        const maxX = Math.max(...cells.map(c => c.x))
        const minY = Math.min(...cells.map(c => c.y))
        const maxY = Math.max(...cells.map(c => c.y))
        
        const stepX = (maxX - minX) / subdivisions
        const stepY = (maxY - minY) / subdivisions
        
        // Create terrain mesh
        for (let yi = 0; yi < subdivisions; yi++) {
            for (let xi = 0; xi < subdivisions; xi++) {
                const x0 = minX + xi * stepX
                const x1 = minX + (xi + 1) * stepX
                const y0 = minY + yi * stepY
                const y1 = minY + (yi + 1) * stepY
                
                // Get heights for the 4 corners
                const h00 = getHeight(x0, y0)
                const h10 = getHeight(x1, y0)
                const h01 = getHeight(x0, y1)
                const h11 = getHeight(x1, y1)
                
                // Triangle 1
                vertices.push(x0, h00, y0)
                vertices.push(x0, h01, y1)
                vertices.push(x1, h10, y0)
                
                const elev1 = (getElev(x0, y0) + getElev(x0, y1) + getElev(x1, y0)) / 3
                const color1 = new Color(getElevationColor(elev1, minElev, maxElev))
                colors.push(color1.r, color1.g, color1.b, color1.r, color1.g, color1.b, color1.r, color1.g, color1.b)
                
                // Triangle 2
                vertices.push(x1, h10, y0)
                vertices.push(x0, h01, y1)
                vertices.push(x1, h11, y1)
                
                const elev2 = (getElev(x1, y0) + getElev(x0, y1) + getElev(x1, y1)) / 3
                const color2 = new Color(getElevationColor(elev2, minElev, maxElev))
                colors.push(color2.r, color2.g, color2.b, color2.r, color2.g, color2.b, color2.r, color2.g, color2.b)
            }
        }
        
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
        geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
        
        return geometry
    }, [cells, minElev, maxElev, route, routeRadius])
    
    if (!terrainGeometry) return null
    
    return (
        <mesh geometry={terrainGeometry}>
            <meshBasicMaterial vertexColors side={DoubleSide} />
        </mesh>
    )
}

// Render airspace volumes along route
function RouteAirspaceVolumes({
    airspaces,
    route,
    routeCorridor,
    routeRadius,
    minAlt = 0,
    maxAlt = 18000
}: {
    airspaces: AirspaceData[],
    route: Array<{ lat: number; lon: number }>,
    routeCorridor: Array<{ lat: number; lon: number }>,
    routeRadius: number,
    minAlt?: number,
    maxAlt?: number
}) {
    const airspaceGeometries = useMemo(() => {
        if (!routeCorridor || routeCorridor.length < 3) return []
        
        const geometries: Array<{
            id: string
            geometry: BufferGeometry
            color: string
            floor: number
            ceiling: number
        }> = []
        
            // Convert routeCorridor to polygon format (ensure closed)
            const corridorPolygon = routeCorridor.map(v => ({
                latitude: v.lat,
                longitude: v.lon
            }))
            // Ensure polygon is closed
            if (corridorPolygon.length > 0 && 
                (corridorPolygon[0].latitude !== corridorPolygon[corridorPolygon.length - 1].latitude ||
                 corridorPolygon[0].longitude !== corridorPolygon[corridorPolygon.length - 1].longitude)) {
                corridorPolygon.push(corridorPolygon[0])
            }
        
        for (const airspace of airspaces) {
            // Check if airspace intersects corridor
            if (!airspace.polygon || airspace.polygon.length < 3) continue
            
            const airspacePolygon = airspace.polygon.map(p => ({
                latitude: p.latitude,
                longitude: p.longitude
            }))
            
            // Simple intersection check: see if any airspace vertex is in corridor
            let intersects = false
            for (const vertex of airspacePolygon) {
                if (pointInPolygon(vertex, corridorPolygon)) {
                    intersects = true
                    break
                }
            }
            
            if (!intersects) continue
            
            const floor = (airspace.altitude?.floor || 0) / 3.28084  // Convert feet to meters
            const ceiling = (airspace.altitude?.ceiling || 18000) / 3.28084
            
            // Create geometry for airspace along route
            const geometry = new BufferGeometry()
            const vertices: number[] = []
            
            // Sample points along route and check if they're in airspace
            const samplesPerSegment = 10
            for (let i = 0; i < route.length - 1; i++) {
                const p1 = route[i]
                const p2 = route[i + 1]
                
                for (let j = 0; j < samplesPerSegment; j++) {
                    const t = j / samplesPerSegment
                    const lat = p1.lat + t * (p2.lat - p1.lat)
                    const lon = p1.lon + t * (p2.lon - p1.lon)
                    
                    // Check if point is in airspace
                    const inAirspace = pointInPolygon({ latitude: lat, longitude: lon }, airspacePolygon)
                    if (!inAirspace) continue
                    
                    // Convert to route coords
                    const coords = latLonToRouteCoords(lat, lon, route, routeRadius)
                    if (!coords) continue
                    
                    // Create box for this sample point
                    const boxSize = 0.2
                    const floorY = (floor - minAlt) / (maxAlt - minAlt) * 4 - 2
                    const ceilingY = (ceiling - minAlt) / (maxAlt - minAlt) * 4 - 2
                    
                    // Bottom face
                    vertices.push(coords.x - boxSize, floorY, coords.y - boxSize)
                    vertices.push(coords.x + boxSize, floorY, coords.y - boxSize)
                    vertices.push(coords.x + boxSize, floorY, coords.y + boxSize)
                    vertices.push(coords.x - boxSize, floorY, coords.y - boxSize)
                    vertices.push(coords.x + boxSize, floorY, coords.y + boxSize)
                    vertices.push(coords.x - boxSize, floorY, coords.y + boxSize)
                    
                    // Top face
                    vertices.push(coords.x - boxSize, ceilingY, coords.y - boxSize)
                    vertices.push(coords.x - boxSize, ceilingY, coords.y + boxSize)
                    vertices.push(coords.x + boxSize, ceilingY, coords.y + boxSize)
                    vertices.push(coords.x - boxSize, ceilingY, coords.y - boxSize)
                    vertices.push(coords.x + boxSize, ceilingY, coords.y + boxSize)
                    vertices.push(coords.x + boxSize, ceilingY, coords.y - boxSize)
                    
                    // Walls (simplified - just vertical edges)
                    vertices.push(coords.x - boxSize, floorY, coords.y - boxSize)
                    vertices.push(coords.x - boxSize, ceilingY, coords.y - boxSize)
                    vertices.push(coords.x + boxSize, floorY, coords.y - boxSize)
                    vertices.push(coords.x + boxSize, ceilingY, coords.y - boxSize)
                }
            }
            
            if (vertices.length === 0) continue
            
            geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
            
            // Get color for airspace type
            const typeColors: Record<string, string> = {
                'A': '#ff0000',
                'B': '#ff6600',
                'C': '#ffff00',
                'D': '#00ff00',
                'E': '#0000ff',
                'F': '#6600ff',
                'G': '#ffffff',
                'R': '#ff00ff',
                'P': '#00ffff',
                'Q': '#ffcccc',
                'T': '#ccffcc',
                'W': '#ccccff'
            }
            
            const color = typeColors[airspace.type] || '#888888'
            
            geometries.push({
                id: airspace.id,
                geometry,
                color,
                floor,
                ceiling
            })
        }
        
        return geometries
    }, [airspaces, route, routeCorridor, routeRadius, minAlt, maxAlt])
    
    return (
        <group>
            {airspaceGeometries.map((data, idx) => (
                <mesh key={data.id || idx} geometry={data.geometry} renderOrder={idx + 1}>
                    <meshBasicMaterial 
                        color={data.color} 
                        transparent 
                        opacity={0.35} 
                        side={DoubleSide}
                        depthWrite={false}
                    />
                </mesh>
            ))}
        </group>
    )
}

// Central altitude scale
function RouteCentralAltitudeScale({ 
    minAlt = 0, 
    maxAlt = 18000, 
    airspaces = [] 
}: { 
    minAlt?: number, 
    maxAlt?: number,
    airspaces?: AirspaceData[]
}) {
    const routeBottom = -2
    const routeTop = 2
    const routeHeight = routeTop - routeBottom
    
    const scaleLabels = useMemo(() => {
        const altitudes = new Set<number>()
        altitudes.add(0)
        
        for (const airspace of airspaces) {
            if (airspace.altitude?.floor !== undefined) {
                altitudes.add((airspace.altitude.floor / 3.28084))
            }
            if (airspace.altitude?.ceiling !== undefined) {
                altitudes.add((airspace.altitude.ceiling / 3.28084))
            }
        }
        
        return Array.from(altitudes).sort((a, b) => a - b)
    }, [airspaces])
    
    const altToY = (altMeters: number): number => {
        const t = (altMeters - minAlt) / (maxAlt - minAlt)
        return routeBottom + t * routeHeight
    }
    
    const linePoints: [number, number, number][] = [
        [0, routeBottom, 0],
        [0, routeTop, 0]
    ]
    
    const tickWidth = 0.08
    
    return (
        <group>
            <Line points={linePoints} color="#1e3a5f" lineWidth={3} />
            
            {scaleLabels.map((alt, idx) => {
                const y = altToY(alt)
                return (
                    <group key={idx} position={[0, y, 0]}>
                        <Line
                            points={[
                                [-tickWidth * 1.5, 0, 0],
                                [tickWidth * 1.5, 0, 0]
                            ]}
                            color="#1e3a5f"
                            lineWidth={2}
                        />
                        <Html
                            position={[-0.3, 0, 0]}
                            style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
                            transform={false}
                            sprite={false}
                        >
                            <div style={{
                                fontSize: '14px',
                                fontWeight: 'bold',
                                color: '#111827',
                                textShadow: '0 0 4px white, 0 0 4px white, 0 0 4px white, 0 0 4px white, 0 0 2px white',
                                userSelect: 'none',
                                textAlign: 'right'
                            }}>
                                {Math.round(alt)}
                            </div>
                        </Html>
                    </group>
                )
            })}
            
            <Html
                position={[-0.3, routeTop + 0.2, 0]}
                style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
                transform={false}
                sprite={false}
            >
                <div style={{
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: '#374151',
                    textShadow: '0 0 4px white, 0 0 4px white, 0 0 4px white',
                    userSelect: 'none'
                }}>
                    m
                </div>
            </Html>
        </group>
    )
}

export default function AirspaceRoute({ 
    route, 
    routeCorridor, 
    routeRadius,
    onElevationCellsChange,
    hasAirspace = false,
    airspacesAlongRoute = [],
    isExpanded = false,
    onToggleExpand
}: AirspaceRouteProps) {
    const [mounted, setMounted] = useState(false)
    const [elevationCells, setElevationCells] = useState<RouteElevationCell[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [minElev, setMinElev] = useState(0)
    const [maxElev, setMaxElev] = useState(100)
    
    useEffect(() => {
        setMounted(true)
    }, [])
    
    // Fetch elevation data for route corridor
    useEffect(() => {
        if (!route || route.length < 2 || !routeCorridor || routeCorridor.length < 3) {
            setElevationCells([])
            return
        }
        
        const fetchElevationGrid = async () => {
            setIsLoading(true)
            
            // Tile the corridor with 500m x 500m cells
            const cellSizeKm = 0.5
            
            // Calculate total route length
            let totalLength = 0
            for (let i = 0; i < route.length - 1; i++) {
                const p1 = route[i]
                const p2 = route[i + 1]
                const dx = (p2.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
                const dy = (p2.lat - p1.lat) * 111
                totalLength += Math.sqrt(dx * dx + dy * dy)
            }
            
            // Generate cells along route
            const cellRequests: { x: number; y: number; lat: number; lon: number }[] = []
            
            // Sample points along route
            const samplesPerKm = 2  // 2 samples per km = 500m spacing
            const numSamples = Math.ceil(totalLength * samplesPerKm)
            
            for (let i = 0; i < route.length - 1; i++) {
                const p1 = route[i]
                const p2 = route[i + 1]
                
                    const segDx = (p2.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
                    const segDy = (p2.lat - p1.lat) * 111
                    const segLen = Math.sqrt(segDx * segDx + segDy * segDy)
                const segSamples = Math.ceil(segLen * samplesPerKm)
                
                for (let j = 0; j < segSamples; j++) {
                    const t = j / segSamples
                    const lat = p1.lat + t * (p2.lat - p1.lat)
                    const lon = p1.lon + t * (p2.lon - p1.lon)
                    
                    // Sample points perpendicular to route
                    const perpSamples = Math.ceil(routeRadius * 2 / cellSizeKm)
                    for (let k = -perpSamples / 2; k <= perpSamples / 2; k++) {
                        const offsetKm = k * cellSizeKm
                        
                        // Calculate perpendicular offset
                        const segDxNorm = segDx / segLen
                        const segDyNorm = segDy / segLen
                        const perpX = -segDyNorm
                        const perpY = segDxNorm
                        
                        const offsetLat = lat + (perpY * offsetKm) / 111
                        const offsetLon = lon + (perpX * offsetKm) / (111 * Math.cos(lat * Math.PI / 180))
                        
                        // Check if point is in corridor (ensure polygon is closed)
                        const corridorPoly = routeCorridor.map(v => ({ latitude: v.lat, longitude: v.lon }))
                        // Ensure polygon is closed
                        if (corridorPoly.length > 0 && 
                            (corridorPoly[0].latitude !== corridorPoly[corridorPoly.length - 1].latitude ||
                             corridorPoly[0].longitude !== corridorPoly[corridorPoly.length - 1].longitude)) {
                            corridorPoly.push(corridorPoly[0])
                        }
                        const inCorridor = pointInPolygon(
                            { latitude: offsetLat, longitude: offsetLon },
                            corridorPoly
                        )
                        
                        if (!inCorridor) continue
                        
                        // Convert to route coords
                        const coords = latLonToRouteCoords(offsetLat, offsetLon, route, routeRadius)
                        if (!coords) continue
                        
                        cellRequests.push({
                            x: coords.x,
                            y: coords.y,
                            lat: offsetLat,
                            lon: offsetLon
                        })
                    }
                }
            }
            
            // Limit to prevent API overload
            const maxCells = 200
            const sampledCells = cellRequests.length > maxCells 
                ? cellRequests.filter((_, i) => i % Math.ceil(cellRequests.length / maxCells) === 0)
                : cellRequests
            
            console.log('[AirspaceRoute] Fetching elevation for', sampledCells.length, 'cells')
            
            // Placeholder cells
            const placeholderCells: RouteElevationCell[] = sampledCells.map(c => ({
                x: c.x,
                y: c.y,
                lat: c.lat,
                lon: c.lon,
                elevation: null
            }))
            setElevationCells(placeholderCells)
            
            if (onElevationCellsChange) {
                onElevationCellsChange(
                    placeholderCells.map(c => ({ lat: c.lat, lon: c.lon, elevation: c.elevation })),
                    0, 0
                )
            }
            
            try {
                const requestBody = {
                    locations: sampledCells.map(c => ({ latitude: c.lat, longitude: c.lon }))
                }
                
                const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                })
                
                if (!response.ok) {
                    throw new Error(`API returned ${response.status}`)
                }
                
                const data = await response.json()
                
                if (data?.results?.length > 0) {
                    const cells: RouteElevationCell[] = []
                    let min = Infinity
                    let max = -Infinity
                    
                    for (let i = 0; i < data.results.length; i++) {
                        const result = data.results[i]
                        const elev = result?.elevation ?? 0
                        
                        cells.push({
                            x: sampledCells[i].x,
                            y: sampledCells[i].y,
                            lat: sampledCells[i].lat,
                            lon: sampledCells[i].lon,
                            elevation: elev
                        })
                        
                        if (elev < min) min = elev
                        if (elev > max) max = elev
                    }
                    
                    if (min !== Infinity && max !== -Infinity) {
                        setMinElev(min)
                        setMaxElev(max)
                    }
                    setElevationCells(cells)
                    
                    if (onElevationCellsChange) {
                        onElevationCellsChange(
                            cells.map(c => ({ lat: c.lat, lon: c.lon, elevation: c.elevation })),
                            min === Infinity ? 0 : min,
                            max === -Infinity ? 100 : max
                        )
                    }
                }
            } catch (err) {
                console.error('[AirspaceRoute] Failed to fetch elevation:', err)
                setElevationCells([])
            } finally {
                setIsLoading(false)
            }
        }
        
        fetchElevationGrid()
    }, [route, routeCorridor, routeRadius, onElevationCellsChange])
    
    if (!mounted || !route || route.length < 2) {
        return (
            <div style={{ 
                height: isExpanded ? 'calc(100vh - 200px)' : '400px', 
                backgroundColor: '#f9fafb', 
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6b7280',
                fontSize: '14px'
            }}>
                {!route ? 'No route selected' : 'Loading route visualization...'}
            </div>
        )
    }
    
    return (
        <div style={{ 
            height: isExpanded ? 'calc(100vh - 200px)' : '400px', 
            position: 'relative',
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e7eb'
        }}>
            <Canvas camera={{ position: [0, 3, 8], fov: 50 }} gl={{ stencil: true }}>
                <ambientLight intensity={0.6} />
                <directionalLight position={[10, 10, 5]} intensity={0.4} />
                
                <OrbitControls
                    enableRotate={true}
                    enablePan={true}
                    enableZoom={true}
                    rotateSpeed={0.8}
                    minPolarAngle={Math.PI / 4}
                    maxPolarAngle={Math.PI * 0.75}
                    mouseButtons={{
                        LEFT: MOUSE.ROTATE,
                        MIDDLE: MOUSE.DOLLY,
                        RIGHT: MOUSE.PAN
                    }}
                />
                
                {/* Route terrain */}
                <RouteTerrain 
                    cells={elevationCells}
                    minElev={minElev}
                    maxElev={maxElev}
                    route={route}
                    routeRadius={routeRadius}
                />
                
                {/* Airspace volumes */}
                {hasAirspace && airspacesAlongRoute.length > 0 && (
                    <RouteAirspaceVolumes
                        airspaces={airspacesAlongRoute}
                        route={route}
                        routeCorridor={routeCorridor}
                        routeRadius={routeRadius}
                        minAlt={0}
                        maxAlt={18000}
                    />
                )}
                
                {/* Central altitude scale */}
                {hasAirspace && airspacesAlongRoute.length > 0 && (
                    <RouteCentralAltitudeScale
                        minAlt={0}
                        maxAlt={18000}
                        airspaces={airspacesAlongRoute}
                    />
                )}
            </Canvas>
            
            {/* Expand/Collapse button */}
            {onToggleExpand && (
                <button
                    onClick={onToggleExpand}
                    style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        padding: '6px 12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        zIndex: 10
                    }}
                >
                    {isExpanded ? 'Minimize' : 'Expand'}
                </button>
            )}
        </div>
    )
}
