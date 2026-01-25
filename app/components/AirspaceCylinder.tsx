'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Line, Text, Billboard, Html } from '@react-three/drei'
import { BufferAttribute, DoubleSide, BufferGeometry, Color, IncrementStencilOp, NotEqualStencilFunc, MOUSE, Group } from 'three'
import type { AirspaceData } from '@/lib/types'

export interface ElevationCellData {
    lat: number
    lon: number
    elevation: number | null
}

interface AirspaceCylinderProps {
    clickedPoint?: { lat: number; lon: number } | null
    radiusKm?: number
    onElevationCellsChange?: (cells: ElevationCellData[], minElev: number, maxElev: number) => void
    hasAirspace?: boolean
    airspacesAtPoint?: AirspaceData[]
    isExpanded?: boolean
    onToggleExpand?: () => void
    selectedBasemap?: string
}

// Map tile URL templates for different basemaps
const BASEMAP_URLS: Record<string, string> = {
    'topographic': 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
    'osm': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    'osm-humanitarian': 'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    'cartodb-positron': 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    'cartodb-dark': 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'cartodb-voyager': 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    'esri-imagery': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    'esri-topo': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    'esri-street': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
}

// Convert lat/lon to tile coordinates
function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number; pixelX: number; pixelY: number } {
    const n = Math.pow(2, zoom)
    const xTile = Math.floor((lon + 180) / 360 * n)
    const latRad = lat * Math.PI / 180
    const yTile = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
    
    // Calculate pixel position within tile (0-255)
    const xFrac = ((lon + 180) / 360 * n) - xTile
    const yFrac = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n) - yTile
    
    return {
        x: xTile,
        y: yTile,
        pixelX: Math.floor(xFrac * 256),
        pixelY: Math.floor(yFrac * 256)
    }
}

interface ElevationCell {
    x: number
    z: number
    lat: number
    lon: number
    elevation: number | null  // null means still loading
}

interface ThermalHotspot {
    x: number  // 3D position
    z: number  // 3D position
    lat: number
    lon: number
    intensity: number  // 0-1 strength
}

function CylinderWalls() {
    // Create multiple stacked cylinder segments that fade from light blue to transparent
    const segments = 12
    const totalHeight = 4
    const segmentHeight = totalHeight / segments
    const radius = 1.5
    
    return (
        <group>
            {Array.from({ length: segments }).map((_, i) => {
                // Position: starts at -2 (bottom), each segment stacks up
                const yPos = -2 + segmentHeight / 2 + i * segmentHeight
                
                // Opacity: starts at 0.35 at bottom, fades smoothly to 0 at top
                const t = i / (segments - 1)  // 0 to 1
                const opacity = 0.35 * (1 - t)  // Linear fade
                
                return (
                    <mesh key={i} position={[0, yPos, 0]}>
                        <cylinderGeometry args={[radius, radius, segmentHeight, 32, 1, true]} />
                        <meshBasicMaterial 
                            color="#87CEEB"
                            side={DoubleSide} 
                            transparent 
                            opacity={opacity}
                            depthWrite={false}
                        />
                    </mesh>
                )
            })}
        </group>
    )
}

// Get color for elevation (terrain colormap)
function getElevationColor(elevation: number, minElev: number, maxElev: number): string {
    const range = maxElev - minElev || 1
    const t = Math.max(0, Math.min(1, (elevation - minElev) / range))
    
    // Terrain color gradient: blue (water) -> green (low) -> brown (mid) -> white (high)
    if (elevation <= 0) {
        // Water - blue
        return '#4a90d9'
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
        const r = Math.floor(160 + lt * (220 - 160))
        const g = Math.floor(140 + lt * (220 - 140))
        const b = Math.floor(100 + lt * (220 - 100))
        return `rgb(${r},${g},${b})`
    }
}

// Bilinear interpolation helper
function bilinearInterpolate(
    x: number, z: number,
    cells: ElevationCell[],
    gridSize: number,
    cylinderRadius: number
): number {
    const cellSize = (cylinderRadius * 2) / gridSize
    
    // Convert world coords to grid coords
    const gx = (x + cylinderRadius) / cellSize
    const gz = (z + cylinderRadius) / cellSize
    
    // Find surrounding cell indices
    const x0 = Math.floor(gx - 0.5)
    const x1 = x0 + 1
    const z0 = Math.floor(gz - 0.5)
    const z1 = z0 + 1
    
    // Get elevations for surrounding cells (with boundary handling)
    const getElev = (xi: number, zi: number): number => {
        // Find cell with matching grid position
        const targetX = -cylinderRadius + cellSize / 2 + xi * cellSize
        const targetZ = -cylinderRadius + cellSize / 2 + zi * cellSize
        
        for (const cell of cells) {
            if (Math.abs(cell.x - targetX) < cellSize * 0.6 && Math.abs(cell.z - targetZ) < cellSize * 0.6) {
                return cell.elevation ?? 0
            }
        }
        return 0
    }
    
    const e00 = getElev(x0, z0)
    const e10 = getElev(x1, z0)
    const e01 = getElev(x0, z1)
    const e11 = getElev(x1, z1)
    
    // Interpolation weights
    const tx = gx - 0.5 - x0
    const tz = gz - 0.5 - z0
    const txc = Math.max(0, Math.min(1, tx))
    const tzc = Math.max(0, Math.min(1, tz))
    
    // Bilinear interpolation
    const e0 = e00 * (1 - txc) + e10 * txc
    const e1 = e01 * (1 - txc) + e11 * txc
    return e0 * (1 - tzc) + e1 * tzc
}

function ElevationMosaic({ cells, minElev, maxElev, isLoading, gridSize, radiusKm, airspaces = [], cellColors = {} }: { 
    cells: ElevationCell[], 
    minElev: number, 
    maxElev: number,
    isLoading: boolean,
    gridSize: number,
    radiusKm: number,
    airspaces?: AirspaceData[],
    cellColors?: Record<string, [number, number, number]>  // lat,lon -> RGB (0-1)
}) {
    const cylinderRadius = 1.5
    const cylinderBottom = -2
    const cylinderHeight = 4
    // Scale subdivisions based on grid size for appropriate detail
    const subdivisions = Math.max(12, Math.min(48, gridSize * 2))
    
    // Calculate the same scale range as ElevationScaleBar and AirspaceVolumes
    const { scaleMin, scaleRange } = useMemo(() => {
        let maxAltM = maxElev
        for (const airspace of airspaces) {
            const ceiling = airspace.altitude?.ceiling || 18000
            const ceilingM = Math.round(ceiling / 3.28084)
            if (ceilingM > maxAltM) {
                maxAltM = ceilingM
            }
        }
        const range = maxAltM - minElev
        return { scaleMin: minElev, scaleRange: range > 0 ? range : 1 }
    }, [minElev, maxElev, airspaces])
    
    // Find the maximum positive elevation for normalization
    const maxPositiveElev = useMemo(() => {
        let max = 0
        for (const cell of cells) {
            if (cell.elevation !== null && cell.elevation > max) {
                max = cell.elevation
            }
        }
        return max || 1
    }, [cells])
    
    // Helper to parse color string to RGB values
    const parseColor = (colorStr: string): [number, number, number] => {
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
    
    // Create low-poly terrain geometry with flat shading
    const terrainGeometry = useMemo(() => {
        if (cells.length === 0) return null
        
        const geometry = new BufferGeometry()
        const size = cylinderRadius * 2
        const step = size / subdivisions
        
        // Convert elevation (in meters) to Y position using same scale as airspaces
        // Defined inside useMemo to properly capture scaleMin and scaleRange
        const elevToY = (elevM: number): number => {
            const t = Math.max(0, Math.min(1, (elevM - scaleMin) / scaleRange))
            return cylinderBottom + t * cylinderHeight
        }
        
        // For flat shading, each triangle has its own vertices (no sharing)
        const vertices: number[] = []
        const colors: number[] = []
        
        // Helper to get height at a point using the same scale as airspaces
        // This maps actual elevation to Y position so terrain aligns with airspace altitudes
        const getHeight = (x: number, z: number): number => {
            const dist = Math.sqrt(x * x + z * z)
            if (dist > cylinderRadius) return 0
            const elev = bilinearInterpolate(x, z, cells, gridSize, cylinderRadius)
            // Use the shared scale - elevToY returns absolute Y position, 
            // but we need height relative to the base (Y=0 in local coords since group is at Y=-2)
            return elev > 0 ? elevToY(elev) - cylinderBottom : 0
        }
        
        // Helper to get elevation at a point
        const getElev = (x: number, z: number): number => {
            return bilinearInterpolate(x, z, cells, gridSize, cylinderRadius)
        }
        
        // Helper to get color at a point - use basemap color if available, else elevation color
        const getColor = (x: number, z: number): [number, number, number] => {
            // Find nearest cell to get its lat/lon
            const cellSize = (cylinderRadius * 2) / gridSize
            let nearestCell: ElevationCell | null = null
            let nearestDist = Infinity
            
            for (const cell of cells) {
                const dx = cell.x - x
                const dz = cell.z - z
                const dist = dx * dx + dz * dz
                if (dist < nearestDist) {
                    nearestDist = dist
                    nearestCell = cell
                }
            }
            
            if (nearestCell) {
                const key = `${nearestCell.lat.toFixed(4)},${nearestCell.lon.toFixed(4)}`
                if (cellColors[key]) {
                    return cellColors[key]
                }
            }
            
            // Fallback to elevation-based color
            const elev = getElev(x, z)
            return parseColor(getElevationColor(elev, minElev, maxElev))
        }
        
        // Create ALL triangles with flat shading (shader will clip to circle)
        for (let zi = 0; zi < subdivisions; zi++) {
            for (let xi = 0; xi < subdivisions; xi++) {
                const x0 = -cylinderRadius + xi * step
                const x1 = -cylinderRadius + (xi + 1) * step
                const z0 = -cylinderRadius + zi * step
                const z1 = -cylinderRadius + (zi + 1) * step
                
                // Get heights for the 4 corners
                const h00 = getHeight(x0, z0)
                const h10 = getHeight(x1, z0)
                const h01 = getHeight(x0, z1)
                const h11 = getHeight(x1, z1)
                
                // Triangle 1: (0,0) -> (0,1) -> (1,0)
                vertices.push(x0, h00, z0)
                vertices.push(x0, h01, z1)
                vertices.push(x1, h10, z0)
                
                // Get color from basemap if available, else use elevation
                const cx1 = (x0 + x0 + x1) / 3
                const cz1 = (z0 + z1 + z0) / 3
                const color1 = getColor(cx1, cz1)
                colors.push(...color1, ...color1, ...color1)
                
                // Triangle 2: (1,0) -> (0,1) -> (1,1)
                vertices.push(x1, h10, z0)
                vertices.push(x0, h01, z1)
                vertices.push(x1, h11, z1)
                
                const cx2 = (x1 + x0 + x1) / 3
                const cz2 = (z0 + z1 + z1) / 3
                const color2 = getColor(cx2, cz2)
                colors.push(...color2, ...color2, ...color2)
            }
        }
        
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
        geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
        geometry.computeVertexNormals()
        
        return geometry
    }, [cells, minElev, maxElev, maxPositiveElev, gridSize, subdivisions, scaleMin, scaleRange, cellColors])

    // Get height at a specific cell for labels
    const getCellHeight = (cell: ElevationCell) => {
        if (cell.elevation === null || cell.elevation <= 0 || maxPositiveElev <= 0) return 0
        const maxHeight = (cylinderRadius * 2 / gridSize) * 0.95
        return (cell.elevation / maxPositiveElev) * maxHeight
    }

    return (
        <group position={[0, -2, 0]}>
            {/* Low-poly terrain mesh with circular clipping */}
            {terrainGeometry && (
                <>
                    <mesh geometry={terrainGeometry}>
                        <shaderMaterial
                            vertexColors
                            transparent
                            side={DoubleSide}
                            uniforms={{
                                uRadius: { value: cylinderRadius },
                                uOpacity: { value: 0.85 }
                            }}
                            vertexShader={`
                                varying vec3 vColor;
                                varying vec3 vPosition;
                                
                                void main() {
                                    vColor = color;
                                    vPosition = position;
                                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                                }
                            `}
                            fragmentShader={`
                                uniform float uRadius;
                                uniform float uOpacity;
                                varying vec3 vColor;
                                varying vec3 vPosition;
                                
                                void main() {
                                    float dist = sqrt(vPosition.x * vPosition.x + vPosition.z * vPosition.z);
                                    if (dist > uRadius) discard;
                                    gl_FragColor = vec4(vColor, uOpacity);
                                }
                            `}
                        />
                    </mesh>
                    {/* Wireframe edges for low-poly look with circular clipping */}
                    <mesh geometry={terrainGeometry}>
                        <shaderMaterial
                            wireframe
                            transparent
                            uniforms={{
                                uRadius: { value: cylinderRadius },
                                uColor: { value: new Color('#333333') }
                            }}
                            vertexShader={`
                                varying vec3 vPosition;
                                
                                void main() {
                                    vPosition = position;
                                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                                }
                            `}
                            fragmentShader={`
                                uniform float uRadius;
                                uniform vec3 uColor;
                                varying vec3 vPosition;
                                
                                void main() {
                                    float dist = sqrt(vPosition.x * vPosition.x + vPosition.z * vPosition.z);
                                    if (dist > uRadius) discard;
                                    gl_FragColor = vec4(uColor, 0.3);
                                }
                            `}
                        />
                    </mesh>
                </>
            )}
            
            {/* Circle outline */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
                <ringGeometry args={[1.48, 1.52, 64]} />
                <meshBasicMaterial color="#666666" side={DoubleSide} />
            </mesh>
        </group>
    )
}

function RadiusLabel({ radiusKm }: { radiusKm: number }) {
    const dottedLinePoints = useMemo(() => {
        const segments: [number, number, number][][] = []
        const dashLength = 0.1
        const gapLength = 0.08
        let x = 0
        while (x < 1.5) {
            const endX = Math.min(x + dashLength, 1.5)
            segments.push([
                [x, 0.01, 0],
                [endX, 0.01, 0]
            ])
            x = endX + gapLength
        }
        return segments
    }, [])

    return (
        <group>
            <group position={[0, -2, 0]}>
                {dottedLinePoints.map((points, idx) => (
                    <Line
                        key={idx}
                        points={points}
                        color="#9ca3af"
                        lineWidth={1.5}
                        transparent
                        opacity={0.6}
                    />
                ))}
                
                <mesh position={[0, 0.01, 0]}>
                    <sphereGeometry args={[0.03, 8, 8]} />
                    <meshBasicMaterial color="#9ca3af" transparent opacity={0.6} />
                </mesh>
            </group>
        </group>
    )
}

function NorthIndicator() {
    const triangleGeometry = useMemo(() => {
        const geometry = new BufferGeometry()
        const vertices = new Float32Array([
            0, 0, -1.85,
            -0.1, 0, -1.55,
            0.1, 0, -1.55,
        ])
        geometry.setAttribute('position', new BufferAttribute(vertices, 3))
        geometry.computeVertexNormals()
        return geometry
    }, [])

    return (
        <group position={[0, -2, 0]}>
            <mesh geometry={triangleGeometry} position={[0, 0.01, 0]}>
                <meshBasicMaterial color="#dc2626" side={DoubleSide} />
            </mesh>
        </group>
    )
}

// Click position marker at the center of cylinder - white line with V at top
function ClickPositionMarker({ centerElevation, minElev, maxElev, airspaces = [] }: { 
    centerElevation: number; 
    minElev: number; 
    maxElev: number;
    airspaces?: AirspaceData[];
}) {
    const cylinderBottom = -2
    const cylinderHeight = 4
    
    // Calculate scale range same as other components
    const { scaleMin, scaleRange } = useMemo(() => {
        let maxAltM = maxElev
        for (const airspace of airspaces) {
            const ceiling = airspace.altitude?.ceiling || 18000
            const ceilingM = Math.round(ceiling / 3.28084)
            if (ceilingM > maxAltM) {
                maxAltM = ceilingM
            }
        }
        const range = maxAltM - minElev
        return { scaleMin: minElev, scaleRange: range > 0 ? range : 1 }
    }, [minElev, maxElev, airspaces])
    
    // Calculate Y positions for the line (from center terrain elevation to 100m above highest elevation)
    const bottomElev = centerElevation
    const topElev = maxElev + 100  // 100m above highest terrain in cylinder
    
    const tBottom = Math.max(0, Math.min(1, (bottomElev - scaleMin) / scaleRange))
    const tTop = Math.max(0, Math.min(1, (topElev - scaleMin) / scaleRange))
    
    const yBottom = cylinderBottom + tBottom * cylinderHeight
    const yTop = cylinderBottom + tTop * cylinderHeight
    
    // V shape dimensions at the top
    const vSize = 0.08
    
    // Create line geometry for vertical line + V shape
    const linePoints = useMemo(() => {
        const points: [number, number, number][] = [
            // Vertical line
            [0, yBottom, 0],
            [0, yTop, 0],
        ]
        return points
    }, [yBottom, yTop])
    
    const vPoints = useMemo(() => {
        // V shape at the top
        return [
            [-vSize, yTop + vSize, 0],
            [0, yTop, 0],
            [vSize, yTop + vSize, 0],
        ] as [number, number, number][]
    }, [yTop, vSize])
    
    return (
        <group>
            {/* Vertical white line */}
            <Line 
                points={linePoints} 
                color="white" 
                lineWidth={2}
            />
            {/* V shape at top */}
            <Line 
                points={vPoints} 
                color="white" 
                lineWidth={2}
            />
        </group>
    )
}

// Elevation scale bar with Billboard labels - extends to include airspace ceilings
// Stays fixed on the left side of the view (counter-rotates with camera)
function ElevationScaleBar({ minElev, maxElev, airspaces = [] }: { minElev: number; maxElev: number; airspaces?: AirspaceData[] }) {
    const groupRef = useRef<Group>(null)
    const { camera } = useThree()
    
    const cylinderBottom = -2
    const cylinderTop = 2
    const cylinderHeight = cylinderTop - cylinderBottom
    
    // Distance from center for the scale bar
    const scaleBarRadius = 1.8
    
    // Update scale bar position each frame to stay on the left side of the view
    useFrame(() => {
        if (!groupRef.current) return
        
        // Get camera's horizontal angle (azimuth)
        const cameraX = camera.position.x
        const cameraZ = camera.position.z
        const cameraAngle = Math.atan2(cameraX, cameraZ)
        
        // Position the scale bar 90 degrees to the left of the camera's view
        const leftAngle = cameraAngle + Math.PI / 2
        const x = Math.sin(leftAngle) * scaleBarRadius
        const z = Math.cos(leftAngle) * scaleBarRadius
        
        groupRef.current.position.x = x
        groupRef.current.position.z = z
        
        // Rotate the scale bar to face the camera
        groupRef.current.rotation.y = cameraAngle
    })
    
    // Calculate the full altitude range including airspaces above and below terrain
    const { scaleMin, scaleMax } = useMemo(() => {
        let minAltM = minElev
        let maxAltM = maxElev
        
        // Find the lowest floor and highest ceiling
        for (const airspace of airspaces) {
            const floor = airspace.altitude?.floor || 0
            const ceiling = airspace.altitude?.ceiling || 18000
            const floorM = Math.round(floor / 3.28084)
            const ceilingM = Math.round(ceiling / 3.28084)
            if (floorM < minAltM) {
                minAltM = floorM
            }
            if (ceilingM > maxAltM) {
                maxAltM = ceilingM
            }
        }
        
        return { scaleMin: minAltM, scaleMax: maxAltM }
    }, [minElev, maxElev, airspaces])
    
    const scaleRange = scaleMax - scaleMin
    
    // Calculate scale marks
    const scaleMarks = useMemo(() => {
        const marks: { y: number; label: string; elevation: number; isTerrain: boolean }[] = []
        
        if (scaleRange <= 0) return marks
        
        // Add min elevation at bottom (terrain floor)
        marks.push({ 
            y: cylinderBottom, 
            label: `${Math.round(scaleMin)}m`,
            elevation: scaleMin,
            isTerrain: true
        })
        
        // Add terrain max elevation
        if (maxElev > scaleMin && maxElev < scaleMax) {
            const t = (maxElev - scaleMin) / scaleRange
            const y = cylinderBottom + t * cylinderHeight
            marks.push({ 
                y, 
                label: `${Math.round(maxElev)}m`,
                elevation: maxElev,
                isTerrain: true
            })
        }
        
        // Add intermediate marks at nice intervals
        const intervals = [100, 200, 500, 1000, 2000, 5000]
        let interval = 500
        for (const int of intervals) {
            if (scaleRange / int <= 8) {
                interval = int
                break
            }
        }
        
        const startElev = Math.ceil(scaleMin / interval) * interval
        for (let elev = startElev; elev < scaleMax; elev += interval) {
            // Skip if too close to existing marks
            const tooClose = marks.some(m => Math.abs(m.elevation - elev) < interval * 0.3)
            if (!tooClose && elev > scaleMin) {
                const t = (elev - scaleMin) / scaleRange
                const y = cylinderBottom + t * cylinderHeight
                marks.push({ y, label: `${Math.round(elev)}m`, elevation: elev, isTerrain: false })
            }
        }
        
        // Add max altitude at top
        marks.push({ 
            y: cylinderTop, 
            label: `${Math.round(scaleMax)}m`,
            elevation: scaleMax,
            isTerrain: false
        })
        
        return marks
    }, [scaleMin, scaleMax, scaleRange, maxElev])
    
    // Calculate airspace boundary notches (floor and ceiling in meters) with labels
    const airspaceNotches = useMemo(() => {
        const notches: { y: number; color: string; altM: number; label: string }[] = []
        
        if (scaleRange <= 0) return notches
        
        // Get unique altitude boundaries from airspaces
        const altitudes = new Map<number, string>() // altitude in meters -> color
        
        for (const airspace of airspaces) {
            const floor = airspace.altitude?.floor || 0
            const ceiling = airspace.altitude?.ceiling || 18000
            const color = getAirspaceColor(airspace.type)
            
            // Convert feet to meters
            const floorM = Math.round(floor / 3.28084)
            const ceilingM = Math.round(ceiling / 3.28084)
            
            // Add floor and ceiling notches
            if (floorM >= scaleMin && floorM <= scaleMax) {
                altitudes.set(floorM, color)
            }
            if (ceilingM >= scaleMin && ceilingM <= scaleMax) {
                altitudes.set(ceilingM, color)
            }
        }
        
        // Convert to notches with Y positions and labels
        for (const [altM, color] of altitudes) {
            const t = (altM - scaleMin) / scaleRange
            const y = cylinderBottom + t * cylinderHeight
            notches.push({ y, color, altM, label: `${altM}m` })
        }
        
        // Sort by altitude for consistent rendering
        notches.sort((a, b) => a.altM - b.altM)
        
        return notches
    }, [airspaces, scaleMin, scaleMax, scaleRange])
    
    const tickWidth = 0.1
    
    return (
        <group ref={groupRef}>
            {/* Main vertical line */}
            <Line
                points={[[0, cylinderBottom, 0], [0, cylinderTop, 0]]}
                color="#6b7280"
                lineWidth={2}
            />
            
            {/* Scale marks and Billboard labels */}
            {scaleMarks.map((mark, idx) => (
                <group key={idx} position={[0, mark.y, 0]}>
                    {/* Horizontal tick mark - green for terrain, gray for altitude */}
                    <Line
                        points={[[-tickWidth, 0, 0], [tickWidth, 0, 0]]}
                        color={mark.isTerrain ? "#22c55e" : "#6b7280"}
                        lineWidth={2}
                    />
                    
                    {/* Billboard elevation label */}
                    <Billboard position={[-0.25, 0, 0]} follow={true}>
                        <Text
                            fontSize={0.12}
                            color={mark.isTerrain ? "#166534" : "#374151"}
                            anchorX="right"
                            anchorY="middle"
                            outlineWidth={0.015}
                            outlineColor="#ffffff"
                        >
                            {mark.label}
                        </Text>
                    </Billboard>
                </group>
            ))}
            
            {/* Airspace boundary notches with labels on the right */}
            {airspaceNotches.map((notch, idx) => (
                <group key={`airspace-notch-${idx}`} position={[0, notch.y, 0]}>
                    {/* Colored tick mark for airspace boundary */}
                    <Line
                        points={[[tickWidth * 0.5, 0, 0], [tickWidth * 2.5, 0, 0]]}
                        color={notch.color}
                        lineWidth={3}
                    />
                    {/* Billboard label for airspace boundary on the right side */}
                    <Billboard position={[0.45, 0, 0]} follow={true}>
                        <Text
                            fontSize={0.1}
                            color={notch.color}
                            anchorX="left"
                            anchorY="middle"
                            outlineWidth={0.015}
                            outlineColor="#ffffff"
                        >
                            {notch.label}
                        </Text>
                    </Billboard>
                </group>
            ))}
            
            {/* Title label at top */}
            <Billboard position={[0, cylinderTop + 0.25, 0]} follow={true}>
                <Text
                    fontSize={0.1}
                    color="#374151"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.012}
                    outlineColor="#ffffff"
                    fontWeight="bold"
                >
                    Alt
                </Text>
            </Billboard>
        </group>
    )
}

// Format date string for display (compact format)
function formatAirspaceDate(dateStr: string | undefined): string | null {
    if (!dateStr) return null
    try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return null
        // Format as "Jan 23" or "Jan 23, 2026" if not current year
        const now = new Date()
        const month = date.toLocaleDateString('en-US', { month: 'short' })
        const day = date.getDate()
        if (date.getFullYear() === now.getFullYear()) {
            return `${month} ${day}`
        }
        return `${month} ${day}, ${date.getFullYear()}`
    } catch {
        return null
    }
}

// Get color for airspace type (same as air column graph)
function getAirspaceColor(type: string): string {
    const colors: Record<string, string> = {
        'TFR': '#ff0000', // Red
        'Restricted': '#d946ef', // Fuchsia/Purple
        'Prohibited': '#4b5563', // Grey/Slate
        'NOTAM': '#f97316', // Orange
        'Alert': '#eab308', // Yellow
        'Caution': '#fbbf24', // Amber
        'Class A': '#8b5cf6', // Violet
        'Class B': '#2563eb', // Blue
        'Class C': '#db2777', // Magenta/Pink
        'Class D': '#0ea5e9', // Sky Blue
        'Class E': '#6366f1', // Indigo
        'Class G': '#22c55e', // Green
        'Warning': '#ef4444', // Light Red
    }

    // Try to match partial names if exact match fails
    if (!colors[type]) {
        if (type.includes('Class B')) return colors['Class B']
        if (type.includes('Class C')) return colors['Class C']
        if (type.includes('Class D')) return colors['Class D']
        if (type.includes('Class E')) return colors['Class E']
        if (type.includes('Restricted')) return colors['Restricted']
    }

    return colors[type] || '#64748b' // Default slate
}

// Check if a point is inside an airspace (polygon or circle)
function pointInAirspaceLocal(
    lat: number, 
    lon: number, 
    airspace: AirspaceData
): boolean {
    // Check circle-based airspace
    if (airspace.coordinates && airspace.radius !== undefined) {
        const dLat = lat - airspace.coordinates.latitude
        const dLon = lon - airspace.coordinates.longitude
        // Convert to approximate distance (rough, good enough for visualization)
        const latKm = dLat * 111
        const lonKm = dLon * 111 * Math.cos(lat * Math.PI / 180)
        const distKm = Math.sqrt(latKm * latKm + lonKm * lonKm)
        const radiusKm = airspace.radius * 1.852 // NM to km
        return distKm <= radiusKm
    }
    
    // Check polygon-based airspace
    if (airspace.polygon && airspace.polygon.length >= 3) {
        let inside = false
        const polygon = airspace.polygon
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].longitude
            const yi = polygon[i].latitude
            const xj = polygon[j].longitude
            const yj = polygon[j].latitude
            
            const intersect = ((yi > lat) !== (yj > lat)) &&
                (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)
            
            if (intersect) inside = !inside
        }
        return inside
    }
    
    return false
}

// Render airspace volumes showing only the intersection with the search circle
function AirspaceVolumes({ 
    airspaces, 
    minElev,
    maxElev,
    clickedPoint,
    radiusKm
}: { 
    airspaces: AirspaceData[], 
    minElev: number,
    maxElev: number,
    clickedPoint: { lat: number; lon: number },
    radiusKm: number
}) {
    // Debug logging
    useEffect(() => {
        console.log('[AirspaceVolumes] Received', airspaces.length, 'airspaces')
        airspaces.forEach((a, i) => {
            console.log(`  [${i}] ${a.type}: floor=${a.altitude?.floor}, ceiling=${a.altitude?.ceiling}`)
        })
    }, [airspaces])
    
    // Cylinder dimensions match main cylinder
    const cylinderRadius = 1.5
    const cylinderBottom = -2
    const cylinderTop = 2
    const cylinderHeight = cylinderTop - cylinderBottom
    
    // Calculate the scale range including airspace floors and ceilings
    // Extend range to show airspaces even if they're below terrain
    const { scaleMin, scaleMax, scaleRange } = useMemo(() => {
        // Find the lowest airspace floor and highest ceiling (convert feet to meters)
        let minAltM = minElev
        let maxAltM = maxElev
        for (const airspace of airspaces) {
            const floor = airspace.altitude?.floor || 0
            const ceiling = airspace.altitude?.ceiling || 18000
            const floorM = Math.round(floor / 3.28084)
            const ceilingM = Math.round(ceiling / 3.28084)
            if (floorM < minAltM) {
                minAltM = floorM
            }
            if (ceilingM > maxAltM) {
                maxAltM = ceilingM
            }
        }
        
        const range = maxAltM - minAltM
        return { scaleMin: minAltM, scaleMax: maxAltM, scaleRange: range > 0 ? range : 1 }
    }, [minElev, maxElev, airspaces])
    
    // Convert cylinder local coordinates to lat/lon
    const localToLatLon = (x: number, z: number): { lat: number; lon: number } => {
        // x and z are in cylinder units (-1.5 to 1.5)
        // Map to km offset from center, then to lat/lon
        const kmPerUnit = radiusKm / cylinderRadius
        const offsetKmX = x * kmPerUnit  // East-West
        const offsetKmZ = -z * kmPerUnit // North-South (z is inverted)
        
        const lat = clickedPoint.lat + offsetKmZ / 111
        const lon = clickedPoint.lon + offsetKmX / (111 * Math.cos(clickedPoint.lat * Math.PI / 180))
        
        return { lat, lon }
    }
    
    // Generate intersection geometry for each airspace using polar coordinates for smooth edges
    const airspaceGeometries = useMemo(() => {
        const angularSegments = 64 // Higher for smoother circular edges
        const radialSegments = 24 // More radial divisions for smoother boundaries
        
        // Convert altitude (in feet) to Y position - defined inside useMemo to capture values
        // Uses linear mapping: scaleMin (meters) -> cylinderBottom, scaleMax (meters) -> cylinderTop
        // Allow airspaces to extend below terrain level
        const altToY = (altFt: number): number => {
            const altM = altFt / 3.28084  // Convert feet to meters
            
            // Linear mapping without clamping to allow low airspaces
            const t = (altM - scaleMin) / scaleRange
            return cylinderBottom + t * cylinderHeight
        }
        
        return airspaces.map(airspace => {
            const floor = airspace.altitude?.floor || 0
            const ceiling = airspace.altitude?.ceiling || 18000
            const color = getAirspaceColor(airspace.type)
            
            const yFloor = altToY(floor)
            const yCeiling = altToY(ceiling)
            const height = yCeiling - yFloor
            
            if (height < 0.01) return null
            
            // Create a polar grid and check which cells are inside the airspace
            // insideGrid[r][a] = true if the cell at radius r, angle a is inside
            const insideGrid: boolean[][] = []
            const maxRadius = cylinderRadius * 0.98
            
            for (let r = 0; r <= radialSegments; r++) {
                insideGrid[r] = []
                const radius = (r / radialSegments) * maxRadius
                for (let a = 0; a < angularSegments; a++) {
                    const angle = (a / angularSegments) * Math.PI * 2
                    const x = Math.cos(angle) * radius
                    const z = Math.sin(angle) * radius
                    
                    const { lat, lon } = localToLatLon(x, z)
                    insideGrid[r][a] = pointInAirspaceLocal(lat, lon, airspace)
                }
            }
            
            // Check if any cells are inside
            let hasInside = false
            for (let r = 0; r <= radialSegments && !hasInside; r++) {
                for (let a = 0; a < angularSegments && !hasInside; a++) {
                    if (insideGrid[r][a]) hasInside = true
                }
            }
            if (!hasInside) return null
            
            const vertices: number[] = []
            const indices: number[] = []
            
            // Helper to get vertex position
            const getPos = (r: number, a: number): [number, number] => {
                const radius = (r / radialSegments) * maxRadius
                const angle = (a / angularSegments) * Math.PI * 2
                return [Math.cos(angle) * radius, Math.sin(angle) * radius]
            }
            
            // Helper to add a quad (two triangles) with wall
            const addCell = (r: number, a: number) => {
                const a2 = (a + 1) % angularSegments
                const [x0, z0] = getPos(r, a)
                const [x1, z1] = getPos(r, a2)
                const [x2, z2] = getPos(r + 1, a2)
                const [x3, z3] = getPos(r + 1, a)
                
                // Bottom face
                const baseIdx = vertices.length / 3
                vertices.push(x0, yFloor, z0)
                vertices.push(x1, yFloor, z1)
                vertices.push(x2, yFloor, z2)
                vertices.push(x3, yFloor, z3)
                indices.push(baseIdx, baseIdx + 1, baseIdx + 2)
                indices.push(baseIdx, baseIdx + 2, baseIdx + 3)
                
                // Top face
                const topIdx = vertices.length / 3
                vertices.push(x0, yCeiling, z0)
                vertices.push(x1, yCeiling, z1)
                vertices.push(x2, yCeiling, z2)
                vertices.push(x3, yCeiling, z3)
                indices.push(topIdx, topIdx + 2, topIdx + 1)
                indices.push(topIdx, topIdx + 3, topIdx + 2)
            }
            
            // Helper to add a wall segment between two points
            const addWall = (x0: number, z0: number, x1: number, z1: number) => {
                const wallIdx = vertices.length / 3
                vertices.push(x0, yFloor, z0)
                vertices.push(x1, yFloor, z1)
                vertices.push(x1, yCeiling, z1)
                vertices.push(x0, yCeiling, z0)
                indices.push(wallIdx, wallIdx + 1, wallIdx + 2)
                indices.push(wallIdx, wallIdx + 2, wallIdx + 3)
            }
            
            // Build geometry from polar grid
            for (let r = 0; r < radialSegments; r++) {
                for (let a = 0; a < angularSegments; a++) {
                    // Check if this cell should be rendered (center point inside)
                    const rMid = r + 0.5
                    const aMid = a + 0.5
                    const [cx, cz] = [
                        Math.cos((aMid / angularSegments) * Math.PI * 2) * (rMid / radialSegments) * maxRadius,
                        Math.sin((aMid / angularSegments) * Math.PI * 2) * (rMid / radialSegments) * maxRadius
                    ]
                    const { lat, lon } = localToLatLon(cx, cz)
                    const cellInside = pointInAirspaceLocal(lat, lon, airspace)
                    
                    if (!cellInside) continue
                    
                    // Add the cell
                    addCell(r, a)
                    
                    // Check neighbors and add walls at boundaries
                    const a2 = (a + 1) % angularSegments
                    const aPrev = (a - 1 + angularSegments) % angularSegments
                    
                    // Check inner neighbor (r-1)
                    if (r > 0) {
                        const [ncx, ncz] = [
                            Math.cos(((a + 0.5) / angularSegments) * Math.PI * 2) * ((r - 0.5) / radialSegments) * maxRadius,
                            Math.sin(((a + 0.5) / angularSegments) * Math.PI * 2) * ((r - 0.5) / radialSegments) * maxRadius
                        ]
                        const nll = localToLatLon(ncx, ncz)
                        if (!pointInAirspaceLocal(nll.lat, nll.lon, airspace)) {
                            const [wx0, wz0] = getPos(r, a)
                            const [wx1, wz1] = getPos(r, a2)
                            addWall(wx1, wz1, wx0, wz0) // Reversed for correct facing
                        }
                    } else {
                        // Inner edge at center - add wall
                        const [wx0, wz0] = getPos(r, a)
                        const [wx1, wz1] = getPos(r, a2)
                        if (Math.abs(wx0) > 0.01 || Math.abs(wz0) > 0.01) {
                            addWall(wx1, wz1, wx0, wz0)
                        }
                    }
                    
                    // Check outer neighbor (r+1)
                    if (r < radialSegments - 1) {
                        const [ncx, ncz] = [
                            Math.cos(((a + 0.5) / angularSegments) * Math.PI * 2) * ((r + 1.5) / radialSegments) * maxRadius,
                            Math.sin(((a + 0.5) / angularSegments) * Math.PI * 2) * ((r + 1.5) / radialSegments) * maxRadius
                        ]
                        const nll = localToLatLon(ncx, ncz)
                        if (!pointInAirspaceLocal(nll.lat, nll.lon, airspace)) {
                            const [wx0, wz0] = getPos(r + 1, a)
                            const [wx1, wz1] = getPos(r + 1, a2)
                            addWall(wx0, wz0, wx1, wz1)
                        }
                    } else {
                        // Outer edge at cylinder boundary - add wall
                        const [wx0, wz0] = getPos(r + 1, a)
                        const [wx1, wz1] = getPos(r + 1, a2)
                        addWall(wx0, wz0, wx1, wz1)
                    }
                    
                    // Check angular neighbors
                    // Previous angle neighbor
                    const [pcx, pcz] = [
                        Math.cos(((aPrev + 0.5) / angularSegments) * Math.PI * 2) * (rMid / radialSegments) * maxRadius,
                        Math.sin(((aPrev + 0.5) / angularSegments) * Math.PI * 2) * (rMid / radialSegments) * maxRadius
                    ]
                    const pll = localToLatLon(pcx, pcz)
                    if (!pointInAirspaceLocal(pll.lat, pll.lon, airspace)) {
                        const [wx0, wz0] = getPos(r, a)
                        const [wx1, wz1] = getPos(r + 1, a)
                        addWall(wx0, wz0, wx1, wz1)
                    }
                    
                    // Next angle neighbor
                    const [ncx2, ncz2] = [
                        Math.cos(((a2 + 0.5) / angularSegments) * Math.PI * 2) * (rMid / radialSegments) * maxRadius,
                        Math.sin(((a2 + 0.5) / angularSegments) * Math.PI * 2) * (rMid / radialSegments) * maxRadius
                    ]
                    const nll2 = localToLatLon(ncx2, ncz2)
                    if (!pointInAirspaceLocal(nll2.lat, nll2.lon, airspace)) {
                        const [wx0, wz0] = getPos(r, a2)
                        const [wx1, wz1] = getPos(r + 1, a2)
                        addWall(wx1, wz1, wx0, wz0) // Reversed for correct facing
                    }
                }
            }
            
            if (vertices.length === 0) return null
            
            // Create BufferGeometry
            const geometry = new BufferGeometry()
            geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
            geometry.setIndex(indices)
            geometry.computeVertexNormals()
            
            // Find center of the airspace intersection for connector line
            let sumX = 0, sumZ = 0, count = 0
            for (let i = 0; i < vertices.length; i += 3) {
                sumX += vertices[i]
                sumZ += vertices[i + 2]
                count++
            }
            const centerX = count > 0 ? sumX / count : 0
            const centerZ = count > 0 ? sumZ / count : 0
            const centerY = (yFloor + yCeiling) / 2
            
            // Calculate external label position (outside cylinder)
            // Direction from center to airspace center, extended beyond cylinder
            const dist = Math.sqrt(centerX * centerX + centerZ * centerZ)
            const dirX = dist > 0.01 ? centerX / dist : 1
            const dirZ = dist > 0.01 ? centerZ / dist : 0
            const labelRadius = cylinderRadius * 1.8 // Position labels outside cylinder
            const externalLabelX = dirX * labelRadius
            const externalLabelZ = dirZ * labelRadius
            
            return {
                geometry,
                color,
                yFloor,
                yCeiling,
                height,
                type: airspace.type,
                airspaceCenter: [centerX, centerY, centerZ] as [number, number, number],
                externalLabelPosition: [externalLabelX, centerY, externalLabelZ] as [number, number, number],
                id: airspace.id
            }
        }).filter(Boolean)
    }, [airspaces, clickedPoint, radiusKm, cylinderRadius, scaleMin, scaleRange, localToLatLon])
    
    // Group airspaces by type and compute fixed label positions on the right side
    // Labels are ordered by average altitude (highest at top) to minimize line crossings
    const typeLabels = useMemo(() => {
        const typeMap = new Map<string, { 
            color: string, 
            airspaceCenters: [number, number, number][],
            avgY: number
        }>()
        
        for (const data of airspaceGeometries) {
            if (!data) continue
            if (!typeMap.has(data.type)) {
                typeMap.set(data.type, { color: data.color, airspaceCenters: [], avgY: 0 })
            }
            typeMap.get(data.type)!.airspaceCenters.push(data.airspaceCenter)
        }
        
        // Calculate average Y position for each type
        for (const [, data] of typeMap) {
            if (data.airspaceCenters.length > 0) {
                const sumY = data.airspaceCenters.reduce((sum, center) => sum + center[1], 0)
                data.avgY = sumY / data.airspaceCenters.length
            }
        }
        
        // Sort types by average altitude (highest first)
        const sortedTypes = Array.from(typeMap.keys()).sort((a, b) => {
            return typeMap.get(b)!.avgY - typeMap.get(a)!.avgY
        })
        
        // Create fixed label positions on the right side, stacked vertically
        const labels: Array<{
            type: string
            color: string
            labelPosition: [number, number, number]
            airspaceCenters: [number, number, number][]
        }> = []
        
        const labelSpacing = 0.5 // Vertical spacing between labels
        const startY = (sortedTypes.length - 1) * labelSpacing / 2 // Center the stack vertically
        const labelX = 2.5 // Fixed X position to the right of cylinder
        
        sortedTypes.forEach((type, idx) => {
            const data = typeMap.get(type)!
            labels.push({
                type,
                color: data.color,
                labelPosition: [labelX, startY - idx * labelSpacing, 0],
                airspaceCenters: data.airspaceCenters
            })
        })
        
        return labels
    }, [airspaceGeometries])
    
    return (
        <group>
            {/* Render all airspace meshes */}
            {airspaceGeometries.map((data, idx) => {
                if (!data) return null
                
                // Use stencil buffer to prevent color stacking within same airspace type
                const stencilRef = (idx % 255) + 1 // Unique stencil ref per geometry
                return (
                    <mesh key={data.id || idx} geometry={data.geometry} renderOrder={idx + 1}>
                        <meshBasicMaterial 
                            color={data.color} 
                            transparent 
                            opacity={0.35} 
                            side={DoubleSide}
                            depthWrite={false}
                            stencilWrite={true}
                            stencilRef={stencilRef}
                            stencilFunc={NotEqualStencilFunc}
                            stencilZPass={IncrementStencilOp}
                        />
        </mesh>
    )
            })}
        </group>
    )
}

// Get thermal color based on intensity (0-1)
// Strong thermals (high intensity) = deep orange/red
// Weak thermals (low intensity) = pale yellow
function getThermalColor(intensity: number): { core: string; inner: string; outer: string; glow: string } {
    // Clamp intensity between 0 and 1
    const t = Math.max(0, Math.min(1, intensity))
    
    // Deep orange (strong) to pale yellow (weak)
    // Strong: #ff4500 (orangered) -> #ff8c00 (darkorange) -> #ffd700 (gold) -> #ffeb99 (pale yellow)
    
    if (t > 0.7) {
        // Strong thermal - deep orange to red-orange
        return {
            core: '#ff4500',   // OrangeRed
            inner: '#ff6600',
            outer: '#ff8c00',
            glow: '#ffaa33'
        }
    } else if (t > 0.4) {
        // Medium thermal - orange
        return {
            core: '#ff8c00',   // DarkOrange
            inner: '#ffa500',
            outer: '#ffb833',
            glow: '#ffcc66'
        }
    } else if (t > 0.2) {
        // Weak thermal - gold/yellow-orange
        return {
            core: '#ffc000',   // Gold-orange
            inner: '#ffd700',
            outer: '#ffe066',
            glow: '#ffeb99'
        }
    } else {
        // Very weak thermal - pale yellow
        return {
            core: '#ffd700',   // Gold
            inner: '#ffe066',
            outer: '#ffeb99',
            glow: '#fff5cc'
        }
    }
}

// Thermal Hotspots - glowing cylinders colored by intensity
function ThermalHotspots({ hotspots }: { hotspots: ThermalHotspot[] }) {
    if (hotspots.length === 0) return null
    
    const cylinderHeight = 4  // Full height of the cylinder (from -2 to 2)
    
    // Group hotspots by intensity category for labeling
    const labelData = useMemo(() => {
        if (hotspots.length === 0) return null
        
        // Find the strongest hotspot for the label connection
        const strongestHotspot = hotspots.reduce((best, h) => 
            h.intensity > best.intensity ? h : best, hotspots[0])
        
        // Calculate average intensity for label text
        const avgIntensity = hotspots.reduce((sum, h) => sum + h.intensity, 0) / hotspots.length
        
        // Determine label text based on intensity
        let labelText = 'Thermals'
        if (avgIntensity > 0.7) {
            labelText = 'Strong Thermals'
        } else if (avgIntensity > 0.4) {
            labelText = 'Thermals'
        } else {
            labelText = 'Weak Thermals'
        }
        
        const colors = getThermalColor(avgIntensity)
        
        return {
            text: labelText,
            count: hotspots.length,
            color: colors.core,
            connectionPoint: [strongestHotspot.x, 0, strongestHotspot.z] as [number, number, number],
            labelPosition: [-2.5, 0, 0] as [number, number, number]  // Left side of cylinder
        }
    }, [hotspots])
    
    return (
        <group>
            {/* Render thermal cylinders */}
            {hotspots.map((hotspot, idx) => {
                // Scale the hotspot radius based on intensity (0.04 to 0.12)
                const hotspotRadius = 0.04 + hotspot.intensity * 0.08
                
                // Get colors based on intensity
                const colors = getThermalColor(hotspot.intensity)
                
                // Opacity also scales with intensity (stronger = more visible)
                const baseOpacity = 0.3 + hotspot.intensity * 0.4
                
                // Create glowing effect with multiple layered cylinders
                return (
                    <group key={idx} position={[hotspot.x, 0, hotspot.z]}>
                        {/* Core cylinder */}
                        <mesh>
                            <cylinderGeometry args={[hotspotRadius, hotspotRadius, cylinderHeight, 16, 1, true]} />
                            <meshBasicMaterial 
                                color={colors.core}
                                transparent
                                opacity={baseOpacity}
                                depthWrite={false}
                            />
                        </mesh>
                        
                        {/* Inner glow layer */}
                        <mesh>
                            <cylinderGeometry args={[hotspotRadius * 1.5, hotspotRadius * 1.5, cylinderHeight, 16, 1, true]} />
                            <meshBasicMaterial 
                                color={colors.inner}
                                transparent
                                opacity={baseOpacity * 0.5}
                                depthWrite={false}
                            />
                        </mesh>
                        
                        {/* Outer glow layer */}
                        <mesh>
                            <cylinderGeometry args={[hotspotRadius * 2.5, hotspotRadius * 2.5, cylinderHeight, 16, 1, true]} />
                            <meshBasicMaterial 
                                color={colors.outer}
                                transparent
                                opacity={baseOpacity * 0.25}
                                depthWrite={false}
                            />
                        </mesh>
                        
                        {/* Very outer diffuse glow */}
                        <mesh>
                            <cylinderGeometry args={[hotspotRadius * 4, hotspotRadius * 4, cylinderHeight, 16, 1, true]} />
                            <meshBasicMaterial 
                                color={colors.glow}
                                transparent
                                opacity={baseOpacity * 0.12}
                                depthWrite={false}
                            />
                        </mesh>
                        
                        {/* Top and bottom caps for visual grounding */}
                        <mesh position={[0, cylinderHeight / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
                            <circleGeometry args={[hotspotRadius * 1.5, 16]} />
                            <meshBasicMaterial 
                                color={colors.inner}
                                transparent
                                opacity={baseOpacity * 0.6}
                                depthWrite={false}
                            />
                        </mesh>
                        <mesh position={[0, -cylinderHeight / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                            <circleGeometry args={[hotspotRadius * 1.5, 16]} />
                            <meshBasicMaterial 
                                color={colors.core}
                                transparent
                                opacity={baseOpacity * 0.7}
                                depthWrite={false}
                            />
                        </mesh>
                    </group>
                )
            })}
        </group>
    )
}

// Central altitude scale - vertical line with graduation marks at airspace boundaries
function CentralAltitudeScale({ minAlt = 0, maxAlt = 18000, airspaces = [] }: { 
    minAlt?: number, 
    maxAlt?: number,
    airspaces?: AirspaceData[]
}) {
    // Cylinder goes from y=-2 (bottom) to y=2 (top), total height = 4
    const cylinderBottom = -2
    const cylinderTop = 2
    const cylinderHeight = cylinderTop - cylinderBottom
    
    // Extract unique altitude boundaries from airspaces
    const scaleLabels = useMemo(() => {
        const altitudes = new Set<number>()
        
        // Always include ground level
        altitudes.add(0)
        
        // Add floor and ceiling of each airspace
        for (const airspace of airspaces) {
            if (airspace.altitude?.floor !== undefined) {
                altitudes.add(airspace.altitude.floor)
            }
            if (airspace.altitude?.ceiling !== undefined) {
                altitudes.add(airspace.altitude.ceiling)
            }
        }
        
        // Convert to sorted array
        return Array.from(altitudes).sort((a, b) => a - b)
    }, [airspaces])
    
    // Convert altitude to Y position
    const altToY = (alt: number): number => {
        const t = (alt - minAlt) / (maxAlt - minAlt)
        return cylinderBottom + t * cylinderHeight
    }
    
    // Main vertical line points
    const linePoints: [number, number, number][] = [
        [0, cylinderBottom, 0],
        [0, cylinderTop, 0]
    ]
    
    // Tick mark width
    const tickWidth = 0.08
    
    return (
        <group>
            {/* Main vertical line */}
            <Line
                points={linePoints}
                color="#1e3a5f"
                lineWidth={3}
            />
            
            {/* Graduation marks and labels */}
            {scaleLabels.map((alt, idx) => {
                const y = altToY(alt)
                
                return (
                    <group key={idx} position={[0, y, 0]}>
                        {/* Horizontal tick mark */}
                        <Line
                            points={[
                                [-tickWidth * 1.5, 0, 0],
                                [tickWidth * 1.5, 0, 0]
                            ]}
                            color="#1e3a5f"
                            lineWidth={2}
                        />
                        
                        {/* Altitude label - static HTML for visibility */}
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
                                {Math.round(alt * 0.3048)}
                            </div>
                        </Html>
                    </group>
                )
            })}
            
            {/* "m" unit label at top - static HTML */}
            <Html
                position={[-0.3, cylinderTop + 0.2, 0]}
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

export default function AirspaceCylinder({ clickedPoint, radiusKm = 1, onElevationCellsChange, hasAirspace = false, airspacesAtPoint = [], isExpanded = false, onToggleExpand, selectedBasemap = 'topographic' }: AirspaceCylinderProps) {
    const [mounted, setMounted] = useState(false)
    const [elevationCells, setElevationCells] = useState<ElevationCell[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [minElev, setMinElev] = useState(0)
    const [maxElev, setMaxElev] = useState(100)
    const [thermalHotspots, setThermalHotspots] = useState<ThermalHotspot[]>([])
    const [currentGridSize, setCurrentGridSize] = useState(6)
    const [cellColors, setCellColors] = useState<Record<string, [number, number, number]>>({})

    // Calculate the center elevation (elevation at the clicked point, which is x=0, z=0)
    const centerElevation = useMemo(() => {
        if (elevationCells.length === 0) return minElev
        
        // Find the cell closest to the center (0, 0)
        let closestCell = elevationCells[0]
        let closestDist = Math.sqrt(closestCell.x ** 2 + closestCell.z ** 2)
        
        for (const cell of elevationCells) {
            const dist = Math.sqrt(cell.x ** 2 + cell.z ** 2)
            if (dist < closestDist) {
                closestDist = dist
                closestCell = cell
            }
        }
        
        return closestCell.elevation ?? minElev
    }, [elevationCells, minElev])

    // Debug logging
    useEffect(() => {
        console.log('[AirspaceCylinder] Props received:', {
            clickedPoint,
            radiusKm,
            hasAirspace,
            airspacesAtPointCount: airspacesAtPoint.length,
            isExpanded
        })
    }, [clickedPoint, radiusKm, hasAirspace, airspacesAtPoint, isExpanded])

    useEffect(() => {
        setMounted(true)
    }, [])

    // Fetch elevation data when clickedPoint changes
    useEffect(() => {
        if (!clickedPoint) {
            setElevationCells([])
            return
        }

        const fetchElevationGrid = async () => {
            setIsLoading(true)
            
            // Calculate grid size based on 500m cells
            // Diameter in km = radiusKm * 2
            // Number of cells = diameter / 0.5km (500m)
            const cellSizeKm = 0.5  // 500m cells
            const diameterKm = radiusKm * 2
            const gridSize = Math.max(4, Math.ceil(diameterKm / cellSizeKm))  // Minimum 4x4 grid
            
            // Limit grid size to prevent API overload (max ~400 cells = 20x20)
            const cappedGridSize = Math.min(gridSize, 20)
            setCurrentGridSize(cappedGridSize)
            
            const cylinderRadius = 1.5
            const cellSize = 3 / cappedGridSize  // Size in 3D units
            
            // Convert km to degrees (approximate)
            const kmToDegLat = 1 / 111
            const kmToDegLon = 1 / (111 * Math.cos(clickedPoint.lat * Math.PI / 180))
            
            console.log(`[AirspaceCylinder] Grid: ${cappedGridSize}x${cappedGridSize} for ${radiusKm}km radius (${cellSizeKm}km cells)`)
            
            // Generate grid cell centers and their corresponding lat/lon
            const cellRequests: { x: number; z: number; lat: number; lon: number }[] = []
            
            for (let i = 0; i < cappedGridSize; i++) {
                for (let j = 0; j < cappedGridSize; j++) {
                    // Cell center in 3D space (-1.5 to 1.5)
                    const x = -cylinderRadius + cellSize / 2 + i * cellSize
                    const z = -cylinderRadius + cellSize / 2 + j * cellSize
                    
                    // Skip cells outside the circle
                    const dist = Math.sqrt(x * x + z * z)
                    if (dist > cylinderRadius + cellSize / 2) continue
                    
                    // Convert to lat/lon
                    // x corresponds to longitude offset (east/west)
                    // -z corresponds to latitude offset (north is -z on cylinder, +lat on map)
                    const latOffset = (-z / cylinderRadius) * radiusKm * kmToDegLat
                    const lonOffset = (x / cylinderRadius) * radiusKm * kmToDegLon
                    
                    cellRequests.push({
                        x,
                        z,
                        lat: clickedPoint.lat + latOffset,
                        lon: clickedPoint.lon + lonOffset
                    })
                }
            }

            console.log('[AirspaceCylinder] Fetching elevation for', cellRequests.length, 'cells')
            console.log('[AirspaceCylinder] Center point:', clickedPoint.lat, clickedPoint.lon)
            console.log('[AirspaceCylinder] Sample cell coords:', cellRequests.slice(0, 3).map(c => `(${c.lat.toFixed(4)}, ${c.lon.toFixed(4)})`))

            // Immediately show grey placeholder cells while loading
            const placeholderCells: ElevationCell[] = cellRequests.map(c => ({
                x: c.x,
                z: c.z,
                lat: c.lat,
                lon: c.lon,
                elevation: null  // null indicates loading
            }))
            setElevationCells(placeholderCells)
            
            // Notify parent of placeholder cells
            if (onElevationCellsChange) {
                onElevationCellsChange(
                    placeholderCells.map(c => ({ lat: c.lat, lon: c.lon, elevation: c.elevation })),
                    0, 0
                )
            }

            try {
                // Use local elevation API which has better error handling
                const points = cellRequests.map(c => ({ lat: c.lat, lon: c.lon }))
                
                const response = await fetch('/api/elevation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ points })
                })
                
                if (!response.ok) {
                    throw new Error(`API returned ${response.status}: ${response.statusText}`)
                }
                
                const data = await response.json()
                console.log('[AirspaceCylinder] API response received, results count:', data?.results?.length)
                
                // API returns { results: [{ elevation: number }, ...] }
                const results = data?.results
                if (results && results.length > 0) {
                    // Verify results count matches request count
                    if (results.length !== cellRequests.length) {
                        console.error(`[AirspaceCylinder] MISMATCH: Requested ${cellRequests.length} points, got ${results.length} results!`)
                    }
                    
                    // First pass: collect valid elevations and calculate average
                    let validSum = 0
                    let validCount = 0
                    let min = Infinity
                    let max = -Infinity
                    
                    for (let i = 0; i < results.length; i++) {
                        const result = results[i]
                        const elev = result?.elevation
                        if (typeof elev === 'number' && elev !== null) {
                            validSum += elev
                            validCount++
                            if (elev < min) min = elev
                            if (elev > max) max = elev
                        }
                    }
                    
                    // Use average elevation for cells that failed to fetch (avoids blue "ocean" for mountains)
                    const avgElev = validCount > 0 ? validSum / validCount : 0
                    
                    // Second pass: build cells with fallback to average
                    const cells: ElevationCell[] = []
                    let oceanCount = 0
                    let negativeCount = 0
                    let nullCount = 0
                    
                    for (let i = 0; i < results.length; i++) {
                        const result = results[i]
                        const elev = result?.elevation
                        const hasElevation = typeof elev === 'number' && elev !== null
                        // Use average elevation for failed cells instead of 0
                        const elevValue = hasElevation ? elev : avgElev
                        
                        // Track suspicious values
                        if (!hasElevation) nullCount++
                        if (elevValue <= 0) oceanCount++
                        if (elevValue < 0) negativeCount++
                        
                        cells.push({
                            x: cellRequests[i].x,
                            z: cellRequests[i].z,
                            lat: cellRequests[i].lat,
                            lon: cellRequests[i].lon,
                            elevation: elevValue
                        })
                    }
                    
                    console.log('[AirspaceCylinder] Valid elevation count:', validCount, '/', results.length)
                    console.log('[AirspaceCylinder] Null/failed cells:', nullCount, '(using avg:', avgElev.toFixed(0), 'm)')
                    console.log('[AirspaceCylinder] Elevation range:', min, 'to', max, 'meters')
                    console.log('[AirspaceCylinder] Ocean/zero cells:', oceanCount, ', Negative cells:', negativeCount)
                    
                    // Log a few sample cells to verify lat/lon -> elevation mapping
                    const centerCell = cells.find(c => Math.abs(c.x) < 0.3 && Math.abs(c.z) < 0.3)
                    if (centerCell) {
                        console.log(`[AirspaceCylinder] Center cell: (${centerCell.lat.toFixed(5)}, ${centerCell.lon.toFixed(5)}) = ${centerCell.elevation}m`)
                    }
                    const edgeCells = cells.filter(c => Math.sqrt(c.x*c.x + c.z*c.z) > 1.2).slice(0, 3)
                    edgeCells.forEach((c, i) => {
                        console.log(`[AirspaceCylinder] Edge cell ${i}: (${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}) = ${c.elevation}m`)
                    })
                    
                    if (validCount > 0) {
                        setMinElev(min)
                        setMaxElev(max)
                    } else {
                        setMinElev(0)
                        setMaxElev(100)
                    }
                    setElevationCells(cells)
                    
                    // Notify parent of cells
                    if (onElevationCellsChange) {
                        onElevationCellsChange(
                            cells.map(c => ({ lat: c.lat, lon: c.lon, elevation: c.elevation })),
                            min === Infinity ? 0 : min,
                            max === -Infinity ? 100 : max
                        )
                    }
                } else {
                    console.warn('[AirspaceCylinder] No results in API response, using fallback')
                    // Still show something even if no elevation data
                    const fallbackCells: ElevationCell[] = cellRequests.map(c => ({
                        x: c.x,
                        z: c.z,
                        lat: c.lat,
                        lon: c.lon,
                        elevation: 0
                    }))
                    setElevationCells(fallbackCells)
                    setMinElev(0)
                    setMaxElev(100)
                }
            } catch (err) {
                console.error('[AirspaceCylinder] Failed to fetch elevation:', err)
                // Keep placeholder cells but mark them with 0 elevation so the view still works
                const fallbackCells: ElevationCell[] = cellRequests.map(c => ({
                    x: c.x,
                    z: c.z,
                    lat: c.lat,
                    lon: c.lon,
                    elevation: 0  // Use 0 instead of null for failed requests
                }))
                setElevationCells(fallbackCells)
                setMinElev(0)
                setMaxElev(100)
            } finally {
                setIsLoading(false)
            }
        }

        fetchElevationGrid()
    }, [clickedPoint?.lat, clickedPoint?.lon, radiusKm])

    // Fetch basemap colors for cells - TEMPORARILY DISABLED FOR DEBUGGING
    useEffect(() => {
        if (!clickedPoint || elevationCells.length === 0) {
            return
        }

        // Skip basemap color fetching for now to test if Canvas renders
        console.log('[AirspaceCylinder] Basemap color fetching disabled for debugging')
        return

        const fetchBasemapColors = async () => {
            const tileUrlTemplate = BASEMAP_URLS[selectedBasemap] || BASEMAP_URLS['topographic']
            
            // Determine zoom level based on radius (higher zoom = more detail)
            const zoom = radiusKm <= 1 ? 15 : radiusKm <= 2 ? 14 : radiusKm <= 5 ? 13 : 12
            
            console.log(`[AirspaceCylinder] Fetching basemap colors from ${selectedBasemap} at zoom ${zoom}`)
            
            // Group cells by their tile coordinates
            const tileToPixels: Map<string, { x: number; y: number; cells: { lat: number; lon: number; pixelX: number; pixelY: number }[] }> = new Map()
            
            for (const cell of elevationCells) {
                const tileInfo = latLonToTile(cell.lat, cell.lon, zoom)
                const tileKey = `${tileInfo.x},${tileInfo.y}`
                
                if (!tileToPixels.has(tileKey)) {
                    tileToPixels.set(tileKey, { x: tileInfo.x, y: tileInfo.y, cells: [] })
                }
                tileToPixels.get(tileKey)!.cells.push({
                    lat: cell.lat,
                    lon: cell.lon,
                    pixelX: tileInfo.pixelX,
                    pixelY: tileInfo.pixelY
                })
            }
            
            console.log(`[AirspaceCylinder] Need to fetch ${tileToPixels.size} tiles`)
            
            const newColors: Record<string, [number, number, number]> = {}
            
            // Fetch each tile and sample colors
            const tilePromises = Array.from(tileToPixels.entries()).map(async ([tileKey, tileData]) => {
                const tileUrl = tileUrlTemplate
                    .replace('{z}', zoom.toString())
                    .replace('{x}', tileData.x.toString())
                    .replace('{y}', tileData.y.toString())
                    .replace('{r}', '')  // For retina tiles
                
                try {
                    const img = new Image()
                    img.crossOrigin = 'anonymous'
                    
                    await new Promise<void>((resolve, reject) => {
                        img.onload = () => resolve()
                        img.onerror = (e) => reject(e)
                        img.src = tileUrl
                    })
                    
                    // Draw to canvas to read pixels
                    const canvas = document.createElement('canvas')
                    canvas.width = 256
                    canvas.height = 256
                    const ctx = canvas.getContext('2d')
                    if (!ctx) return
                    
                    ctx.drawImage(img, 0, 0)
                    
                    // Sample color for each cell in this tile
                    for (const cellInfo of tileData.cells) {
                        const px = Math.min(255, Math.max(0, cellInfo.pixelX))
                        const py = Math.min(255, Math.max(0, cellInfo.pixelY))
                        
                        // Sample a small area around the pixel to get dominant color
                        const sampleSize = 3
                        const colorCounts: Map<string, { count: number; r: number; g: number; b: number }> = new Map()
                        
                        for (let dx = -sampleSize; dx <= sampleSize; dx++) {
                            for (let dy = -sampleSize; dy <= sampleSize; dy++) {
                                const sx = Math.min(255, Math.max(0, px + dx))
                                const sy = Math.min(255, Math.max(0, py + dy))
                                const imageData = ctx.getImageData(sx, sy, 1, 1).data
                                
                                // Quantize color to reduce variations
                                const r = Math.round(imageData[0] / 16) * 16
                                const g = Math.round(imageData[1] / 16) * 16
                                const b = Math.round(imageData[2] / 16) * 16
                                const colorKey = `${r},${g},${b}`
                                
                                if (!colorCounts.has(colorKey)) {
                                    colorCounts.set(colorKey, { count: 0, r: imageData[0], g: imageData[1], b: imageData[2] })
                                }
                                colorCounts.get(colorKey)!.count++
                            }
                        }
                        
                        // Find most common color
                        let maxCount = 0
                        let dominantColor: { r: number; g: number; b: number } = { r: 128, g: 128, b: 128 }
                        
                        for (const [, colorInfo] of colorCounts) {
                            if (colorInfo.count > maxCount) {
                                maxCount = colorInfo.count
                                dominantColor = colorInfo
                            }
                        }
                        
                        const key = `${cellInfo.lat.toFixed(4)},${cellInfo.lon.toFixed(4)}`
                        newColors[key] = [dominantColor.r / 255, dominantColor.g / 255, dominantColor.b / 255]
                    }
                } catch (err) {
                    console.warn(`[AirspaceCylinder] Failed to fetch tile ${tileKey}:`, err)
                }
            })
            
            await Promise.all(tilePromises)
            
            console.log(`[AirspaceCylinder] Sampled colors for ${Object.keys(newColors).length} cells`)
            setCellColors(newColors)
        }

        fetchBasemapColors()
    }, [elevationCells, selectedBasemap, clickedPoint?.lat, clickedPoint?.lon, radiusKm])

    // Fetch thermal hotspots from thermal.kk7.ch tiles
    useEffect(() => {
        if (!clickedPoint) {
            setThermalHotspots([])
            return
        }

        const fetchThermalHotspots = async () => {
            const cylinderRadius = 1.5
            const kmToDegLat = 1 / 111
            const kmToDegLon = 1 / (111 * Math.cos(clickedPoint.lat * Math.PI / 180))
            
            // Determine appropriate zoom level based on radius
            // At zoom 12, one tile covers roughly 10km at mid-latitudes
            const zoom = radiusKm <= 2 ? 13 : radiusKm <= 5 ? 12 : 11
            
            // Convert lat/lon to tile coordinates
            const lat2tile = (lat: number, z: number) => {
                return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z))
            }
            const lon2tile = (lon: number, z: number) => {
                return Math.floor((lon + 180) / 360 * Math.pow(2, z))
            }
            
            // Get tile coordinates for center point
            const tileX = lon2tile(clickedPoint.lon, zoom)
            const tileY = lat2tile(clickedPoint.lat, zoom)
            
            // TMS y-coordinate is flipped
            const tmsY = Math.pow(2, zoom) - 1 - tileY
            
            // Calculate tile bounds for coordinate conversion
            const tile2lon = (x: number, z: number) => {
                return x / Math.pow(2, z) * 360 - 180
            }
            const tile2lat = (y: number, z: number) => {
                const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z)
                return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
            }
            
            const tileLonMin = tile2lon(tileX, zoom)
            const tileLonMax = tile2lon(tileX + 1, zoom)
            const tileLatMax = tile2lat(tileY, zoom)
            const tileLatMin = tile2lat(tileY + 1, zoom)
            
            try {
                // Fetch the thermal tile image through our proxy to avoid CORS issues
                const tileUrl = `/api/thermal-tile?z=${zoom}&x=${tileX}&y=${tmsY}`
                
                console.log('[AirspaceCylinder] Fetching thermal tile:', tileUrl)
                
                // Create an off-screen canvas to analyze the image
                const img = new Image()
                
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve()
                    img.onerror = (e) => {
                        console.error('[AirspaceCylinder] Image load error:', e)
                        reject(new Error('Failed to load thermal tile'))
                    }
                    img.src = tileUrl
                })
                
                const canvas = document.createElement('canvas')
                canvas.width = img.width
                canvas.height = img.height
                const ctx = canvas.getContext('2d')
                if (!ctx) return
                
                ctx.drawImage(img, 0, 0)
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
                const data = imageData.data
                
                console.log('[AirspaceCylinder] Thermal tile loaded, size:', canvas.width, 'x', canvas.height)
                
                // Scan for thermal pixels
                // thermal.kk7.ch color scale: blue (cold) -> cyan -> green -> yellow -> orange -> red (hot)
                const hotspots: ThermalHotspot[] = []
                const gridSize = 6 // Sample every 6 pixels for finer detection
                
                let pixelsScanned = 0
                let hotPixels = 0
                
                for (let py = 0; py < canvas.height; py += gridSize) {
                    for (let px = 0; px < canvas.width; px += gridSize) {
                        const i = (py * canvas.width + px) * 4
                        const r = data[i]
                        const g = data[i + 1]
                        const b = data[i + 2]
                        const a = data[i + 3]
                        
                        pixelsScanned++
                        
                        // Skip fully transparent pixels
                        if (a < 30) continue
                        
                        // Calculate thermal intensity based on color
                        // Red/orange = high intensity (strong thermal)
                        // Yellow/green = medium intensity
                        // Cyan/blue = low intensity (weak thermal or sink)
                        
                        // We want to detect any thermal activity, not just strong ones
                        // Skip pure blue (cold/sink areas)
                        const isBlueish = b > r && b > g
                        if (isBlueish) continue
                        
                        // Calculate "warmth" - how much the color leans toward red/orange/yellow
                        // Higher red relative to blue = warmer
                        const warmth = (r + g * 0.5) / Math.max(1, r + g + b)
                        
                        // Minimum warmth threshold to be considered a thermal
                        if (warmth < 0.3) continue
                        
                        hotPixels++
                        
                        // Calculate lat/lon from pixel position
                        const pixelLon = tileLonMin + (px / canvas.width) * (tileLonMax - tileLonMin)
                        const pixelLat = tileLatMax - (py / canvas.height) * (tileLatMax - tileLatMin)
                        
                        // Check if within our search radius
                        const latDiff = pixelLat - clickedPoint.lat
                        const lonDiff = pixelLon - clickedPoint.lon
                        const distKm = Math.sqrt(
                            (latDiff / kmToDegLat) ** 2 + 
                            (lonDiff / kmToDegLon) ** 2
                        )
                        
                        if (distKm <= radiusKm) {
                            // Convert to 3D cylinder coordinates
                            const x = (lonDiff / kmToDegLon / radiusKm) * cylinderRadius
                            const z = -(latDiff / kmToDegLat / radiusKm) * cylinderRadius
                            
                            // Calculate intensity based on color warmth
                            // Red-dominant = highest intensity
                            // Orange = high intensity  
                            // Yellow = medium intensity
                            // Green/cyan-ish = lower intensity
                            let intensity = 0
                            
                            if (r > g && r > b) {
                                // Red dominant - strong thermal
                                intensity = 0.7 + (r / 255) * 0.3
                            } else if (r > b && g > b) {
                                // Yellow/orange - medium-high thermal
                                intensity = 0.4 + ((r + g) / 510) * 0.3
                            } else if (g > b) {
                                // Green-ish - weak thermal
                                intensity = 0.15 + (g / 255) * 0.25
                            } else {
                                // Other - very weak
                                intensity = 0.1
                            }
                            
                            hotspots.push({
                                x,
                                z,
                                lat: pixelLat,
                                lon: pixelLon,
                                intensity: Math.min(1, intensity)
                            })
                        }
                    }
                }
                
                console.log('[AirspaceCylinder] Scanned', pixelsScanned, 'pixels,', hotPixels, 'hot pixels found')
                console.log('[AirspaceCylinder] Found', hotspots.length, 'thermal hotspots within radius')
                
                // Cluster nearby hotspots to avoid too many overlapping cylinders
                const clusteredHotspots: ThermalHotspot[] = []
                const clusterRadius = 0.15 // Minimum distance between hotspots in 3D units
                
                for (const hotspot of hotspots) {
                    let merged = false
                    for (const existing of clusteredHotspots) {
                        const dist = Math.sqrt((hotspot.x - existing.x) ** 2 + (hotspot.z - existing.z) ** 2)
                        if (dist < clusterRadius) {
                            // Merge: keep the stronger one, average position
                            if (hotspot.intensity > existing.intensity) {
                                existing.x = (existing.x + hotspot.x) / 2
                                existing.z = (existing.z + hotspot.z) / 2
                                existing.intensity = Math.max(existing.intensity, hotspot.intensity)
                            }
                            merged = true
                            break
                        }
                    }
                    if (!merged) {
                        clusteredHotspots.push({ ...hotspot })
                    }
                }
                
                console.log('[AirspaceCylinder] Clustered to', clusteredHotspots.length, 'thermal hotspots')
                setThermalHotspots(clusteredHotspots)
                
            } catch (err) {
                console.error('[AirspaceCylinder] Failed to fetch thermal hotspots:', err)
                setThermalHotspots([])
            }
        }
        
        fetchThermalHotspots()
    }, [clickedPoint?.lat, clickedPoint?.lon, radiusKm])

    // Expand button component
    const ExpandButton = () => (
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
                zIndex: 100,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease'
            }}
            title={isExpanded ? 'Minimize' : 'Expand'}
        >
            {isExpanded ? (
                // Minimize icon
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
            ) : (
                // Expand icon
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
            )}
        </button>
    )
    
    // Prepare deduplicated airspace labels for external display
    // Group by airspace type (same color) and show the overall altitude range
    const airspaceLabels = useMemo(() => {
        const labelMap = new Map<string, {
            key: string,
            type: string,
            color: string,
            floorM: number,   // Lowest floor among all of this type
            ceilingM: number, // Highest ceiling among all of this type
            count: number,    // How many individual airspaces of this type
        }>()
        
        airspacesAtPoint.forEach((airspace, idx) => {
            const floor = airspace.altitude?.floor || 0
            const ceiling = airspace.altitude?.ceiling || 18000
            const color = getAirspaceColor(airspace.type)
            const floorM = Math.round(floor / 3.28084)
            const ceilingM = Math.round(ceiling / 3.28084)
            
            // Group by type only (same color = same group)
            const typeKey = airspace.type
            
            if (labelMap.has(typeKey)) {
                const existing = labelMap.get(typeKey)!
                existing.count++
                // Expand the altitude range to encompass all airspaces of this type
                existing.floorM = Math.min(existing.floorM, floorM)
                existing.ceilingM = Math.max(existing.ceilingM, ceilingM)
            } else {
                labelMap.set(typeKey, {
                    key: airspace.id || `label-${idx}`,
                    type: airspace.type,
                    color,
                    floorM,
                    ceilingM,
                    count: 1,
                })
            }
        })
        
        // Sort by ceiling altitude (highest first)
        return Array.from(labelMap.values()).sort((a, b) => b.ceilingM - a.ceilingM)
    }, [airspacesAtPoint])
    
    // Calculate max airspace ceiling in meters for display
    const maxAirspaceCeiling = useMemo(() => {
        let maxCeiling = 0
        for (const airspace of airspacesAtPoint) {
            const ceiling = airspace.altitude?.ceiling || 18000
            const ceilingM = Math.round(ceiling / 3.28084)
            if (ceilingM > maxCeiling) {
                maxCeiling = ceilingM
            }
        }
        return maxCeiling
    }, [airspacesAtPoint])
    
    if (!mounted) {
        return (
            <div style={{ marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                    3D Airspace View
                </h3>
                <div style={{ position: 'relative', height: '300px', width: '100%', backgroundColor: '#ffffff', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb' }}>
                    <span style={{ color: '#9ca3af' }}>Loading 3D view...</span>
                </div>
            </div>
        )
    }
    
    // Expanded fullscreen view - use portal to escape sidebar's stacking context
    if (isExpanded) {
        const expandedContent = (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: '#ffffff',
                zIndex: 99999,
                display: 'flex',
                flexDirection: 'column',
                isolation: 'isolate'
            }}>
                {/* Header */}
                <div style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#f9fafb'
                }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                        3D Airspace View
                    </h3>
                    <button
                        onClick={onToggleExpand}
                    style={{
                            padding: '8px 16px',
                            backgroundColor: '#374151',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                        </svg>
                        Minimize
                    </button>
                </div>
                
                {/* Canvas container */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Canvas 
                            camera={{ position: [0, 0, 8], fov: 50, near: 0.1, far: 100 }} 
                            gl={{ 
                                stencil: true, 
                                antialias: false, 
                                powerPreference: 'high-performance',
                                alpha: true
                            }}
                            dpr={1}
                        >
                            <color attach="background" args={['#f8fafc']} />
                            <ambientLight intensity={0.6} />
                            <directionalLight position={[5, 8, 5]} intensity={0.6} />
                            <directionalLight position={[-4, 6, -2]} intensity={0.3} />
                            <CylinderWalls />
                            {elevationCells.length > 0 && (
                                <ElevationMosaic 
                                    cells={elevationCells} 
                                    minElev={minElev} 
                                    maxElev={maxElev} 
                                    isLoading={isLoading} 
                                    gridSize={currentGridSize} 
                                    radiusKm={radiusKm}
                                    airspaces={airspacesAtPoint}
                                    cellColors={cellColors}
                                />
                            )}
                            {thermalHotspots.length > 0 && (
                                <ThermalHotspots hotspots={thermalHotspots} />
                            )}
                            <RadiusLabel radiusKm={radiusKm} />
                            <NorthIndicator />
                            {elevationCells.length > 0 && (
                                <ClickPositionMarker 
                                    centerElevation={centerElevation} 
                                    minElev={minElev} 
                                    maxElev={maxElev} 
                                    airspaces={airspacesAtPoint} 
                                />
                            )}
                            {elevationCells.length > 0 && (
                                <ElevationScaleBar minElev={minElev} maxElev={maxElev} airspaces={airspacesAtPoint} />
                            )}
                            {airspacesAtPoint.length > 0 && clickedPoint && (
                                <AirspaceVolumes 
                                    airspaces={airspacesAtPoint} 
                                    minElev={minElev}
                                    maxElev={maxElev}
                                    clickedPoint={clickedPoint}
                                    radiusKm={radiusKm}
                                />
                            )}
                            <OrbitControls
                                makeDefault
                                enablePan={true}
                                enableZoom={true}
                                enableRotate={true}
                                enableDamping={true}
                                dampingFactor={0.12}
                                minPolarAngle={Math.PI / 4}
                                maxPolarAngle={Math.PI / 2}
                                screenSpacePanning={true}
                                panSpeed={0.8}
                                rotateSpeed={1.0}
                                zoomSpeed={1.0}
                                mouseButtons={{
                                    LEFT: MOUSE.ROTATE,
                                    MIDDLE: MOUSE.DOLLY,
                                    RIGHT: MOUSE.PAN
                                }}
                            />
                        </Canvas>
                        
                        {isLoading && (
                            <div style={{ 
                                position: 'absolute', 
                                bottom: '16px', 
                                left: '16px', 
                                fontSize: '13px', 
                                color: '#6b7280',
                                backgroundColor: 'rgba(255,255,255,0.95)',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                                Loading terrain...
                            </div>
                        )}
                        
                        {elevationCells.length > 0 && (
                            <div style={{ 
                                position: 'absolute', 
                                bottom: '16px', 
                                left: '50%',
                                transform: 'translateX(-50%)',
                                fontSize: '12px', 
                                color: '#6b7280',
                                backgroundColor: 'rgba(255,255,255,0.95)',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                textAlign: 'center',
                                lineHeight: '1.4'
                            }}>
                                <div>Terrain elevation range: {Math.round(minElev)}m - {Math.round(maxElev)}m</div>
                                {maxAirspaceCeiling > 0 && (
                                    <div>Max airspace found: {maxAirspaceCeiling}m</div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {/* External labels panel */}
                    {airspaceLabels.length > 0 && (
                        <div style={{ 
                            width: '140px', 
                            flexShrink: 0,
                            padding: '12px',
                            backgroundColor: '#f9fafb',
                            borderLeft: '1px solid #e5e7eb',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            overflowY: 'auto'
                        }}>
                                {airspaceLabels.map((label) => (
                                <div
                                    key={label.key}
                                    style={{
                                        padding: '8px',
                                        backgroundColor: `${label.color}15`,
                                        border: `1px solid ${label.color}40`,
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        lineHeight: '1.4'
                                    }}
                                >
                                    <div style={{ 
                                        fontWeight: '600', 
                                        color: label.color,
                                        marginBottom: '2px'
                                    }}>
                                        {label.type}
                                    </div>
                                    <div style={{ color: '#6b7280', fontSize: '10px' }}>
                                        {label.floorM}-{label.ceilingM}m
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )
        
        // Render via portal to escape sidebar's stacking context
        return createPortal(expandedContent, document.body)
    }

    // Normal compact view
    return (
        <div style={{ marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                3D Airspace View
            </h3>

            <div style={{ display: 'flex', height: '300px', width: '100%', backgroundColor: '#f0f0f0', borderRadius: '8px', overflow: 'visible' }}>
                <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden', borderRadius: '5px 0 0 5px', backgroundColor: '#e0e0e0' }}>
                    <Canvas 
                        camera={{ position: [0, 0, 8], fov: 50, near: 0.1, far: 100 }} 
                        gl={{ 
                            stencil: true, 
                            antialias: false,
                            powerPreference: 'high-performance',
                            alpha: false,
                            failIfMajorPerformanceCaveat: false
                        }}
                        dpr={1}
                        style={{ background: '#f8fafc' }}
                    >
                        <color attach="background" args={['#f8fafc']} />
                        <ambientLight intensity={0.6} />
                        <directionalLight position={[5, 8, 5]} intensity={0.6} />
                        <directionalLight position={[-4, 6, -2]} intensity={0.3} />
                        
                        <CylinderWalls />
                        {elevationCells.length > 0 && (
                            <ElevationMosaic 
                                cells={elevationCells} 
                                minElev={minElev} 
                                maxElev={maxElev} 
                                isLoading={isLoading} 
                                gridSize={currentGridSize} 
                                radiusKm={radiusKm}
                                airspaces={airspacesAtPoint}
                                cellColors={cellColors}
                            />
                        )}
                        {thermalHotspots.length > 0 && (
                            <ThermalHotspots hotspots={thermalHotspots} />
                        )}
                        <RadiusLabel radiusKm={radiusKm} />
                        <NorthIndicator />
                        {elevationCells.length > 0 && (
                            <ClickPositionMarker 
                                centerElevation={centerElevation} 
                                minElev={minElev} 
                                maxElev={maxElev} 
                                airspaces={airspacesAtPoint} 
                            />
                        )}
                        {elevationCells.length > 0 && (
                            <ElevationScaleBar minElev={minElev} maxElev={maxElev} airspaces={airspacesAtPoint} />
                        )}
                        {airspacesAtPoint.length > 0 && clickedPoint && (
                            <AirspaceVolumes 
                                airspaces={airspacesAtPoint} 
                                minElev={minElev}
                                maxElev={maxElev}
                                clickedPoint={clickedPoint}
                                radiusKm={radiusKm}
                            />
                        )}
                        <OrbitControls
                            makeDefault
                            enablePan={true}
                            enableZoom={true}
                            enableRotate={true}
                            enableDamping={true}
                            dampingFactor={0.12}
                            minPolarAngle={Math.PI / 4}
                            maxPolarAngle={Math.PI / 2}
                            screenSpacePanning={true}
                            panSpeed={0.8}
                            rotateSpeed={1.0}
                            zoomSpeed={1.0}
                            mouseButtons={{
                                LEFT: MOUSE.ROTATE,
                                MIDDLE: MOUSE.DOLLY,
                                RIGHT: MOUSE.PAN
                            }}
                        />
                    </Canvas>
                    
                    {onToggleExpand && <ExpandButton />}
                    
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
                            fontSize: '9px', 
                            color: '#6b7280',
                            backgroundColor: 'rgba(255,255,255,0.9)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            textAlign: 'right',
                            lineHeight: '1.3'
                        }}>
                            <div>Terrain: {Math.round(minElev)}m - {Math.round(maxElev)}m</div>
                            {maxAirspaceCeiling > 0 && (
                                <div>Max airspace: {maxAirspaceCeiling}m</div>
                            )}
                        </div>
                    )}
                </div>
                
                {/* External labels panel */}
                {airspaceLabels.length > 0 && (
                    <div style={{ 
                        width: '100px', 
                        minWidth: '100px',
                        flexShrink: 0,
                        padding: '6px',
                        backgroundColor: '#f9fafb',
                        borderLeft: '1px solid #e5e7eb',
                        borderRadius: '0 8px 8px 0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        overflowY: 'auto'
                    }}>
                        {airspaceLabels.map((label) => (
                            <div
                                key={label.key}
                                style={{
                                    padding: '4px 5px',
                                    backgroundColor: `${label.color}15`,
                                    border: `1px solid ${label.color}40`,
                                    borderRadius: '4px',
                                    fontSize: '9px',
                                    lineHeight: '1.3'
                                }}
                            >
                                <div style={{ 
                                    fontWeight: '600', 
                                    color: label.color,
                                    marginBottom: '1px',
                                    wordBreak: 'break-word'
                                }}>
                                    {label.type}
                                </div>
                                <div style={{ color: '#6b7280', fontSize: '8px' }}>
                                    {label.floorM}-{label.ceilingM}m
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
