
'use client'


import { useState, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { AirspaceData } from '@/lib/types'
// Do NOT import RouteTerrainProfileCanvas or @react-three/fiber here!
import { findAirspacesAtPoint } from '@/lib/point-in-airspace'

interface RoutePoint {
    id?: string
    lat: number
    lon: number
    ele?: number
}

interface ElevationGridCell {
    lat: number
    lon: number
    elevation: number | null
    distanceFromPath: number // meters
    progressAlongPath: number // 0-1, position along route
}

// Extended airspace data with position info along route
interface PositionedAirspace extends AirspaceData {
    startProgress: number // 0-1, where along route this airspace starts
    endProgress: number   // 0-1, where along route this airspace ends
}

interface RouteTerrainProfileProps {
    points: RoutePoint[]
    width: number // km on each side of the path
    onClose: () => void
    onWidthChange: (width: number) => void
    embedded?: boolean // If true, removes fixed positioning for use in side panel
    airspaceData?: AirspaceData[] // All available airspace data
    onElevationDataChange?: (
        cells: ElevationGridCell[], 
        minElev: number, 
        maxElev: number, 
        airspaces: PositionedAirspace[],
        routeBearing: number,
        totalDistanceKm: number
    ) => void // Callback for elevation data and airspaces
}

// Haversine distance calculation
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3 // metres
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
}

// Calculate bearing between two points
function getBearingRadians(lat1: number, lon1: number, lat2: number, lon2: number) {
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180

    const y = Math.sin(Δλ) * Math.cos(φ2)
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
    return Math.atan2(y, x)
}

// Calculate point at bearing and distance from start point
function calculateDestinationPoint(lat: number, lon: number, bearing: number, distanceKm: number) {
    const R = 6371 // km
    const φ1 = lat * Math.PI / 180
    const λ1 = lon * Math.PI / 180
    const d = distanceKm / R

    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) +
        Math.cos(φ1) * Math.sin(d) * Math.cos(bearing))
    const λ2 = λ1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(φ1),
        Math.cos(d) - Math.sin(φ1) * Math.sin(φ2))

    return {
        lat: φ2 * 180 / Math.PI,
        lon: λ2 * 180 / Math.PI
    }
}

// Get elevation color (terrain colormap)
function getElevationColor(elevation: number, minElev: number, maxElev: number): string {
    const range = maxElev - minElev || 1
    const t = Math.max(0, Math.min(1, (elevation - minElev) / range))
    
    if (elevation <= 0) {
        return '#4a90d9' // Water - blue
    } else if (t < 0.25) {
        // Low elevation - green
        const lt = t / 0.25
        const r = Math.floor(34 + lt * (139 - 34))
        const g = Math.floor(139 + lt * (195 - 139))
        const b = Math.floor(34 + lt * (74 - 34))
        return `rgb(${r},${g},${b})`
    } else if (t < 0.6) {
        // Mid elevation - tan/brown
        const lt = (t - 0.25) / 0.35
        const r = Math.floor(139 + lt * (160 - 139))
        const g = Math.floor(195 - lt * (195 - 140))
        const b = Math.floor(74 + lt * (100 - 74))
        return `rgb(${r},${g},${b})`
    } else {
        // High elevation - brown to light gray
        const lt = (t - 0.6) / 0.4
        const r = Math.floor(160 + lt * (200 - 160))
        const g = Math.floor(140 + lt * (180 - 140))
        const b = Math.floor(100 + lt * (160 - 100))
        return `rgb(${r},${g},${b})`
    }
}

// Parse color string to RGB
function parseColor(colorStr: string): [number, number, number] {
    const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (match) {
        return [parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255]
    } else if (colorStr.startsWith('#')) {
        const hex = colorStr.slice(1)
        return [
            parseInt(hex.slice(0, 2), 16) / 255,
            parseInt(hex.slice(2, 4), 16) / 255,
            parseInt(hex.slice(4, 6), 16) / 255
        ]
    }
    return [0.5, 0.5, 0.5]
}



export default function RouteTerrainProfile({
    points,
    width,
    onClose,
    onWidthChange,
    embedded = false,
    airspaceData = [],
    onElevationDataChange
}: RouteTerrainProfileProps) {
    const [gridCells, setGridCells] = useState<ElevationGridCell[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [minElev, setMinElev] = useState(0)
    const [maxElev, setMaxElev] = useState(100)
    const [localWidth, setLocalWidth] = useState(width)
    const [routeAirspaces, setRouteAirspaces] = useState<PositionedAirspace[]>([])
    
    // Use ref to avoid callback being a dependency in useEffect
    const onElevationDataChangeRef = useRef(onElevationDataChange)
    useEffect(() => {
        onElevationDataChangeRef.current = onElevationDataChange
    }, [onElevationDataChange])
    
    // Calculate route bearing and total distance
    const { routeBearing, totalDistanceKm } = useMemo(() => {
        if (points.length < 2) {
            return { routeBearing: 0, totalDistanceKm: 0 }
        }
        
        // Calculate total distance
        let totalDist = 0
        for (let i = 0; i < points.length - 1; i++) {
            totalDist += getDistanceMeters(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon)
        }
        
        // Calculate initial bearing (from start to end point for overall direction)
        const bearing = getBearingRadians(
            points[0].lat, points[0].lon,
            points[points.length - 1].lat, points[points.length - 1].lon
        )
        
        return {
            routeBearing: bearing,
            totalDistanceKm: totalDist / 1000
        }
    }, [points])
    // Generate grid of sample points around the path
    const gridSamplePoints = useMemo(() => {
        if (points.length < 2) {
            console.log('[RouteTerrainProfile] Not enough points:', points.length)
            return []
        }

        console.log('[RouteTerrainProfile] Generating grid for', points.length, 'route points, width=', localWidth)
        const samples: ElevationGridCell[] = []
        
        // Adaptive sample interval: larger routes can use larger intervals
        let sampleInterval = 1000 // Default 1km
        
        // Calculate total route distance
        let totalDist = 0
        for (let i = 0; i < points.length - 1; i++) {
            totalDist += getDistanceMeters(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon)
        }
        
        // If route is very long, increase sample interval to keep total samples under 200
        // (200 * 11 lateral samples = 2200 samples max, which batches into 44 batches of 50)
        if (totalDist > 200000) {
            sampleInterval = Math.ceil(totalDist / 200) // About 200 samples along the route
        }
        
        const lateralSamples = 11 // 11 samples across width (including center)

        // Iterate along the path
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i]
            const p2 = points[i + 1]
            const segmentDist = getDistanceMeters(p1.lat, p1.lon, p2.lat, p2.lon)
            const bearing = getBearingRadians(p1.lat, p1.lon, p2.lat, p2.lon)
            
            const numSamples = Math.ceil(segmentDist / sampleInterval)
            for (let j = 0; j <= numSamples; j++) {
                const t = j / numSamples
                const pathLat = p1.lat + (p2.lat - p1.lat) * t
                const pathLon = p1.lon + (p2.lon - p1.lon) * t
                
                // Calculate progress along entire route
                let distFromStart = 0
                for (let k = 0; k < i; k++) {
                    distFromStart += getDistanceMeters(
                        points[k].lat, points[k].lon,
                        points[k + 1].lat, points[k + 1].lon
                    )
                }
                distFromStart += segmentDist * t
                const totalDist = (() => {
                    let total = 0
                    for (let k = 0; k < points.length - 1; k++) {
                        total += getDistanceMeters(
                            points[k].lat, points[k].lon,
                            points[k + 1].lat, points[k + 1].lon
                        )
                    }
                    return total
                })()
                const progress = totalDist > 0 ? distFromStart / totalDist : 0

                // Sample perpendicular to path
                for (let s = 0; s < lateralSamples; s++) {
                    const lateralOffset = (s / (lateralSamples - 1) - 0.5) * localWidth // -width/2 to width/2
                    const samplePoint = calculateDestinationPoint(pathLat, pathLon, bearing + Math.PI / 2, lateralOffset)
                    
                    samples.push({
                        lat: samplePoint.lat,
                        lon: samplePoint.lon,
                        elevation: null,
                        distanceFromPath: Math.abs(lateralOffset) * 1000, // meters
                        progressAlongPath: progress
                    })
                }
            }
        }

        console.log('[RouteTerrainProfile] Generated', samples.length, 'sample points')
        return samples
    }, [points, localWidth])

    // Fetch elevation data
    useEffect(() => {
        if (gridSamplePoints.length === 0) return

        console.log('[RouteTerrainProfile] Fetching elevation for', gridSamplePoints.length, 'points')

        const fetchElevation = async () => {
            setIsLoading(true)
            try {
                const response = await fetch('/api/elevation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        points: gridSamplePoints.map(s => ({
                            lat: s.lat,
                            lon: s.lon
                        }))
                    })
                })

                if (!response.ok) {
                    throw new Error(`Elevation fetch failed: ${response.status}`)
                }

                const data = await response.json()
                console.log('[RouteTerrainProfile] Received', data.results?.length, 'elevation results')
                if (data.results && Array.isArray(data.results)) {
                    const updatedCells = gridSamplePoints.map((cell, idx) => ({
                        ...cell,
                        elevation: data.results[idx]?.elevation ?? null
                    }))

                    console.log('[RouteTerrainProfile] Updated grid cells:', updatedCells.length)
                    setGridCells(updatedCells)

                    // Calculate min/max elevation
                    let min = Infinity
                    let max = -Infinity
                    let validCount = 0
                    for (const cell of updatedCells) {
                        if (cell.elevation !== null) {
                            min = Math.min(min, cell.elevation)
                            max = Math.max(max, cell.elevation)
                            validCount++
                        }
                    }

                    console.log('[RouteTerrainProfile] Elevation stats - Valid:', validCount, '/', updatedCells.length, 'Range:', min, 'to', max)
                    if (validCount === 0) {
                        console.warn('[RouteTerrainProfile] WARNING: No valid elevation data received! All values are null.')
                    }
                    if (min !== Infinity) setMinElev(min)
                    if (max !== -Infinity) setMaxElev(max)
                    
                    // Notify parent of elevation data change (airspaces passed via state)
                    if (onElevationDataChangeRef.current) {
                        const finalMin = min !== Infinity ? min : 0
                        const finalMax = max !== -Infinity ? max : 100
                        // Note: routeAirspaces will be passed separately when it updates
                        onElevationDataChangeRef.current(updatedCells, finalMin, finalMax, [], routeBearing, totalDistanceKm)
                    }
                }
            } catch (error) {
                console.error('Failed to fetch elevation for route grid:', error)
            } finally {
                setIsLoading(false)
            }
        }

        fetchElevation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gridSamplePoints, routeBearing, totalDistanceKm])

    // Aggregate airspaces along the route
    useEffect(() => {
        if (points.length < 2 || airspaceData.length === 0) {
            setRouteAirspaces([])
            return
        }

        // Track airspace positions along route: Map<airspaceId, {minProgress, maxProgress}>
        const airspacePositions = new Map<string, { airspace: AirspaceData; minProgress: number; maxProgress: number }>()
        const sampleInterval = 500 // meters along path (finer resolution for better position tracking)

        // Calculate total route distance
        let totalRouteDist = 0
        for (let i = 0; i < points.length - 1; i++) {
            totalRouteDist += getDistanceMeters(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon)
        }

        // Sample points along the route to find intersecting airspaces and track their positions
        let accumulatedDist = 0
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i]
            const p2 = points[i + 1]
            const segmentDist = getDistanceMeters(p1.lat, p1.lon, p2.lat, p2.lon)
            
            const numSamples = Math.ceil(segmentDist / sampleInterval)
            for (let j = 0; j <= numSamples; j++) {
                const t = j / numSamples
                const sampleLat = p1.lat + (p2.lat - p1.lat) * t
                const sampleLon = p1.lon + (p2.lon - p1.lon) * t
                
                // Calculate progress along route (0-1)
                const currentDist = accumulatedDist + segmentDist * t
                const progress = totalRouteDist > 0 ? currentDist / totalRouteDist : 0
                
                // Find airspaces at this sample point
                const airspacesAtPoint = findAirspacesAtPoint(
                    { latitude: sampleLat, longitude: sampleLon },
                    airspaceData
                )
                
                // Track position for each airspace
                for (const airspace of airspacesAtPoint) {
                    const existing = airspacePositions.get(airspace.id)
                    if (existing) {
                        // Update min/max progress
                        existing.minProgress = Math.min(existing.minProgress, progress)
                        existing.maxProgress = Math.max(existing.maxProgress, progress)
                    } else {
                        // First time seeing this airspace
                        airspacePositions.set(airspace.id, {
                            airspace,
                            minProgress: progress,
                            maxProgress: progress
                        })
                    }
                }
            }
            accumulatedDist += segmentDist
        }

        // Convert to PositionedAirspace array
        const positionedAirspaces: PositionedAirspace[] = Array.from(airspacePositions.values()).map(({ airspace, minProgress, maxProgress }) => ({
            ...airspace,
            startProgress: minProgress,
            endProgress: maxProgress
        }))
        
        setRouteAirspaces(positionedAirspaces)
        // Notify parent of airspace update if we have elevation data
        if (onElevationDataChangeRef.current && gridCells.length > 0) {
            onElevationDataChangeRef.current(gridCells, minElev, maxElev, positionedAirspaces, routeBearing, totalDistanceKm)
        }
    }, [points, airspaceData, gridCells, minElev, maxElev, routeBearing, totalDistanceKm])

    return (
        <div style={{
            position: embedded ? 'relative' : 'fixed',
            bottom: embedded ? 'auto' : '30px',
            right: embedded ? 'auto' : '30px',
            width: embedded ? '100%' : '600px',
            maxHeight: embedded ? 'none' : '80vh',
            backgroundColor: embedded ? 'transparent' : 'rgba(17, 24, 39, 0.95)',
            backdropFilter: embedded ? 'none' : 'blur(10px)',
            borderRadius: '12px',
            padding: embedded ? '0' : '24px',
            color: embedded ? '#111827' : 'white',
            boxShadow: embedded ? 'none' : '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            zIndex: embedded ? 'auto' : 500,
            overflow: 'auto',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            {!embedded && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Terrain Profile</h2>
                <button
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'white',
                        fontSize: '24px',
                        cursor: 'pointer',
                        padding: '0',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    ×
                </button>
            </div>
            )}

            {isLoading && (
                <div style={{ textAlign: 'center', padding: '20px', color: embedded ? '#6b7280' : '#9ca3af' }}>
                    Loading elevation data for {gridSamplePoints.length} points...
                </div>
            )}

            {!isLoading && gridCells.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#f87171' }}>
                    No elevation data received. Grid samples: {gridSamplePoints.length}. Check console for errors.
                </div>
            )}

            {!isLoading && gridCells.length > 0 && (
                <>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
                            Terrain Width: {localWidth.toFixed(1)} km
                        </label>
                        <input
                            type="range"
                            min="0.5"
                            max="10"
                            step="0.5"
                            value={localWidth}
                            onChange={(e) => {
                                const newWidth = parseFloat(e.target.value)
                                setLocalWidth(newWidth)
                                onWidthChange(newWidth)
                            }}
                            style={{ width: '100%' }}
                        />
                    </div>

                                        {/* 3D profile is now dynamically imported and rendered in SidePanel.tsx */}
                                        {typeof window !== 'undefined' && window.__RenderTerrainProfile3D &&
                                            window.__RenderTerrainProfile3D({
                                                cells: gridCells,
                                                minElev,
                                                maxElev,
                                                width: localWidth
                                            })}

                    <div style={{
                        marginTop: '16px',
                        fontSize: '12px',
                        color: '#9ca3af'
                    }}>
                        <p>Elevation Range: {Math.round(minElev)}m - {Math.round(maxElev)}m</p>
                        <p>Grid Points: {gridCells.length}</p>
                    </div>

                    {routeAirspaces.length > 0 && (
                        <div style={{
                            marginTop: '24px',
                            padding: '16px',
                            backgroundColor: embedded ? '#f9fafb' : 'rgba(31, 41, 55, 0.5)',
                            borderRadius: '8px',
                            borderLeft: '4px solid #3b82f6'
                        }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>
                                Airspaces Along Route ({routeAirspaces.length})
                            </h3>
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}>
                                {routeAirspaces.map(airspace => (
                                    <div key={airspace.id} style={{
                                        padding: '8px 12px',
                                        backgroundColor: embedded ? '#ffffff' : 'rgba(31, 41, 55, 0.3)',
                                        borderRadius: '6px',
                                        borderLeft: `3px solid ${getAirspaceColor(airspace.type)}`,
                                        fontSize: '12px'
                                    }}>
                                        <div style={{ fontWeight: '600', marginBottom: '2px' }}>
                                            {airspace.notamNumber}
                                        </div>
                                        <div style={{ 
                                            fontSize: '11px', 
                                            color: embedded ? '#6b7280' : '#9ca3af',
                                            marginBottom: '2px'
                                        }}>
                                            Type: {airspace.type}
                                        </div>
                                        {airspace.altitude && (
                                            <div style={{ 
                                                fontSize: '11px', 
                                                color: embedded ? '#6b7280' : '#9ca3af'
                                            }}>
                                                Altitude: {airspace.altitude.floor}ft - {airspace.altitude.ceiling}ft
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

// Get color for airspace type
function getAirspaceColor(type: string): string {
    const colors: { [key: string]: string } = {
        'Class A': '#FF0000',
        'Class B': '#FF4500',
        'Class C': '#FF8C00',
        'Class D': '#FFD700',
        'Class E': '#90EE90',
        'Restricted': '#FF1493',
        'Prohibited': '#8B0000',
        'Alert': '#FF69B4',
        'Warning': '#FFA500',
        'TFR': '#DC143C',
        'MOA': '#9370DB',
        'Military Training Route': '#4169E1',
        'Wilderness Area': '#228B22',
        'Default': '#64748b'
    }
    
    if (colors[type]) return colors[type]
    
    // Try partial matches
    if (type.includes('Class B')) return colors['Class B']
    if (type.includes('Class C')) return colors['Class C']
    if (type.includes('Class D')) return colors['Class D']
    if (type.includes('Class E')) return colors['Class E']
    if (type.includes('Restricted')) return colors['Restricted']
    if (type.includes('Prohibited')) return colors['Prohibited']
    if (type.includes('Warning')) return colors['Warning']
    
    return colors['Default']
}
