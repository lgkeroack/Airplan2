'use client'

import { useState, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Line, Text, Billboard, Html } from '@react-three/drei'
import { BufferAttribute, DoubleSide, BufferGeometry, Color, IncrementStencilOp, NotEqualStencilFunc } from 'three'
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
}

interface ElevationCell {
    x: number
    z: number
    lat: number
    lon: number
    elevation: number | null  // null means still loading
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

function ElevationMosaic({ cells, minElev, maxElev, isLoading }: { 
    cells: ElevationCell[], 
    minElev: number, 
    maxElev: number,
    isLoading: boolean
}) {
    const gridSize = 6
    const cylinderRadius = 1.5
    const subdivisions = 12  // Low-poly resolution
    
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
        const maxHeight = (size / gridSize) * 0.95
        
        // For flat shading, each triangle has its own vertices (no sharing)
        const vertices: number[] = []
        const colors: number[] = []
        
        // Helper to get height at a point
        const getHeight = (x: number, z: number): number => {
            const dist = Math.sqrt(x * x + z * z)
            if (dist > cylinderRadius) return 0
            const elev = bilinearInterpolate(x, z, cells, gridSize, cylinderRadius)
            return elev > 0 ? (elev / maxPositiveElev) * maxHeight : 0
        }
        
        // Helper to get elevation at a point
        const getElev = (x: number, z: number): number => {
            return bilinearInterpolate(x, z, cells, gridSize, cylinderRadius)
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
                
                const elev1 = (getElev(x0, z0) + getElev(x0, z1) + getElev(x1, z0)) / 3
                const color1 = parseColor(getElevationColor(elev1, minElev, maxElev))
                colors.push(...color1, ...color1, ...color1)
                
                // Triangle 2: (1,0) -> (0,1) -> (1,1)
                vertices.push(x1, h10, z0)
                vertices.push(x0, h01, z1)
                vertices.push(x1, h11, z1)
                
                const elev2 = (getElev(x1, z0) + getElev(x0, z1) + getElev(x1, z1)) / 3
                const color2 = parseColor(getElevationColor(elev2, minElev, maxElev))
                colors.push(...color2, ...color2, ...color2)
            }
        }
        
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
        geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
        geometry.computeVertexNormals()
        
        return geometry
    }, [cells, minElev, maxElev, maxPositiveElev])

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
            
            {/* Grid lines for reference */}
            {cells.map((cell, idx) => {
                const dist = Math.sqrt(cell.x * cell.x + cell.z * cell.z)
                if (dist > cylinderRadius) return null
                const height = getCellHeight(cell)

    return (
        <mesh
                        key={idx}
                        position={[cell.x, height + 0.01, cell.z]}
                        rotation={[-Math.PI / 2, 0, 0]}
        >
                        <ringGeometry args={[0.01, 0.03, 8]} />
                        <meshBasicMaterial color="#333333" transparent opacity={0.5} />
        </mesh>
    )
            })}

            {/* Circle outline */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
                <ringGeometry args={[1.48, 1.52, 64]} />
                <meshBasicMaterial color="#666666" side={DoubleSide} />
            </mesh>

            {/* Elevation labels on some cells - only show when data is loaded */}
            {!isLoading && cells.filter((c, idx) => idx % 7 === 0 && c.elevation !== null).map((cell, idx) => {
                const dist = Math.sqrt(cell.x * cell.x + cell.z * cell.z)
                if (dist > cylinderRadius * 0.9) return null
                
                // Position label above the terrain
                const labelY = getCellHeight(cell) + 0.15

                return (
                    <Billboard key={idx} position={[cell.x, labelY, cell.z]} follow={true}>
                        <Text
                            fontSize={0.12}
                            color="#333333"
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={0.015}
                            outlineColor="#ffffff"
                        >
                            {Math.round(cell.elevation!)}m
                        </Text>
                    </Billboard>
                )
            })}
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
                <Billboard position={[1.85, 0.1, 0]} follow={true}>
                    <Text
                        fontSize={0.18}
                        color="#374151"
                        anchorX="center"
                        anchorY="middle"
                        outlineWidth={0.02}
                        outlineColor="#ffffff"
                    >
                        {radiusKm} km
                    </Text>
                </Billboard>
                
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
            
            <Billboard position={[0, 0.2, -2.0]} follow={true}>
                <Text
                    fontSize={0.15}
                    color="#dc2626"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.015}
                    outlineColor="#ffffff"
                    fontWeight="bold"
                >
                    N
                </Text>
            </Billboard>
        </group>
    )
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
    minAlt = 0, 
    maxAlt = 18000,
    clickedPoint,
    radiusKm
}: { 
    airspaces: AirspaceData[], 
    minAlt?: number, 
    maxAlt?: number,
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
    
    // Convert altitude (in feet) to Y position
    const altToY = (alt: number): number => {
        const t = (alt - minAlt) / (maxAlt - minAlt)
        return cylinderBottom + t * cylinderHeight
    }
    
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
    }, [airspaces, clickedPoint, radiusKm, cylinderRadius, altToY, localToLatLon])
    
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
            
            {/* Render labels on the right side with connector lines */}
            {typeLabels.map((label, idx) => (
                <group key={label.type + idx}>
                    {/* Connector lines from label to each airspace of this type */}
                    {label.airspaceCenters.map((center, centerIdx) => (
                        <Line
                            key={centerIdx}
                            points={[label.labelPosition, center]}
                            color={label.color}
                            lineWidth={1.5}
                            dashed={true}
                            dashSize={0.08}
                            gapSize={0.04}
                        />
                    ))}
                    
                    {/* Small marker dot at line endpoint */}
                    <mesh position={label.labelPosition}>
                        <sphereGeometry args={[0.04, 8, 8]} />
                        <meshBasicMaterial color={label.color} />
                    </mesh>
                    
                    {/* Static HTML label - doesn't rotate with the scene */}
                    <Html
                        position={[
                            label.labelPosition[0] + 0.2, 
                            label.labelPosition[1], 
                            label.labelPosition[2]
                        ]}
                        style={{
                            pointerEvents: 'none',
                            whiteSpace: 'nowrap',
                            transform: 'translateY(-50%)'
                        }}
                        transform={false}
                        sprite={false}
                    >
                        <div style={{
                            fontSize: '13px',
                            fontWeight: 'bold',
                            color: label.color,
                            textShadow: '0 0 3px white, 0 0 3px white, 0 0 3px white, 0 0 3px white',
                            userSelect: 'none',
                            lineHeight: 1
                        }}>
                            {label.type}
                        </div>
                    </Html>
                </group>
            ))}
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

export default function AirspaceCylinder({ clickedPoint, radiusKm = 1, onElevationCellsChange, hasAirspace = false, airspacesAtPoint = [], isExpanded = false, onToggleExpand }: AirspaceCylinderProps) {
    const [mounted, setMounted] = useState(false)
    const [elevationCells, setElevationCells] = useState<ElevationCell[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [minElev, setMinElev] = useState(0)
    const [maxElev, setMaxElev] = useState(100)

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
            
            const gridSize = 6 // 6x6 grid = 36 cells
            const cylinderRadius = 1.5
            const cellSize = 3 / gridSize
            
            // Convert km to degrees (approximate)
            const kmToDegLat = 1 / 111
            const kmToDegLon = 1 / (111 * Math.cos(clickedPoint.lat * Math.PI / 180))
            
            // Generate grid cell centers and their corresponding lat/lon
            const cellRequests: { x: number; z: number; lat: number; lon: number }[] = []
            
            for (let i = 0; i < gridSize; i++) {
                for (let j = 0; j < gridSize; j++) {
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
                const requestBody = {
                    locations: cellRequests.map(c => ({ latitude: c.lat, longitude: c.lon }))
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
                    throw new Error(`API returned ${response.status}: ${response.statusText}`)
                }
                
                const data = await response.json()
                console.log('[AirspaceCylinder] Received', data?.results?.length, 'elevation results')
                
                if (data?.results?.length > 0) {
                    const cells: ElevationCell[] = []
                    let min = Infinity
                    let max = -Infinity
                    let validCount = 0
                    
                    for (let i = 0; i < data.results.length; i++) {
                        const result = data.results[i]
                        const hasElevation = result && typeof result.elevation === 'number'
                        const elev = hasElevation ? result.elevation : 0
                        
                        cells.push({
                            x: cellRequests[i].x,
                            z: cellRequests[i].z,
                            lat: cellRequests[i].lat,
                            lon: cellRequests[i].lon,
                            elevation: elev
                        })
                        
                        if (hasElevation) {
                            validCount++
                            if (elev < min) min = elev
                            if (elev > max) max = elev
                        }
                    }
                    
                    console.log('[AirspaceCylinder] Valid elevation count:', validCount, '/', data.results.length)
                    console.log('[AirspaceCylinder] Elevation range:', min, 'to', max)
                    
                    if (validCount > 0) {
                        setMinElev(min)
                        setMaxElev(max)
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
                    console.error('[AirspaceCylinder] No results in API response')
                }
            } catch (err) {
                console.error('[AirspaceCylinder] Failed to fetch elevation:', err)
                setElevationCells([])
            } finally {
                setIsLoading(false)
            }
        }

        fetchElevationGrid()
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
    
    // The 3D canvas content
    const CanvasContent = () => (
        <>
            <color attach="background" args={['#ffffff']} />
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} />
            
            <CylinderWalls />
            
            <ElevationMosaic cells={elevationCells} minElev={minElev} maxElev={maxElev} isLoading={isLoading} />
            
            <RadiusLabel radiusKm={radiusKm} />
            
            <NorthIndicator />
            {hasAirspace && <CentralAltitudeScale minAlt={0} maxAlt={18000} airspaces={airspacesAtPoint} />}
            {airspacesAtPoint.length > 0 && clickedPoint && (
                <AirspaceVolumes 
                    airspaces={airspacesAtPoint} 
                    minAlt={0} 
                    maxAlt={18000}
                    clickedPoint={clickedPoint}
                    radiusKm={radiusKm}
                />
            )}
            
            <OrbitControls
                enablePan={false}
                enableZoom={true}
                minPolarAngle={Math.PI / 4}
                maxPolarAngle={Math.PI / 2}
            />
        </>
    )
    
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
    
    // Expanded fullscreen view
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
                <div style={{ flex: 1, position: 'relative' }}>
                    <Canvas camera={{ position: [0, 0, 8], fov: 50 }} gl={{ stencil: true }}>
                        <CanvasContent />
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
                            right: '16px', 
                            fontSize: '12px', 
                            color: '#6b7280',
                            backgroundColor: 'rgba(255,255,255,0.95)',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                            Elevation: {Math.round(minElev)}m - {Math.round(maxElev)}m
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Normal compact view
    return (
        <div style={{ marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                3D Airspace View
            </h3>

            <div style={{ position: 'relative', height: '300px', width: '100%', backgroundColor: '#ffffff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                <Canvas camera={{ position: [0, 0, 8], fov: 50 }} gl={{ stencil: true }}>
                    <CanvasContent />
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
