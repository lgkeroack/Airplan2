'use client'

import { useState, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Line, Html } from '@react-three/drei'
import { BufferAttribute, DoubleSide, BufferGeometry, MOUSE, Shape, ExtrudeGeometry, Vector2 } from 'three'
import type { AirspaceData } from '@/lib/types'

export interface PolygonVertex {
    lat: number
    lon: number
}

interface AirspacePolygonProps {
    vertices: PolygonVertex[]
    airspacesInPolygon?: AirspaceData[]
    isExpanded?: boolean
    onToggleExpand?: () => void
}

interface ElevationCell {
    x: number
    z: number
    lat: number
    lon: number
    elevation: number | null
}

// Get polygon bounding box
function getPolygonBounds(vertices: PolygonVertex[]): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
    let minLat = Infinity, maxLat = -Infinity
    let minLon = Infinity, maxLon = -Infinity
    
    for (const v of vertices) {
        if (v.lat < minLat) minLat = v.lat
        if (v.lat > maxLat) maxLat = v.lat
        if (v.lon < minLon) minLon = v.lon
        if (v.lon > maxLon) maxLon = v.lon
    }
    
    return { minLat, maxLat, minLon, maxLon }
}

// Check if a point is inside a polygon using ray casting
function pointInPolygon(lat: number, lon: number, vertices: PolygonVertex[]): boolean {
    let inside = false
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i].lon, yi = vertices[i].lat
        const xj = vertices[j].lon, yj = vertices[j].lat
        
        if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
            inside = !inside
        }
    }
    return inside
}

// Get color for elevation
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

// Polygon walls component - fading transparent walls
function PolygonWalls({ vertices, scaleX, scaleZ, offsetX, offsetZ }: { 
    vertices: PolygonVertex[], 
    scaleX: number, 
    scaleZ: number,
    offsetX: number,
    offsetZ: number
}) {
    const segments = 12
    const totalHeight = 4
    const segmentHeight = totalHeight / segments
    
    // Convert vertices to 3D positions
    const positions = useMemo(() => {
        return vertices.map(v => ({
            x: (v.lon - offsetX) * scaleX,
            z: -(v.lat - offsetZ) * scaleZ
        }))
    }, [vertices, scaleX, scaleZ, offsetX, offsetZ])
    
    return (
        <group>
            {Array.from({ length: segments }).map((_, segIdx) => {
                const yBottom = -2 + segIdx * segmentHeight
                const yTop = yBottom + segmentHeight
                const t = segIdx / (segments - 1)
                const opacity = 0.35 * (1 - t)
                
                // Create wall segments between each pair of vertices
                return positions.map((pos, i) => {
                    const nextPos = positions[(i + 1) % positions.length]
                    
                    const wallVertices = new Float32Array([
                        pos.x, yBottom, pos.z,
                        nextPos.x, yBottom, nextPos.z,
                        nextPos.x, yTop, nextPos.z,
                        pos.x, yBottom, pos.z,
                        nextPos.x, yTop, nextPos.z,
                        pos.x, yTop, pos.z,
                    ])
                    
                    const geometry = new BufferGeometry()
                    geometry.setAttribute('position', new BufferAttribute(wallVertices, 3))
                    geometry.computeVertexNormals()
                    
                    return (
                        <mesh key={`${segIdx}-${i}`} geometry={geometry}>
                            <meshBasicMaterial 
                                color="#87CEEB"
                                side={DoubleSide}
                                transparent
                                opacity={opacity}
                                depthWrite={false}
                            />
                        </mesh>
                    )
                })
            })}
        </group>
    )
}

// Terrain mesh for polygon
function PolygonTerrain({ cells, vertices, minElev, maxElev, scaleX, scaleZ, offsetX, offsetZ }: {
    cells: ElevationCell[],
    vertices: PolygonVertex[],
    minElev: number,
    maxElev: number,
    scaleX: number,
    scaleZ: number,
    offsetX: number,
    offsetZ: number
}) {
    const maxPositiveElev = useMemo(() => {
        let max = 0
        for (const cell of cells) {
            if (cell.elevation !== null && cell.elevation > max) {
                max = cell.elevation
            }
        }
        return max || 1
    }, [cells])
    
    const terrainGeometry = useMemo(() => {
        if (cells.length === 0) return null
        
        const geometry = new BufferGeometry()
        const vertexData: number[] = []
        const colors: number[] = []
        const maxHeight = 0.8
        const verticalExaggeration = 4.0
        
        // Create triangles for each cell that's inside the polygon
        for (const cell of cells) {
            if (cell.elevation === null) continue
            if (!pointInPolygon(cell.lat, cell.lon, vertices)) continue
            
            const x = (cell.lon - offsetX) * scaleX
            const z = -(cell.lat - offsetZ) * scaleZ
            const h = cell.elevation > 0 ? (cell.elevation / maxPositiveElev) * maxHeight * verticalExaggeration : 0
            
            // Calculate actual cell size in 3D space (500m = 0.5km)
            // 0.5km in degrees * scale = cell size in 3D units
            const cellSizeKm = 0.5
            const kmPerDegLat = 111
            const kmPerDegLon = 111 * Math.cos((cell.lat) * Math.PI / 180)
            const cellSizeDegLat = cellSizeKm / kmPerDegLat
            const cellSizeDegLon = cellSizeKm / kmPerDegLon
            const cellSizeX = cellSizeDegLon * scaleX
            const cellSizeZ = cellSizeDegLat * scaleZ
            const color = parseColor(getElevationColor(cell.elevation, minElev, maxElev))
            
            // Two triangles for a quad
            vertexData.push(
                x - cellSizeX / 2, h, z - cellSizeZ / 2,
                x + cellSizeX / 2, h, z - cellSizeZ / 2,
                x + cellSizeX / 2, h, z + cellSizeZ / 2,
                x - cellSizeX / 2, h, z - cellSizeZ / 2,
                x + cellSizeX / 2, h, z + cellSizeZ / 2,
                x - cellSizeX / 2, h, z + cellSizeZ / 2,
            )
            
            for (let i = 0; i < 6; i++) {
                colors.push(...color)
            }
        }
        
        if (vertexData.length === 0) return null
        
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertexData), 3))
        geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
        geometry.computeVertexNormals()
        
        return geometry
    }, [cells, vertices, minElev, maxElev, maxPositiveElev, scaleX, scaleZ, offsetX, offsetZ])
    
    if (!terrainGeometry) return null
    
    return (
        <mesh geometry={terrainGeometry} position={[0, -2, 0]}>
            <meshStandardMaterial
                vertexColors
                flatShading
                side={DoubleSide}
            />
        </mesh>
    )
}

// Polygon floor outline
function PolygonFloor({ vertices, scaleX, scaleZ, offsetX, offsetZ }: {
    vertices: PolygonVertex[],
    scaleX: number,
    scaleZ: number,
    offsetX: number,
    offsetZ: number
}) {
    const positions = useMemo(() => {
        const pts: [number, number, number][] = vertices.map(v => [
            (v.lon - offsetX) * scaleX,
            -2,
            -(v.lat - offsetZ) * scaleZ
        ])
        // Close the loop
        if (pts.length > 0) {
            pts.push(pts[0])
        }
        return pts
    }, [vertices, scaleX, scaleZ, offsetX, offsetZ])
    
    return (
        <Line
            points={positions}
            color="#ef4444"
            lineWidth={3}
        />
    )
}

// North indicator
function NorthIndicator({ scaleZ, offsetZ, maxLat }: { scaleZ: number, offsetZ: number, maxLat: number }) {
    const northZ = -(maxLat - offsetZ) * scaleZ - 0.3
    
    return (
        <group position={[0, -2, northZ]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.08, 0.2, 3]} />
                <meshBasicMaterial color="#ef4444" />
            </mesh>
            <Html position={[0, 0.15, 0]} center>
                <div style={{ 
                    color: '#ef4444', 
                    fontWeight: 'bold', 
                    fontSize: '12px',
                    textShadow: '0 0 3px white'
                }}>
                    N
                </div>
            </Html>
        </group>
    )
}

export default function AirspacePolygon({ vertices, airspacesInPolygon = [], isExpanded = false, onToggleExpand }: AirspacePolygonProps) {
    const [mounted, setMounted] = useState(false)
    const [elevationCells, setElevationCells] = useState<ElevationCell[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [minElev, setMinElev] = useState(0)
    const [maxElev, setMaxElev] = useState(100)
    
    useEffect(() => {
        setMounted(true)
    }, [])
    
    // Calculate bounds and scaling
    const { bounds, scaleX, scaleZ, offsetX, offsetZ, centerX, centerZ } = useMemo(() => {
        const b = getPolygonBounds(vertices)
        const latRange = b.maxLat - b.minLat
        const lonRange = b.maxLon - b.minLon
        
        // Scale to fit in a 3x3 box centered at origin
        const maxRange = Math.max(latRange, lonRange) || 0.01
        const scale = 3 / maxRange
        
        return {
            bounds: b,
            scaleX: scale,
            scaleZ: scale,
            offsetX: (b.minLon + b.maxLon) / 2,
            offsetZ: (b.minLat + b.maxLat) / 2,
            centerX: 0,
            centerZ: 0
        }
    }, [vertices])
    
    // Fetch elevation data
    useEffect(() => {
        if (vertices.length < 3 || !scaleX || !scaleZ) return
        
        const fetchElevation = async () => {
            setIsLoading(true)
            
            const b = getPolygonBounds(vertices)
            const latRange = b.maxLat - b.minLat
            const lonRange = b.maxLon - b.minLon
            
            // 500m cells
            const cellSizeKm = 0.5
            const kmPerDegLat = 111
            const kmPerDegLon = 111 * Math.cos(((b.minLat + b.maxLat) / 2) * Math.PI / 180)
            
            const cellSizeLat = cellSizeKm / kmPerDegLat
            const cellSizeLon = cellSizeKm / kmPerDegLon
            
            const gridSizeLat = Math.max(2, Math.ceil(latRange / cellSizeLat))
            const gridSizeLon = Math.max(2, Math.ceil(lonRange / cellSizeLon))
            
            // Limit grid size
            const cappedGridLat = Math.min(gridSizeLat, 20)
            const cappedGridLon = Math.min(gridSizeLon, 20)
            
            const stepLat = latRange / cappedGridLat
            const stepLon = lonRange / cappedGridLon
            
            const cellRequests: { lat: number; lon: number }[] = []
            
            for (let i = 0; i < cappedGridLat; i++) {
                for (let j = 0; j < cappedGridLon; j++) {
                    const lat = b.minLat + stepLat / 2 + i * stepLat
                    const lon = b.minLon + stepLon / 2 + j * stepLon
                    
                    // Only include cells inside the polygon
                    if (pointInPolygon(lat, lon, vertices)) {
                        cellRequests.push({ lat, lon })
                    }
                }
            }
            
            console.log(`[AirspacePolygon] Fetching elevation for ${cellRequests.length} cells`)
            
            // Show placeholders
            const placeholders: ElevationCell[] = cellRequests.map(c => ({
                x: (c.lon - offsetX) * scaleX,
                z: -(c.lat - offsetZ) * scaleZ,
                lat: c.lat,
                lon: c.lon,
                elevation: null
            }))
            setElevationCells(placeholders)
            
            try {
                const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        locations: cellRequests.map(c => ({ latitude: c.lat, longitude: c.lon }))
                    })
                })
                
                if (!response.ok) throw new Error(`API error: ${response.status}`)
                
                const data = await response.json()
                
                if (data?.results?.length > 0) {
                    let min = Infinity, max = -Infinity
                    const cells: ElevationCell[] = []
                    
                    for (let i = 0; i < data.results.length; i++) {
                        const result = data.results[i]
                        const elev = typeof result.elevation === 'number' ? result.elevation : 0
                        
                        cells.push({
                            x: (cellRequests[i].lon - offsetX) * scaleX,
                            z: -(cellRequests[i].lat - offsetZ) * scaleZ,
                            lat: cellRequests[i].lat,
                            lon: cellRequests[i].lon,
                            elevation: elev
                        })
                        
                        if (elev < min) min = elev
                        if (elev > max) max = elev
                    }
                    
                    setMinElev(min === Infinity ? 0 : min)
                    setMaxElev(max === -Infinity ? 100 : max)
                    setElevationCells(cells)
                }
            } catch (err) {
                console.error('[AirspacePolygon] Elevation fetch error:', err)
            } finally {
                setIsLoading(false)
            }
        }
        
        fetchElevation()
    }, [vertices, offsetX, offsetZ, scaleX, scaleZ])
    
    const CanvasContent = () => (
        <>
            <color attach="background" args={['#ffffff']} />
            <ambientLight intensity={0.6} />
            <pointLight position={[10, 10, 10]} />
            
            <PolygonWalls 
                vertices={vertices} 
                scaleX={scaleX} 
                scaleZ={scaleZ} 
                offsetX={offsetX} 
                offsetZ={offsetZ} 
            />
            
            <PolygonFloor 
                vertices={vertices} 
                scaleX={scaleX} 
                scaleZ={scaleZ} 
                offsetX={offsetX} 
                offsetZ={offsetZ} 
            />
            
            <PolygonTerrain 
                cells={elevationCells}
                vertices={vertices}
                minElev={minElev}
                maxElev={maxElev}
                scaleX={scaleX}
                scaleZ={scaleZ}
                offsetX={offsetX}
                offsetZ={offsetZ}
            />
            
            <NorthIndicator scaleZ={scaleZ} offsetZ={offsetZ} maxLat={bounds.maxLat} />
            
            <OrbitControls
                enablePan={true}
                enableZoom={true}
                enableRotate={true}
                minPolarAngle={Math.PI / 4}
                maxPolarAngle={Math.PI / 2}
                screenSpacePanning={true}
                panSpeed={0.5}
                rotateSpeed={0.8}
                mouseButtons={{
                    LEFT: MOUSE.ROTATE,
                    MIDDLE: MOUSE.DOLLY,
                    RIGHT: MOUSE.PAN
                }}
            />
        </>
    )
    
    if (!mounted) {
        return (
            <div style={{ marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                    3D Polygon View
                </h3>
                <div style={{ 
                    position: 'relative', 
                    height: '300px', 
                    width: '100%', 
                    backgroundColor: '#ffffff', 
                    borderRadius: '8px', 
                    overflow: 'hidden', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    border: '1px solid #e5e7eb' 
                }}>
                    <span style={{ color: '#9ca3af' }}>Loading 3D view...</span>
                </div>
            </div>
        )
    }
    
    if (isExpanded) {
        return (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: '#ffffff',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#f9fafb'
                }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                        3D Polygon View
                    </h3>
                    <button
                        onClick={onToggleExpand}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '500'
                        }}
                    >
                        Minimize
                    </button>
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Canvas camera={{ position: [0, 3, 6], fov: 50 }}>
                        <CanvasContent />
                    </Canvas>
                    
                    {isLoading && (
                        <div style={{ 
                            position: 'absolute', 
                            bottom: '16px', 
                            left: '16px', 
                            fontSize: '12px', 
                            color: '#6b7280',
                            backgroundColor: 'rgba(255,255,255,0.95)',
                            padding: '8px 12px',
                            borderRadius: '6px'
                        }}>
                            Loading terrain...
                        </div>
                    )}
                    
                    {elevationCells.length > 0 && (
                        <div style={{ 
                            position: 'absolute', 
                            bottom: '16px', 
                            right: '16px', 
                            fontSize: '12px', 
                            color: '#6b7280',
                            backgroundColor: 'rgba(255,255,255,0.95)',
                            padding: '8px 12px',
                            borderRadius: '6px'
                        }}>
                            Elevation: {Math.round(minElev)}m - {Math.round(maxElev)}m
                        </div>
                    )}
                </div>
            </div>
        )
    }
    
    return (
        <div style={{ marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                3D Polygon View
            </h3>
            
            <div style={{ 
                position: 'relative', 
                height: '300px', 
                width: '100%', 
                backgroundColor: '#ffffff', 
                borderRadius: '8px', 
                overflow: 'hidden', 
                border: '1px solid #e5e7eb' 
            }}>
                <Canvas camera={{ position: [0, 3, 6], fov: 50 }}>
                    <CanvasContent />
                </Canvas>
                
                {onToggleExpand && (
                    <button
                        onClick={onToggleExpand}
                        style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            width: '32px',
                            height: '32px',
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 100
                        }}
                        title="Expand"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
                            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                        </svg>
                    </button>
                )}
                
                {isLoading && (
                    <div style={{ 
                        position: 'absolute', 
                        bottom: '8px', 
                        left: '8px', 
                        fontSize: '11px', 
                        color: '#6b7280',
                        backgroundColor: 'rgba(255,255,255,0.9)',
                        padding: '4px 8px',
                        borderRadius: '4px'
                    }}>
                        Loading terrain...
                    </div>
                )}
                
                {elevationCells.length > 0 && (
                    <div style={{ 
                        position: 'absolute', 
                        bottom: '8px', 
                        right: '8px', 
                        fontSize: '10px', 
                        color: '#6b7280',
                        backgroundColor: 'rgba(255,255,255,0.9)',
                        padding: '4px 8px',
                        borderRadius: '4px'
                    }}>
                        {Math.round(minElev)}m - {Math.round(maxElev)}m
                    </div>
                )}
            </div>
        </div>
    )
}
