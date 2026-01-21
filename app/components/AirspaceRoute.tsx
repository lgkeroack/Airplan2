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
    distance: number  // Distance along route (0 to totalLength)
    offset: number    // Perpendicular offset from route center (-radius to +radius)
    lat: number
    lon: number
    elevation: number | null
}

// Get color for elevation (terrain colormap)
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

// Calculate distance between two points in km
function distanceKm(p1: { lat: number; lon: number }, p2: { lat: number; lon: number }): number {
    const dx = (p2.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
    const dy = (p2.lat - p1.lat) * 111
    return Math.sqrt(dx * dx + dy * dy)
}

// Get point at distance along route and perpendicular offset
function getRoutePoint(
    route: Array<{ lat: number; lon: number }>,
    distance: number,
    offset: number
): { lat: number; lon: number } | null {
    let accumulatedDist = 0
    
    for (let i = 0; i < route.length - 1; i++) {
        const p1 = route[i]
        const p2 = route[i + 1]
        const segLen = distanceKm(p1, p2)
        
        if (accumulatedDist + segLen >= distance) {
            // Point is on this segment
            const t = (distance - accumulatedDist) / segLen
            const lat = p1.lat + t * (p2.lat - p1.lat)
            const lon = p1.lon + t * (p2.lon - p1.lon)
            
            // Calculate perpendicular offset
            const dx = (p2.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
            const dy = (p2.lat - p1.lat) * 111
            const len = Math.sqrt(dx * dx + dy * dy)
            
            if (len === 0) return { lat, lon }
            
            const perpX = -dy / len
            const perpY = dx / len
            
            const offsetLat = (offset / 111) * perpY
            const offsetLon = (offset / (111 * Math.cos(lat * Math.PI / 180))) * perpX
            
            return {
                lat: lat + offsetLat,
                lon: lon + offsetLon
            }
        }
        
        accumulatedDist += segLen
    }
    
    return null
}

// Render terrain along route (straightened view)
function RouteTerrain({ 
    cells, 
    minElev, 
    maxElev, 
    routeLength,
    routeRadius
}: { 
    cells: RouteElevationCell[], 
    minElev: number, 
    maxElev: number,
    routeLength: number,
    routeRadius: number
}) {
    const verticalExaggeration = 4.0
    const subdivisions = 30
    
    const terrainGeometry = useMemo(() => {
        if (cells.length === 0 || routeLength === 0) return null
        
        const geometry = new BufferGeometry()
        const vertices: number[] = []
        const colors: number[] = []
        
        // Scale factors: route length → 3D x, route width → 3D z
        const scaleX = 10 / routeLength  // Route fits in 10 units
        const scaleZ = 3 / (routeRadius * 2)  // Width fits in 3 units
        const maxHeight = 0.5
        const maxPositiveElev = Math.max(...cells.map(c => c.elevation ?? 0).filter(e => e > 0), 1)
        
        // Helper to get elevation at a grid point
        const getElev = (distance: number, offset: number): number => {
            let minDist = Infinity
            let closestElev = 0
            
            for (const cell of cells) {
                const dist = Math.sqrt(
                    Math.pow((cell.distance - distance) * scaleX, 2) +
                    Math.pow((cell.offset - offset) * scaleZ, 2)
                )
                if (dist < minDist) {
                    minDist = dist
                    closestElev = cell.elevation ?? 0
                }
            }
            
            return closestElev
        }
        
        // Create terrain mesh
        const stepX = routeLength / subdivisions
        const stepZ = (routeRadius * 2) / subdivisions
        
        for (let zi = 0; zi < subdivisions; zi++) {
            for (let xi = 0; xi < subdivisions; xi++) {
                const d0 = xi * stepX
                const d1 = (xi + 1) * stepX
                const o0 = -routeRadius + zi * stepZ
                const o1 = -routeRadius + (zi + 1) * stepZ
                
                const h00 = getElev(d0, o0)
                const h10 = getElev(d1, o0)
                const h01 = getElev(d0, o1)
                const h11 = getElev(d1, o1)
                
                const height00 = h00 > 0 ? (h00 / maxPositiveElev) * maxHeight * verticalExaggeration : 0
                const height10 = h10 > 0 ? (h10 / maxPositiveElev) * maxHeight * verticalExaggeration : 0
                const height01 = h01 > 0 ? (h01 / maxPositiveElev) * maxHeight * verticalExaggeration : 0
                const height11 = h11 > 0 ? (h11 / maxPositiveElev) * maxHeight * verticalExaggeration : 0
                
                const x0 = d0 * scaleX - 5
                const x1 = d1 * scaleX - 5
                const z0 = o0 * scaleZ
                const z1 = o1 * scaleZ
                
                // Triangle 1
                vertices.push(x0, height00, z0)
                vertices.push(x0, height01, z1)
                vertices.push(x1, height10, z0)
                
                const elev1 = (h00 + h01 + h10) / 3
                const color1 = new Color(getElevationColor(elev1, minElev, maxElev))
                colors.push(color1.r, color1.g, color1.b, color1.r, color1.g, color1.b, color1.r, color1.g, color1.b)
                
                // Triangle 2
                vertices.push(x1, height10, z0)
                vertices.push(x0, height01, z1)
                vertices.push(x1, height11, z1)
                
                const elev2 = (h10 + h01 + h11) / 3
                const color2 = new Color(getElevationColor(elev2, minElev, maxElev))
                colors.push(color2.r, color2.g, color2.b, color2.r, color2.g, color2.b, color2.r, color2.g, color2.b)
            }
        }
        
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
        geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
        
        return geometry
    }, [cells, minElev, maxElev, routeLength, routeRadius])
    
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
    routeLength,
    routeRadius,
    minAlt = 0,
    maxAlt = 18000
}: {
    airspaces: AirspaceData[],
    route: Array<{ lat: number; lon: number }>,
    routeCorridor: Array<{ lat: number; lon: number }>,
    routeLength: number,
    routeRadius: number,
    minAlt?: number,
    maxAlt?: number
}) {
    const airspaceGeometries = useMemo(() => {
        if (!routeCorridor || routeCorridor.length < 3 || routeLength === 0) return []
        
        const corridorPolygon = routeCorridor.map(v => ({
            latitude: v.lat,
            longitude: v.lon
        }))
        // Ensure closed
        if (corridorPolygon.length > 0 && 
            (corridorPolygon[0].latitude !== corridorPolygon[corridorPolygon.length - 1].latitude ||
             corridorPolygon[0].longitude !== corridorPolygon[corridorPolygon.length - 1].longitude)) {
            corridorPolygon.push(corridorPolygon[0])
        }
        
        const scaleX = 10 / routeLength
        const scaleZ = 3 / (routeRadius * 2)
        
        const geometries: Array<{
            id: string
            geometry: BufferGeometry
            color: string
        }> = []
        
        for (const airspace of airspaces) {
            if (!airspace.polygon || airspace.polygon.length < 3) continue
            
            const airspacePolygon = airspace.polygon.map(p => ({
                latitude: p.latitude,
                longitude: p.longitude
            }))
            
            const floor = (airspace.altitude?.floor || 0) / 3.28084
            const ceiling = (airspace.altitude?.ceiling || 18000) / 3.28084
            
            const geometry = new BufferGeometry()
            const vertices: number[] = []
            
            // Sample along route
            const samples = Math.ceil(routeLength / 0.5) // Every 500m
            const step = routeLength / samples
            
            for (let i = 0; i < samples; i++) {
                const distance = i * step
                
                // Sample across width
                const widthSamples = 10
                for (let j = 0; j < widthSamples; j++) {
                    const offset = -routeRadius + (j / (widthSamples - 1)) * (routeRadius * 2)
                    
                    const point = getRoutePoint(route, distance, offset)
                    if (!point) continue
                    
                    if (!pointInPolygon({ latitude: point.lat, longitude: point.lon }, airspacePolygon)) continue
                    if (!pointInPolygon({ latitude: point.lat, longitude: point.lon }, corridorPolygon)) continue
                    
                    const x = distance * scaleX - 5
                    const z = offset * scaleZ
                    const floorY = (floor - minAlt) / (maxAlt - minAlt) * 4 - 2
                    const ceilingY = (ceiling - minAlt) / (maxAlt - minAlt) * 4 - 2
                    const boxSize = 0.15
                    
                    // Create box
                    vertices.push(x - boxSize, floorY, z - boxSize)
                    vertices.push(x + boxSize, floorY, z - boxSize)
                    vertices.push(x + boxSize, floorY, z + boxSize)
                    vertices.push(x - boxSize, floorY, z - boxSize)
                    vertices.push(x + boxSize, floorY, z + boxSize)
                    vertices.push(x - boxSize, floorY, z + boxSize)
                    
                    vertices.push(x - boxSize, ceilingY, z - boxSize)
                    vertices.push(x - boxSize, ceilingY, z + boxSize)
                    vertices.push(x + boxSize, ceilingY, z + boxSize)
                    vertices.push(x - boxSize, ceilingY, z - boxSize)
                    vertices.push(x + boxSize, ceilingY, z + boxSize)
                    vertices.push(x + boxSize, ceilingY, z - boxSize)
                }
            }
            
            if (vertices.length === 0) continue
            
            geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
            
            const typeColors: Record<string, string> = {
                'A': '#ff0000', 'B': '#ff6600', 'C': '#ffff00', 'D': '#00ff00',
                'E': '#0000ff', 'F': '#6600ff', 'G': '#ffffff', 'R': '#ff00ff',
                'P': '#00ffff', 'Q': '#ffcccc', 'T': '#ccffcc', 'W': '#ccccff'
            }
            
            geometries.push({
                id: airspace.id,
                geometry,
                color: typeColors[airspace.type] || '#888888'
            })
        }
        
        return geometries
    }, [airspaces, route, routeCorridor, routeLength, routeRadius, minAlt, maxAlt])
    
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

// Distance markers along the route
function RouteDistanceMarkers({
    route,
    routeLength,
    routeRadius
}: {
    route: Array<{ lat: number; lon: number }>,
    routeLength: number,
    routeRadius: number
}) {
    const scaleX = 10 / routeLength
    const scaleZ = 3 / (routeRadius * 2)
    
    const markers = useMemo(() => {
        if (routeLength === 0) return []
        
        // Place markers every 1km, or every 5km if route is very long
        const interval = routeLength > 50 ? 5 : 1
        const markers: Array<{ distance: number; x: number }> = []
        
        for (let d = 0; d <= routeLength; d += interval) {
            const x = d * scaleX - 5
            markers.push({ distance: Math.round(d), x })
        }
        
        // Always include the end marker
        if (markers.length === 0 || markers[markers.length - 1].distance < routeLength) {
            const x = routeLength * scaleX - 5
            markers.push({ distance: Math.round(routeLength), x })
        }
        
        return markers
    }, [routeLength, scaleX])
    
    return (
        <group>
            {markers.map((marker, idx) => (
                <group key={idx} position={[marker.x, 0, 0]}>
                    {/* Vertical line through the route */}
                    <Line 
                        points={[
                            [0, -2, -scaleZ * routeRadius],
                            [0, 2, -scaleZ * routeRadius]
                        ]} 
                        color="#3b82f6" 
                        lineWidth={2} 
                    />
                    {/* Label */}
                    <Html 
                        position={[0, 2.2, -scaleZ * routeRadius]} 
                        style={{ pointerEvents: 'none' }} 
                        transform={false}
                        center
                    >
                        <div style={{
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: '#3b82f6',
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid #3b82f6',
                            textShadow: '0 0 2px white',
                            whiteSpace: 'nowrap'
                        }}>
                            {marker.distance} km
                        </div>
                    </Html>
                </group>
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
        return routeBottom + t * (routeTop - routeBottom)
    }
    
    return (
        <group>
            <Line points={[[0, routeBottom, 0], [0, routeTop, 0]]} color="#1e3a5f" lineWidth={3} />
            {scaleLabels.map((alt, idx) => {
                const y = altToY(alt)
                return (
                    <group key={idx} position={[0, y, 0]}>
                        <Line points={[[-0.12, 0, 0], [0.12, 0, 0]]} color="#1e3a5f" lineWidth={2} />
                        <Html position={[-0.3, 0, 0]} style={{ pointerEvents: 'none' }} transform={false}>
                            <div style={{
                                fontSize: '14px',
                                fontWeight: 'bold',
                                color: '#111827',
                                textShadow: '0 0 4px white, 0 0 4px white, 0 0 4px white',
                                textAlign: 'right'
                            }}>
                                {Math.round(alt)}
                            </div>
                        </Html>
                    </group>
                )
            })}
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
    
    // Calculate total route length
    const routeLength = useMemo(() => {
        if (!route || route.length < 2) return 0
        let total = 0
        for (let i = 0; i < route.length - 1; i++) {
            total += distanceKm(route[i], route[i + 1])
        }
        return total
    }, [route])
    
    useEffect(() => {
        setMounted(true)
    }, [])
    
    // Fetch elevation data
    useEffect(() => {
        if (!route || route.length < 2 || !routeCorridor || routeCorridor.length < 3 || routeLength === 0) {
            setElevationCells([])
            return
        }
        
        const fetchElevationGrid = async () => {
            setIsLoading(true)
            
            const cellSizeKm = 0.5
            const corridorPolygon = routeCorridor.map(v => ({
                latitude: v.lat,
                longitude: v.lon
            }))
            if (corridorPolygon.length > 0 && 
                (corridorPolygon[0].latitude !== corridorPolygon[corridorPolygon.length - 1].latitude ||
                 corridorPolygon[0].longitude !== corridorPolygon[corridorPolygon.length - 1].longitude)) {
                corridorPolygon.push(corridorPolygon[0])
            }
            
            const cellRequests: { distance: number; offset: number; lat: number; lon: number }[] = []
            
            // Sample along route
            const lengthSamples = Math.ceil(routeLength / cellSizeKm)
            const widthSamples = Math.ceil((routeRadius * 2) / cellSizeKm)
            
            for (let i = 0; i < lengthSamples; i++) {
                const distance = (i / lengthSamples) * routeLength
                
                for (let j = 0; j < widthSamples; j++) {
                    const offset = -routeRadius + (j / (widthSamples - 1)) * (routeRadius * 2)
                    
                    const point = getRoutePoint(route, distance, offset)
                    if (!point) continue
                    
                    if (!pointInPolygon({ latitude: point.lat, longitude: point.lon }, corridorPolygon)) continue
                    
                    cellRequests.push({ distance, offset, lat: point.lat, lon: point.lon })
                }
            }
            
            // Limit to prevent API overload
            const maxCells = 200
            const sampledCells = cellRequests.length > maxCells 
                ? cellRequests.filter((_, i) => i % Math.ceil(cellRequests.length / maxCells) === 0)
                : cellRequests
            
            const placeholderCells: RouteElevationCell[] = sampledCells.map(c => ({
                distance: c.distance,
                offset: c.offset,
                lat: c.lat,
                lon: c.lon,
                elevation: null
            }))
            setElevationCells(placeholderCells)
            
            try {
                const requestBody = {
                    locations: sampledCells.map(c => ({ latitude: c.lat, longitude: c.lon }))
                }
                
                const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(requestBody)
                })
                
                if (!response.ok) throw new Error(`API returned ${response.status}`)
                
                const data = await response.json()
                
                if (data?.results?.length > 0) {
                    const cells: RouteElevationCell[] = []
                    let min = Infinity
                    let max = -Infinity
                    
                    for (let i = 0; i < data.results.length; i++) {
                        const elev = data.results[i]?.elevation ?? 0
                        cells.push({
                            distance: sampledCells[i].distance,
                            offset: sampledCells[i].offset,
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
    }, [route, routeCorridor, routeRadius, routeLength, onElevationCellsChange])
    
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
                
                <RouteTerrain 
                    cells={elevationCells}
                    minElev={minElev}
                    maxElev={maxElev}
                    routeLength={routeLength}
                    routeRadius={routeRadius}
                />
                
                {/* Distance markers */}
                <RouteDistanceMarkers
                    route={route}
                    routeLength={routeLength}
                    routeRadius={routeRadius}
                />
                
                {hasAirspace && airspacesAlongRoute.length > 0 && (
                    <>
                        <RouteAirspaceVolumes
                            airspaces={airspacesAlongRoute}
                            route={route}
                            routeCorridor={routeCorridor}
                            routeLength={routeLength}
                            routeRadius={routeRadius}
                            minAlt={0}
                            maxAlt={18000}
                        />
                        <RouteCentralAltitudeScale
                            minAlt={0}
                            maxAlt={18000}
                            airspaces={airspacesAlongRoute}
                        />
                    </>
                )}
            </Canvas>
            
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
