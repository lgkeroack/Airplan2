"use client"

import dynamic from 'next/dynamic'
import type { AirspaceData } from '@/lib/types'

// Dynamically import the Three.js component with SSR disabled
// This is the ONLY way to properly prevent Three.js from loading on the server
const ThreeCanvasInner = dynamic(
  () => import('./ThreeCanvasInner'),
  { 
    ssr: false,
    loading: () => (
      <div style={{ 
        width: '100%', 
        height: '400px', 
        backgroundColor: '#1f2937', 
        borderRadius: '8px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        color: '#9ca3af' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '8px' }}>⏳</div>
          <div>Loading 3D libraries...</div>
        </div>
      </div>
    )
  }
)

interface ElevationGridCell {
  lat: number
  lon: number
  elevation: number | null
  distanceFromPath: number
  progressAlongPath: number
}

// Extended airspace data with position info along route
interface PositionedAirspace extends AirspaceData {
  startProgress: number
  endProgress: number
}

interface ThreeCanvasProps {
  cells: ElevationGridCell[]
  minElev: number
  maxElev: number
  width: number
  airspaces?: PositionedAirspace[]
  routeBearing?: number
  totalDistanceKm?: number
  isFullscreen?: boolean
}

export default function ThreeCanvas({ cells, minElev, maxElev, width, airspaces = [], routeBearing = 0, totalDistanceKm = 0, isFullscreen = false }: ThreeCanvasProps) {
  return (
    <ThreeCanvasInner 
      cells={cells} 
      minElev={minElev} 
      maxElev={maxElev} 
      width={width} 
      airspaces={airspaces}
      routeBearing={routeBearing}
      totalDistanceKm={totalDistanceKm}
      isFullscreen={isFullscreen}
    />
  )
}