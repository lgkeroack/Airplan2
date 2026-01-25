"use client"

import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Text, Billboard, Line } from '@react-three/drei'
import * as THREE from 'three'
import type { AirspaceData } from '@/lib/types'

interface ElevationGridCell {
  lat: number
  lon: number
  elevation: number | null
  distanceFromPath: number
  progressAlongPath: number
}

// Extended airspace data with position info along route
interface PositionedAirspace extends AirspaceData {
  startProgress: number // 0-1, where along route this airspace starts
  endProgress: number   // 0-1, where along route this airspace ends
}

// Get terrain color based on elevation (same gradient as AirspaceCylinder)
function getElevationColor(elevation: number, minElev: number, maxElev: number): string {
  const range = maxElev - minElev || 1
  const t = Math.max(0, Math.min(1, (elevation - minElev) / range))
  
  // Water - blue
  if (elevation <= 0) {
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

function parseColor(color: string): [number, number, number] {
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (match) {
    return [parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255]
  }
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  return [r, g, b]
}

// Smooth elevation grid using a simple box blur
function smoothElevationGrid(cells: ElevationGridCell[], passes: number = 2): ElevationGridCell[] {
  if (!cells || cells.length === 0) return cells
  
  // Build a 2D grid from cells
  const rows = new Map<number, Map<number, ElevationGridCell>>()
  for (const c of cells) {
    const rowKey = Math.round(c.progressAlongPath * 1000)
    const colKey = Math.round(c.distanceFromPath * 1000)
    if (!rows.has(rowKey)) rows.set(rowKey, new Map())
    rows.get(rowKey)!.set(colKey, { ...c })
  }
  
  const rowKeys = Array.from(rows.keys()).sort((a, b) => a - b)
  const allColKeys = new Set<number>()
  rows.forEach(row => row.forEach((_, k) => allColKeys.add(k)))
  const colKeys = Array.from(allColKeys).sort((a, b) => a - b)
  
  // Create a working copy
  let current = rows
  
  for (let pass = 0; pass < passes; pass++) {
    const next = new Map<number, Map<number, ElevationGridCell>>()
    
    for (let ri = 0; ri < rowKeys.length; ri++) {
      const rowKey = rowKeys[ri]
      next.set(rowKey, new Map())
      
      for (let ci = 0; ci < colKeys.length; ci++) {
        const colKey = colKeys[ci]
        const cell = current.get(rowKey)?.get(colKey)
        if (!cell) continue
        
        // Gather neighbors (3x3 box)
        let sum = 0
        let count = 0
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = rowKeys[ri + dr]
            const nc = colKeys[ci + dc]
            if (nr !== undefined && nc !== undefined) {
              const neighbor = current.get(nr)?.get(nc)
              if (neighbor && neighbor.elevation !== null) {
                sum += neighbor.elevation
                count++
              }
            }
          }
        }
        
        const smoothedElev = count > 0 ? sum / count : cell.elevation
        next.get(rowKey)!.set(colKey, { ...cell, elevation: smoothedElev })
      }
    }
    current = next
  }
  
  // Flatten back to array
  const result: ElevationGridCell[] = []
  current.forEach(row => row.forEach(cell => result.push(cell)))
  return result
}

function TerrainMesh({ cells, minElev, maxElev, width }: { cells: ElevationGridCell[]; minElev: number; maxElev: number; width: number }) {
  const geometry = useMemo(() => {
    if (!cells || cells.length === 0) return null
    
    // Apply smoothing to reduce jagged terrain (1 pass for subtle smoothing)
    const smoothedCells = smoothElevationGrid(cells, 1)

    const geo = new THREE.BufferGeometry()
    const vertices: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    // Group into rows by progressAlongPath key
    const rows = new Map<number, ElevationGridCell[]>()
    for (const c of smoothedCells) {
      const k = Math.round(c.progressAlongPath * 1000)
      if (!rows.has(k)) rows.set(k, [])
      rows.get(k)!.push(c)
    }

    const sorted = Array.from(rows.keys()).sort((a, b) => a - b)
    
    if (sorted.length < 2) return null

    // Calculate max elevation for height scaling
    const maxPositiveElev = Math.max(100, maxElev, 1)
    const verticalExaggeration = 1.0 // No vertical exaggeration for route terrain
    const maxHeight = 1.0 // Maximum height in 3D units (reduced for better visibility)
    
    // Calculate the 3D extent - we want the terrain to span a reasonable size
    // X axis = progress along path (0 to 1 maps to -3 to +3 units = 6 units total)
    // Z axis = distance from path (width in km, centered, scaled to match)
    const xExtent = 6.0  // Total X extent in 3D units
    const zExtent = width > 0 ? Math.min(width, 6.0) : 2.0  // Z extent based on corridor width, capped
    
    // Find the actual range of distanceFromPath values
    let minDist = Infinity, maxDist = -Infinity
    for (const c of cells) {
      minDist = Math.min(minDist, c.distanceFromPath)
      maxDist = Math.max(maxDist, c.distanceFromPath)
    }
    const distRange = maxDist - minDist || 1

    let prevRow: { idx: number; x: number; z: number; elev: number }[] = []
    
    for (let i = 0; i < sorted.length; i++) {
      const row = rows.get(sorted[i])!.sort((a, b) => a.distanceFromPath - b.distanceFromPath)
      const rowData: { idx: number; x: number; z: number; elev: number }[] = []
      
      // Calculate progress (0-1) for this row
      const progress = sorted[i] / 1000  // Convert back from key to 0-1
      
      for (const cell of row) {
        const elev = cell.elevation ?? minElev
        
        // Calculate height with vertical exaggeration
        const normalizedElev = Math.max(0, elev) / maxPositiveElev
        const y = normalizedElev * maxHeight * verticalExaggeration
        
        // X = progress along path, mapped to [-xExtent/2, +xExtent/2]
        const x = (progress - 0.5) * xExtent
        
        // Z = distance from path, normalized and mapped to [-zExtent/2, +zExtent/2]
        const normalizedDist = (cell.distanceFromPath - minDist) / distRange  // 0 to 1
        const z = (normalizedDist - 0.5) * zExtent
        
        const vi = vertices.length / 3
        vertices.push(x, y, z)
        rowData.push({ idx: vi, x, z, elev })
        
        // Color based on elevation using terrain gradient
        const col = parseColor(getElevationColor(elev, minElev, maxElev))
        colors.push(...col)
      }

      // Create triangles between this row and previous row
      if (i > 0 && prevRow.length > 0 && rowData.length > 0) {
        const numCols = Math.min(prevRow.length, rowData.length)
        for (let j = 0; j < numCols - 1; j++) {
          const a = prevRow[j].idx
          const b = prevRow[j + 1].idx
          const c = rowData[j].idx
          const d = rowData[j + 1].idx
          
          // Two triangles for each quad
          indices.push(a, c, b)
          indices.push(b, c, d)
        }
      }
      prevRow = rowData
    }

    if (vertices.length === 0 || indices.length === 0) return null

    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [cells, minElev, maxElev, width])

  if (!geometry) return null

  return (
    <group>
      {/* Main terrain mesh with vertex colors */}
      <mesh geometry={geometry}>
        <meshLambertMaterial vertexColors={true} side={THREE.DoubleSide} />
      </mesh>
      {/* Wireframe overlay for low-poly look */}
      <mesh geometry={geometry}>
        <meshBasicMaterial 
          wireframe 
          color="#333333" 
          transparent 
          opacity={0.15}
        />
      </mesh>
    </group>
  )
}

// Route path line on the terrain - centered in the polygon (z=0)
function RoutePath({ cells, minElev, maxElev, width }: { cells: ElevationGridCell[]; minElev: number; maxElev: number; width: number }) {
  const pathPoints = useMemo(() => {
    // Get center cells (distanceFromPath closest to 0)
    const rows = new Map<number, ElevationGridCell[]>()
    for (const c of cells) {
      const k = Math.round(c.progressAlongPath * 1000)
      if (!rows.has(k)) rows.set(k, [])
      rows.get(k)!.push(c)
    }
    
    const sorted = Array.from(rows.keys()).sort((a, b) => a - b)
    const points: [number, number, number][] = []
    
    const maxPositiveElev = Math.max(100, maxElev, 1)
    const verticalExaggeration = 1.0 // No vertical exaggeration
    const maxHeight = 1.0
    const xExtent = 6.0
    
    // Collect center elevations for smoothing
    const centerElevations: number[] = []
    
    for (const key of sorted) {
      const row = rows.get(key)!
      // Find the center cell (minimum absolute distanceFromPath)
      const centerCell = row.reduce((min, c) => 
        Math.abs(c.distanceFromPath) < Math.abs(min.distanceFromPath) ? c : min
      )
      centerElevations.push(centerCell.elevation ?? minElev)
    }
    
    // Smooth the center elevations for a smoother path line (1 pass for subtle smoothing)
    const smoothedElevations = [...centerElevations]
    for (let pass = 0; pass < 1; pass++) {
      for (let i = 1; i < smoothedElevations.length - 1; i++) {
        smoothedElevations[i] = (smoothedElevations[i-1] + smoothedElevations[i] + smoothedElevations[i+1]) / 3
      }
    }
    
    for (let i = 0; i < sorted.length; i++) {
      const key = sorted[i]
      const progress = key / 1000
      const elev = smoothedElevations[i]
      const normalizedElev = Math.max(0, elev) / maxPositiveElev
      const y = normalizedElev * maxHeight * verticalExaggeration + 0.05 // Slightly above terrain
      const x = (progress - 0.5) * xExtent
      const z = 0 // Center of the polygon (path goes through the middle)
      
      points.push([x, y, z])
    }
    
    return points
  }, [cells, minElev, maxElev, width])
  
  if (pathPoints.length < 2) return null
  
  return (
    <Line 
      points={pathPoints}
      color="#ef4444"
      lineWidth={3}
    />
  )
}

// North indicator arrow - points in -Z direction (north on the terrain)
function NorthIndicator({ width, routeBearing = 0 }: { width: number; routeBearing?: number }) {
  const xExtent = 6.0
  const zExtent = width > 0 ? Math.min(width, 6.0) : 2.0
  
  // Position in corner of the terrain
  const posX = xExtent / 2 + 0.6
  const posZ = -zExtent / 2
  
  // The 3D scene is oriented with the route going along the X axis (left to right)
  // routeBearing is the compass bearing of the route (0 = north, PI/2 = east, etc.)
  // To show where north actually is, we need to rotate the arrow by -routeBearing
  // When route goes north (bearing=0), north arrow points along -Z (forward into screen)
  // When route goes east (bearing=PI/2), north arrow points along -X (left)
  
  // Calculate the angle to rotate the north indicator
  // The arrow naturally points along -Z, which would be north if the route goes north
  // If route goes east (bearing=PI/2), we rotate the arrow by -PI/2 to point left (-X)
  const rotation = -routeBearing
  
  return (
    <group position={[posX, 0.1, posZ]}>
      {/* Rotatable group for the arrow - rotates around Y axis */}
      <group rotation={[0, rotation, 0]}>
        {/* Arrow shaft - pointing along -Z axis */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.25]}>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 6]} />
          <meshBasicMaterial color="#1e40af" />
        </mesh>
        {/* Arrow head (cone) - pointing in -Z direction */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.55]}>
          <coneGeometry args={[0.06, 0.15, 6]} />
          <meshBasicMaterial color="#1e40af" />
        </mesh>
      </group>
    </group>
  )
}

// Labels for scale - now empty since labels are shown outside the 3D view
function ScaleLabels({ minElev, maxElev, width }: { minElev: number; maxElev: number; width: number }) {
  return null
}

// Distance markers along the route (km)
function DistanceMarkers({ totalDistanceKm = 0 }: { totalDistanceKm: number }) {
  const xExtent = 6.0
  
  // Generate km markers at regular intervals
  const markers = useMemo(() => {
    if (totalDistanceKm <= 0) return []
    
    // Determine interval based on route length
    let interval = 5 // km
    if (totalDistanceKm < 10) interval = 1
    else if (totalDistanceKm < 30) interval = 5
    else if (totalDistanceKm < 100) interval = 10
    else interval = 25
    
    const result: { x: number; label: string }[] = []
    
    // Start marker at 0
    result.push({ x: -xExtent / 2, label: '0' })
    
    // Intermediate markers
    for (let km = interval; km < totalDistanceKm; km += interval) {
      const progress = km / totalDistanceKm
      const x = -xExtent / 2 + progress * xExtent
      result.push({ x, label: `${km}` })
    }
    
    // End marker
    result.push({ x: xExtent / 2, label: `${Math.round(totalDistanceKm)}` })
    
    return result
  }, [totalDistanceKm])
  
  if (totalDistanceKm <= 0) return null
  
  return (
    <group>
      {/* Baseline */}
      <Line
        points={[[-xExtent / 2, -0.02, 0], [xExtent / 2, -0.02, 0]]}
        color="#9ca3af"
        lineWidth={1}
      />
      
      {/* Markers (tick marks only, no labels) */}
      {markers.map((marker, i) => (
        <group key={i}>
          {/* Tick mark */}
          <Line
            points={[[marker.x, -0.02, 0], [marker.x, -0.08, 0]]}
            color="#6b7280"
            lineWidth={1}
          />
        </group>
      ))}
    </group>
  )
}

export interface ThreeCanvasProps {
  cells: ElevationGridCell[]
  minElev: number
  maxElev: number
  width: number
  airspaces?: PositionedAirspace[]
  routeBearing?: number // Radians, 0 = north, positive = clockwise
  totalDistanceKm?: number
  isFullscreen?: boolean
}

// Get color for airspace type
function getAirspaceColor(type: string): string {
  const colors: Record<string, string> = {
    'TFR': '#ff0000',
    'Restricted': '#d946ef',
    'Prohibited': '#4b5563',
    'NOTAM': '#f97316',
    'Alert': '#eab308',
    'Caution': '#fbbf24',
    'Class A': '#8b5cf6',
    'Class B': '#2563eb',
    'Class C': '#db2777',
    'Class D': '#0ea5e9',
    'Class E': '#6366f1',
    'Class G': '#22c55e',
    'Warning': '#ef4444',
    'MOA': '#9370db',
  }

  if (colors[type]) return colors[type]
  if (type.includes('Class B')) return colors['Class B']
  if (type.includes('Class C')) return colors['Class C']
  if (type.includes('Class D')) return colors['Class D']
  if (type.includes('Class E')) return colors['Class E']
  if (type.includes('Restricted')) return colors['Restricted']
  
  return '#64748b'
}

// Vertical scale bar showing altitude in meters - now just tick marks, no labels
function VerticalScaleBar({ maxAltM, maxElev }: { maxAltM: number; maxElev: number }) {
  const xExtent = 6.0
  const maxHeight = 1.0
  const maxPositiveElev = Math.max(100, maxElev, 1)
  
  // Position scale bar on the left side
  const xPos = -xExtent / 2 - 1.0
  
  // Calculate the height that terrain reaches
  const terrainTopY = (Math.max(0, maxElev) / maxPositiveElev) * maxHeight
  
  // Calculate the height that airspace reaches
  const airspaceTopY = (maxAltM / maxPositiveElev) * maxHeight
  
  // Create scale marks in meters
  const scaleMarks: { y: number; isTerrain: boolean }[] = []
  
  // Ground level
  scaleMarks.push({ y: 0, isTerrain: true })
  
  // Terrain top
  if (maxElev > 0) {
    scaleMarks.push({ y: terrainTopY, isTerrain: true })
  }
  
  // Add altitude marks for airspace (500m intervals up to max)
  const intervals = [500, 1000, 1500, 2000, 3000, 4000, 5000, 6000]
  for (const alt of intervals) {
    if (alt <= maxAltM && alt > maxElev) {
      const y = (alt / maxPositiveElev) * maxHeight
      if (y <= airspaceTopY + 0.1) {
        scaleMarks.push({ y, isTerrain: false })
      }
    }
  }
  
  return (
    <group position={[xPos, 0, 0]}>
      {/* Vertical line */}
      <Line
        points={[[0, 0, 0], [0, Math.max(terrainTopY, airspaceTopY, 1), 0]]}
        color="#6b7280"
        lineWidth={1}
      />
      
      {/* Scale marks (tick marks only, no labels) */}
      {scaleMarks.map((mark, i) => (
        <group key={i} position={[0, mark.y, 0]}>
          {/* Tick mark */}
          <Line
            points={[[-0.08, 0, 0], [0.08, 0, 0]]}
            color={mark.isTerrain ? '#22c55e' : '#6b7280'}
            lineWidth={1}
          />
        </group>
      ))}
    </group>
  )
}

// Airspace volume rendering (optimized, metric units) - now shows position along route
function AirspaceVolumes({ airspaces, maxElev }: { airspaces: PositionedAirspace[]; maxElev: number }) {
  const xExtent = 6.0
  const maxHeight = 1.0
  const maxPositiveElev = Math.max(100, maxElev, 1)
  const labelXPos = -xExtent / 2 - 0.8 // Fixed position on the left
  
  // Convert feet to meters then to 3D Y position
  const altToY = (altFt: number) => {
    const altM = altFt / 3.28084
    return (altM / maxPositiveElev) * maxHeight
  }
  
  // Convert feet to meters
  const ftToM = (ft: number) => Math.round(ft / 3.28084)
  
  const airspaceGeometries = useMemo(() => {
    // Calculate label positions to avoid overlap
    const labelYPositions: { yFloor: number; height: number; labelY: number }[] = []
    
    return airspaces.map((airspace, idx) => {
      const floor = airspace.altitude?.floor || 0
      const ceiling = airspace.altitude?.ceiling || 18000
      const color = getAirspaceColor(airspace.type)
      
      const yFloor = altToY(floor)
      const yCeiling = altToY(ceiling)
      const height = yCeiling - yFloor
      
      if (height < 0.01) return null
      
      // Calculate X position and width based on start/end progress
      const startProgress = airspace.startProgress ?? 0
      const endProgress = airspace.endProgress ?? 1
      const xStart = -xExtent / 2 + startProgress * xExtent
      const xEnd = -xExtent / 2 + endProgress * xExtent
      const boxWidth = Math.max(0.1, xEnd - xStart)
      const xCenter = (xStart + xEnd) / 2
      
      // Calculate label Y position (center of the box), with offset to avoid overlap
      let labelY = yFloor + height / 2
      const labelSpacing = 0.25
      
      // Check for overlapping labels and offset if needed
      for (const existing of labelYPositions) {
        if (Math.abs(labelY - existing.labelY) < labelSpacing) {
          labelY = existing.labelY + labelSpacing
        }
      }
      labelYPositions.push({ yFloor, height, labelY })
      
      return {
        key: airspace.id || `airspace-${idx}`,
        yFloor,
        yCeiling,
        height,
        color,
        type: airspace.type,
        floorM: ftToM(floor),
        ceilingM: ftToM(ceiling),
        xStart,
        xEnd,
        boxWidth,
        xCenter,
        labelY,
      }
    }).filter(Boolean)
  }, [airspaces, maxElev])
  
  return (
    <group>
      {airspaceGeometries.map((geo) => {
        if (!geo) return null
        const { key, yFloor, height, color, type, floorM, ceilingM, xStart, xEnd, boxWidth, xCenter, labelY } = geo
        
        return (
          <group key={key}>
            {/* Airspace volume as a semi-transparent box - positioned at correct location along route */}
            <mesh position={[xCenter, yFloor + height / 2, 0]}>
              <boxGeometry args={[boxWidth, height, 4, 1, 1, 1]} />
              <meshBasicMaterial 
                color={color} 
                transparent 
                opacity={0.2}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            
            {/* Bottom edge lines showing airspace extent */}
            <Line
              points={[
                [xStart, yFloor, -2],
                [xEnd, yFloor, -2],
                [xEnd, yFloor, 2],
                [xStart, yFloor, 2],
                [xStart, yFloor, -2]
              ]}
              color={color}
              lineWidth={1}
              dashed
              dashSize={0.15}
              gapSize={0.08}
            />
            
            {/* Vertical edges at start and end of airspace */}
            <Line
              points={[[xStart, yFloor, -2], [xStart, yFloor + height, -2]]}
              color={color}
              lineWidth={1}
            />
            <Line
              points={[[xEnd, yFloor, -2], [xEnd, yFloor + height, -2]]}
              color={color}
              lineWidth={1}
            />
          </group>
        )
      })}
    </group>
  )
}

export default function ThreeCanvasInner({ cells, minElev, maxElev, width, airspaces = [], routeBearing = 0, totalDistanceKm = 0, isFullscreen = false }: ThreeCanvasProps) {
  const xExtent = 6.0
  
  // Calculate max altitude in meters for scale bar
  const maxAltM = useMemo(() => {
    let max = maxElev + 300 // At least terrain + 300m
    for (const a of airspaces) {
      if (a.altitude?.ceiling) {
        const ceilingM = a.altitude.ceiling / 3.28084
        if (ceilingM > max) max = ceilingM
      }
    }
    return max
  }, [maxElev, airspaces])
  
  // Prepare airspace labels for external display - deduplicated by type+altitude
  const airspaceLabels = useMemo(() => {
    const labelMap = new Map<string, {
      key: string,
      type: string,
      color: string,
      floorM: number,
      ceilingM: number,
      count: number,
      // Track box positions for connecting lines (as percentage of canvas width)
      boxPositions: { xCenter: number, yCenter: number }[]
    }>()
    
    const xExtent = 6.0
    const maxHeight = 1.0
    const maxPositiveElev = Math.max(100, maxElev, 1)
    
    airspaces.forEach((airspace, idx) => {
      const floor = airspace.altitude?.floor || 0
      const ceiling = airspace.altitude?.ceiling || 18000
      const color = getAirspaceColor(airspace.type)
      const floorM = Math.round(floor / 3.28084)
      const ceilingM = Math.round(ceiling / 3.28084)
      
      // Create a unique key for deduplication
      const dedupKey = `${airspace.type}-${floorM}-${ceilingM}`
      
      // Calculate 3D box position for connection line
      const startProgress = airspace.startProgress ?? 0
      const endProgress = airspace.endProgress ?? 1
      const xStart = -xExtent / 2 + startProgress * xExtent
      const xEnd = -xExtent / 2 + endProgress * xExtent
      const xCenter = (xStart + xEnd) / 2
      
      const altM = floor / 3.28084
      const altMCeil = ceiling / 3.28084
      const yFloor = (altM / maxPositiveElev) * maxHeight
      const yCeiling = (altMCeil / maxPositiveElev) * maxHeight
      const yCenter = (yFloor + yCeiling) / 2
      
      // Convert to approximate percentage (rough mapping from 3D to 2D)
      // xCenter ranges from -3 to 3, map to 10% to 80% of canvas
      const xPercent = ((xCenter + 3) / 6) * 70 + 10
      // yCenter ranges from 0 to ~2, map to 80% to 20% (inverted for screen coords)
      const yPercent = 80 - (yCenter / maxHeight) * 60
      
      if (labelMap.has(dedupKey)) {
        const existing = labelMap.get(dedupKey)!
        existing.count++
        existing.boxPositions.push({ xCenter: xPercent, yCenter: yPercent })
      } else {
        labelMap.set(dedupKey, {
          key: airspace.id || `label-${idx}`,
          type: airspace.type,
          color,
          floorM,
          ceilingM,
          count: 1,
          boxPositions: [{ xCenter: xPercent, yCenter: yPercent }]
        })
      }
    })
    
    // Sort by ceiling altitude (highest first)
    return Array.from(labelMap.values()).sort((a, b) => b.ceilingM - a.ceilingM)
  }, [airspaces, maxElev])
  
  // Calculate label Y positions to avoid overlap and for connection lines
  const labelPositions = useMemo(() => {
    const positions: { label: typeof airspaceLabels[0], yPercent: number }[] = []
    const labelHeight = 40 // approximate height of each label in pixels
    const startY = 12 // start from top
    
    airspaceLabels.forEach((label, idx) => {
      positions.push({
        label,
        yPercent: startY + idx * (labelHeight + 4)
      })
    })
    return positions
  }, [airspaceLabels])
  
  return (
    <div style={{ position: 'relative', width: '100%', height: isFullscreen ? '100%' : '400px', display: 'flex' }}>
      {/* 3D Canvas */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <Canvas 
          style={{ 
            width: '100%', 
            height: '100%', 
            borderRadius: isFullscreen ? '0' : '8px', 
            background: 'linear-gradient(to bottom, #e0f2fe, #f0f9ff)' 
          }} 
          camera={{ position: [0, 4, 10], fov: 50, near: 0.1, far: 100 }}
          dpr={1}
          gl={{ 
            antialias: false,
            powerPreference: 'high-performance',
            alpha: true,
            stencil: false,
            depth: true
          }}
        >
          <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={0.7} />
        <directionalLight position={[-3, 5, -3]} intensity={0.3} />
        
        <TerrainMesh cells={cells} minElev={minElev} maxElev={maxElev} width={width} />
        <RoutePath cells={cells} minElev={minElev} maxElev={maxElev} width={width} />
        <ScaleLabels minElev={minElev} maxElev={maxElev} width={width} />
        <VerticalScaleBar maxAltM={maxAltM} maxElev={maxElev} />
        <DistanceMarkers totalDistanceKm={totalDistanceKm} />
        
        {/* Airspace volumes (no labels) */}
        {airspaces.length > 0 && (
          <AirspaceVolumes airspaces={airspaces} maxElev={maxElev} />
        )}
        
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          enableDamping={false}
          rotateSpeed={1.2}
          panSpeed={1.0}
          zoomSpeed={1.2}
          screenSpacePanning={true}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.2}
          minDistance={3}
          maxDistance={20}
          mouseButtons={{
            LEFT: 0,    // THREE.MOUSE.ROTATE
            MIDDLE: 1,  // THREE.MOUSE.DOLLY
            RIGHT: 2    // THREE.MOUSE.PAN
          }}
        />
      </Canvas>
      </div>
      
      {/* External labels panel */}
      {airspaceLabels.length > 0 && (
        <div style={{ 
          width: '120px', 
          flexShrink: 0,
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          overflowY: 'auto',
          maxHeight: isFullscreen ? '100%' : '400px'
        }}>
          {labelPositions.map(({ label }) => (
            <div
              key={label.key}
              style={{
                padding: '6px 8px',
                backgroundColor: `${label.color}15`,
                border: `1px solid ${label.color}40`,
                borderRadius: '4px',
                fontSize: '10px',
                lineHeight: '1.3'
              }}
            >
              <div style={{ 
                fontWeight: '600', 
                color: label.color,
                marginBottom: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {label.type}{label.count > 1 ? ` (${label.count})` : ''}
              </div>
              <div style={{ color: '#6b7280', fontSize: '9px' }}>
                {label.floorM}-{label.ceilingM}m
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
