'use client'

import { MapContainer, TileLayer, Circle, Polygon, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet'
import L, { LatLngExpression, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import SidePanel from './SidePanel'
import type { AirspaceData } from '@/lib/types'
import { validateOpenAirFile } from '@/lib/validate-openair'
import { findAirspacesAtPoint } from '@/lib/point-in-airspace'
import type { ElevationCellData } from './AirspaceCylinder'


interface Layer {
  id: string
  name: string
  visible: boolean
  opacity: number
}

// Generate a corridor polygon from a route path
function generateRouteCorridor(
  route: Array<{ lat: number; lon: number }>,
  radiusKm: number
): Array<{ lat: number; lon: number }> {
  if (route.length < 2) return []
  
  const vertices: Array<{ lat: number; lon: number }> = []
  const kmPerDegLat = 111
  const radiusDeg = radiusKm / 111
  
  // Helper to calculate perpendicular offset
  const getPerpendicularOffset = (
    p1: { lat: number; lon: number },
    p2: { lat: number; lon: number },
    distanceKm: number,
    side: 'left' | 'right'
  ): { lat: number; lon: number } => {
    const dx = p2.lon - p1.lon
    const dy = p2.lat - p1.lat
    const length = Math.sqrt(dx * dx + dy * dy)
    
    if (length === 0) return { lat: p1.lat, lon: p1.lon }
    
    // Normalize
    const nx = dx / length
    const ny = dy / length
    
    // Perpendicular vector (rotate 90 degrees)
    const perpX = -ny
    const perpY = nx
    
    // Apply side
    const sign = side === 'left' ? 1 : -1
    const offsetDeg = (distanceKm / 111) * sign
    
    return {
      lat: p1.lat + perpY * offsetDeg,
      lon: p1.lon + perpX * offsetDeg / Math.cos(p1.lat * Math.PI / 180)
    }
  }
  
  // Generate circle points around a center
  const generateCircle = (center: { lat: number; lon: number }, radiusKm: number, segments: number = 16): Array<{ lat: number; lon: number }> => {
    const points: Array<{ lat: number; lon: number }> = []
    const radiusDegLat = radiusKm / 111
    const radiusDegLon = radiusKm / (111 * Math.cos(center.lat * Math.PI / 180))
    
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      points.push({
        lat: center.lat + Math.cos(angle) * radiusDegLat,
        lon: center.lon + Math.sin(angle) * radiusDegLon
      })
    }
    return points
  }
  
  // Start circle
  const startCircle = generateCircle(route[0], radiusKm)
  vertices.push(...startCircle)
  
  // Corridor segments
  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i]
    const p2 = route[i + 1]
    
    // Get perpendicular offsets for this segment
    const left1 = getPerpendicularOffset(p1, p2, radiusKm, 'left')
    const right1 = getPerpendicularOffset(p1, p2, radiusKm, 'right')
    
    // For the last segment, also get offsets for p2
    if (i === route.length - 2) {
      const left2 = getPerpendicularOffset(p1, p2, radiusKm, 'left')
      const right2 = getPerpendicularOffset(p1, p2, radiusKm, 'right')
      
      // Add rectangle for this segment
      vertices.push(left2)
      vertices.push(right2)
    } else {
      // Get next segment for smooth connection
      const p3 = route[i + 2]
      const nextLeft = getPerpendicularOffset(p2, p3, radiusKm, 'left')
      const nextRight = getPerpendicularOffset(p2, p3, radiusKm, 'right')
      
      // Average the offsets at p2 for smooth transition
      const avgLeft = {
        lat: (left1.lat + nextLeft.lat) / 2,
        lon: (left1.lon + nextLeft.lon) / 2
      }
      const avgRight = {
        lat: (right1.lat + nextRight.lat) / 2,
        lon: (right1.lon + nextRight.lon) / 2
      }
      
      vertices.push(avgLeft)
      vertices.push(avgRight)
    }
  }
  
  // End circle (reverse order to close the polygon)
  const endCircle = generateCircle(route[route.length - 1], radiusKm).reverse()
  vertices.push(...endCircle)
  
  // Close the polygon
  if (vertices.length > 0) {
    vertices.push(vertices[0])
  }
  
  return vertices
}

// Parse GPX file
async function parseGPX(file: File): Promise<Array<{ lat: number; lon: number }>> {
  const text = await file.text()
  const parser = new DOMParser()
  const xml = parser.parseFromString(text, 'text/xml')
  
  const waypoints: Array<{ lat: number; lon: number }> = []
  
  // Try to find track points first (more common in route files)
  const trackPoints = xml.querySelectorAll('trkpt, wpt, rtept')
  
  trackPoints.forEach(point => {
    const lat = parseFloat(point.getAttribute('lat') || '0')
    const lon = parseFloat(point.getAttribute('lon') || '0')
    if (!isNaN(lat) && !isNaN(lon)) {
      waypoints.push({ lat, lon })
    }
  })
  
  return waypoints
}

// Parse IGC file
async function parseIGC(file: File): Promise<Array<{ lat: number; lon: number }>> {
  const text = await file.text()
  const lines = text.split('\n')
  const waypoints: Array<{ lat: number; lon: number }> = []
  
  for (const line of lines) {
    // IGC B records contain position data
    if (line.startsWith('B')) {
      // Format: BHHMMSSDDMMmmmNDDDMMmmmEAAAALLL
      // Extract latitude: DDMMmmmN/S
      // Extract longitude: DDDMMmmmE/W
      try {
        const latStr = line.substring(7, 15) // DDMMmmm
        const latDir = line.substring(15, 16) // N or S
        const lonStr = line.substring(16, 25) // DDDMMmmm
        const lonDir = line.substring(25, 26) // E or W
        
        const latDeg = parseInt(latStr.substring(0, 2))
        const latMin = parseInt(latStr.substring(2, 4)) + parseInt(latStr.substring(4, 7)) / 1000
        const lat = (latDeg + latMin / 60) * (latDir === 'N' ? 1 : -1)
        
        const lonDeg = parseInt(lonStr.substring(0, 3))
        const lonMin = parseInt(lonStr.substring(3, 5)) + parseInt(lonStr.substring(5, 8)) / 1000
        const lon = (lonDeg + lonMin / 60) * (lonDir === 'E' ? 1 : -1)
        
        if (!isNaN(lat) && !isNaN(lon)) {
          waypoints.push({ lat, lon })
        }
      } catch (e) {
        // Skip invalid lines
      }
    }
  }
  
  return waypoints
}

function MapInitializer({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap()

  useEffect(() => {
    map.setView(center, zoom)
  }, [map, center, zoom])

  return null
}

// Separate component for map events to prevent re-renders of the event listeners
function MapClickHandler({
  onMapClick,
  setMapBounds,
  boundsUpdateTimerRef,
  mapRef,
  onMouseMove,
  onMouseOut
}: {
  onMapClick: (lat: number, lon: number) => void,
  setMapBounds: (bounds: { north: number; south: number; east: number; west: number }) => void,
  boundsUpdateTimerRef: React.MutableRefObject<NodeJS.Timeout | null>,
  mapRef: React.MutableRefObject<LeafletMap | null>,
  onMouseMove?: (lat: number, lon: number) => void,
  onMouseOut?: () => void
}) {
  const map = useMap()

  useEffect(() => {
    mapRef.current = map

    // Set initial bounds
    const bounds = map.getBounds()
    setMapBounds({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    })

    return () => {
      mapRef.current = null
    }
  }, [map, mapRef, setMapBounds])

  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
    mousemove: (e) => {
      onMouseMove?.(e.latlng.lat, e.latlng.lng)
    },
    mouseout: () => {
      onMouseOut?.()
    },
    moveend: () => {
      if (boundsUpdateTimerRef.current) {
        clearTimeout(boundsUpdateTimerRef.current)
      }
      boundsUpdateTimerRef.current = setTimeout(() => {
        const bounds = map.getBounds()
        setMapBounds({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        })
      }, 100)
    },
    zoomend: () => {
      if (boundsUpdateTimerRef.current) {
        clearTimeout(boundsUpdateTimerRef.current)
      }
      const bounds = map.getBounds()
      setMapBounds({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      })
    }
  })

  return null
}

// Get color for airspace type/class
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

// Get fill opacity based on type
function getFillOpacity(type: string): number {
  // Lower base opacity to prevent dark stacks
  if (type === 'TFR' || type === 'Prohibited') return 0.25
  if (type === 'Restricted') return 0.2
  return 0.12 // Very low base for most classes to keep stacks <= 0.5
}

interface AirspaceMapProps {
  initialData: AirspaceData[]
}

export default function AirspaceMap({ initialData }: AirspaceMapProps) {
  // Add error checking for initialData
  useEffect(() => {
    console.log('[Client] AirspaceMap: Component mounted')
    console.log('[Client] AirspaceMap: initialData type:', typeof initialData)
    console.log('[Client] AirspaceMap: initialData is array:', Array.isArray(initialData))
    console.log('[Client] AirspaceMap: initialData length:', initialData?.length)

    if (!initialData) {
      console.error('[Client] AirspaceMap: ERROR - initialData is null or undefined')
      throw new Error('initialData is null or undefined')
    }
    if (!Array.isArray(initialData)) {
      console.error('[Client] AirspaceMap: ERROR - initialData is not an array:', initialData)
      throw new Error(`initialData is not an array, got ${typeof initialData}`)
    }
  }, [initialData])

  const [airspaceData, setAirspaceData] = useState<AirspaceData[]>(() => {
    if (!initialData) {
      console.error('[Client] AirspaceMap: ERROR in useState - initialData is null/undefined')
      return []
    }
    if (!Array.isArray(initialData)) {
      console.error('[Client] AirspaceMap: ERROR in useState - initialData is not array')
      return []
    }
    console.log('[Client] AirspaceMap: Setting state with', initialData.length, 'entries')
    return initialData
  })
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ id: string; name: string; data: AirspaceData[] }>>([])
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [mapCenter, setMapCenter] = useState<LatLngExpression>([45.5017, -73.5673])
  const [mapZoom, setMapZoom] = useState(6)
  const mapRef = useRef<LeafletMap | null>(null)
  const [clickedPoint, setClickedPoint] = useState<{ lat: number; lon: number } | null>(null)
  const [mapBounds, setMapBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null)
  const boundsUpdateTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [selectedAirspaceId, setSelectedAirspaceId] = useState<string | string[] | null>(null)
  const [elevation, setElevation] = useState<number | null>(null)
  const [isElevationLoading, setIsElevationLoading] = useState(false)
  const lastClickRef = useRef<{ lat: number; lon: number; time: number } | null>(null)

  // Initialize fetchRadius from localStorage, default to 5km
  const [fetchRadius, setFetchRadius] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('airspace-fetch-radius')
      if (saved) {
        const parsed = parseFloat(saved)
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 25) {
          return parsed
        }
      }
    }
    return 5
  })
  
  // Persist fetchRadius to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('airspace-fetch-radius', fetchRadius.toString())
    }
  }, [fetchRadius])
  
  const [elevationCells, setElevationCells] = useState<ElevationCellData[]>([])
  const [cursorPosition, setCursorPosition] = useState<{ lat: number; lon: number } | null>(null)
  const [elevationRange, setElevationRange] = useState<{ min: number; max: number }>({ min: 0, max: 100 })
  
  // Route drawing state
  const [isDrawingRoute, setIsDrawingRoute] = useState(false)
  const [routeVertices, setRouteVertices] = useState<Array<{ lat: number; lon: number }>>([])
  const [routeRadius, setRouteRadius] = useState<number>(fetchRadius) // km, default to fetchRadius
  const [completedRoute, setCompletedRoute] = useState<Array<{ lat: number; lon: number }> | null>(null)
  const [routeCorridor, setRouteCorridor] = useState<Array<{ lat: number; lon: number }> | null>(null)
  
  // Update routeRadius when fetchRadius changes (if route not started)
  useEffect(() => {
    if (!isDrawingRoute && routeVertices.length === 0) {
      setRouteRadius(fetchRadius)
    }
  }, [fetchRadius, isDrawingRoute, routeVertices.length])

  // Basemap options - all free tile providers without API keys
  const basemapOptions = [
    { id: 'openstreetmap', name: 'OpenStreetMap Standard' },
    { id: 'osm-humanitarian', name: 'OpenStreetMap Humanitarian' },
    { id: 'topographic', name: 'OpenTopoMap' },
    { id: 'cartodb-positron', name: 'CartoDB Positron (Light)' },
    { id: 'cartodb-dark', name: 'CartoDB Dark Matter' },
    { id: 'cartodb-voyager', name: 'CartoDB Voyager' },
    { id: 'esri-imagery', name: 'Esri World Imagery (Satellite)' },
    { id: 'esri-topo', name: 'Esri World Topographic' },
    { id: 'esri-street', name: 'Esri World Street Map' },
    { id: 'esri-gray', name: 'Esri Light Gray Canvas' },
    { id: 'esri-ocean', name: 'Esri Ocean Basemap' },
    { id: 'esri-natgeo', name: 'Esri National Geographic' },
    { id: 'stadia-outdoors', name: 'Stadia Outdoors' },
    { id: 'stadia-bright', name: 'Stadia OSM Bright' },
    { id: 'cyclosm', name: 'CyclOSM (Cycling)' },
  ]
  
  // Selected basemap
  const [selectedBasemap, setSelectedBasemap] = useState<string>('topographic')
  
  // Overlay layers (can be toggled independently)
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'airspace', name: 'Airspace Restrictions', visible: true, opacity: 1.0 },
    { id: 'thermal-skyways', name: 'Thermal Skyways', visible: false, opacity: 0.7 },
    { id: 'thermal-hotspots', name: 'Thermal Hotspots', visible: false, opacity: 0.7 },
  ])

  // Handle location search
  const handleSearchLocation = useCallback(async (query: string) => {
    try {
      // Try to parse as coordinates first (lat, lon)
      const coordMatch = query.match(/^([-+]?[0-9]*\.?[0-9]+),\s*([-+]?[0-9]*\.?[0-9]+)$/)
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1])
        const lon = parseFloat(coordMatch[2])
        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
          setMapCenter([lat, lon])
          setMapZoom(12)
          if (mapRef.current) {
            mapRef.current.setView([lat, lon], 12)
          }
          return
        }
      }

      // Otherwise, use geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        { headers: { 'User-Agent': 'TopographicAirspaceApp/1.0' } }
      )
      const data = await response.json()

      if (data && data.length > 0) {
        const result = data[0]
        const lat = parseFloat(result.lat)
        const lon = parseFloat(result.lon)
        setMapCenter([lat, lon])
        setMapZoom(12)
        if (mapRef.current) {
          mapRef.current.setView([lat, lon], 12)
        }
      }
    } catch (error) {
      console.error('Error searching location:', error)
    }
  }, [])


  // Airspace type visibility - get all unique types from data
  const allTypes = useMemo(() => Array.from(new Set([
    ...initialData.map(item => item.type),
    ...uploadedFiles.flatMap(file => file.data.map(item => item.type))
  ])).sort(), [initialData, uploadedFiles])

  // Combined list of all airspaces for point lookups
  const allAirspaces = useMemo(() => [
    ...airspaceData,
    ...uploadedFiles.flatMap(file => file.data)
  ], [airspaceData, uploadedFiles])

  // Generate popup content showing all airspaces at a given point
  // clickedAirspace: optionally include this airspace even if point-in-polygon fails
  const generatePopupContent = useCallback((lat: number, lon: number, clickedAirspace?: AirspaceData) => {
    let airspacesAtPoint = findAirspacesAtPoint({ latitude: lat, longitude: lon }, allAirspaces)

    // If we have a clicked airspace but it's not in the list (point-in-polygon failed for complex shape),
    // add it to the results
    if (clickedAirspace && !airspacesAtPoint.some(a => a.id === clickedAirspace.id)) {
      airspacesAtPoint = [clickedAirspace, ...airspacesAtPoint]
    }

    // Sort by ceiling, highest first
    airspacesAtPoint.sort((a, b) => (b.altitude?.ceiling || 0) - (a.altitude?.ceiling || 0))

    if (airspacesAtPoint.length === 0) {
      return <div style={{ minWidth: '200px' }}>No airspace data at this location</div>
    }

    return (
      <div style={{
        minWidth: '250px',
        maxWidth: '80vw',
        maxHeight: '40vh',
        overflowY: 'auto',
        fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif"
      }}>
        {/* Location Details Header */}
        <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '12px', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', color: '#111827', fontWeight: 'bold' }}>
            {lat.toFixed(4)}°, {lon.toFixed(4)}°
          </div>
          <div style={{ fontSize: '13px', color: '#3b82f6', fontWeight: 'bold', marginTop: '1px' }}>
            {elevation !== null ? `${Math.round(elevation * 3.28084)} ft | ${elevation} m MSL` : 'Elevation loading...'}
          </div>
        </div>

        <div style={{ fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
          {airspacesAtPoint.length} Airspace{airspacesAtPoint.length > 1 ? 's' : ''} Identified
        </div>
        {airspacesAtPoint.map((item, index) => (
          <div
            key={item.id}
            style={{
              marginBottom: index < airspacesAtPoint.length - 1 ? '12px' : '0',
              paddingBottom: index < airspacesAtPoint.length - 1 ? '12px' : '0',
              borderBottom: index < airspacesAtPoint.length - 1 ? '1px solid #eee' : 'none'
            }}
          >
            <strong style={{ color: getAirspaceColor(item.type) }}>{item.type}: {item.notamNumber}</strong>
            <br />
            {item.altitude && (
              <>
                <span style={{ fontSize: '12px' }}>
                  <strong>Altitude:</strong> {item.altitude.floor} - {item.altitude.ceiling} ft
                </span>
                <br />
              </>
            )}
            <span style={{ fontSize: '11px', color: '#666' }}>{item.location}</span>
          </div>
        ))}
      </div>
    )
  }, [allAirspaces, elevation])

  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(() =>
    new Set(allTypes) // All types visible by default
  )

  // Update visible types when allTypes changes (e.g., when files are uploaded)
  useEffect(() => {
    setVisibleTypes(prev => {
      const next = new Set(prev)
      // Add new types that aren't in the set
      allTypes.forEach(type => {
        if (!next.has(type)) {
          next.add(type)
        }
      })
      return next
    })
  }, [allTypes.join(',')])

  // Handle airspace type visibility toggle
  const handleTypeToggle = (type: string) => {
    setVisibleTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  // Handle layer visibility toggle
  const handleLayerToggle = (layerId: string) => {
    setLayers(layers.map(layer =>
      layer.id === layerId
        ? { ...layer, visible: !layer.visible }
        : layer
    ))
  }

  // Handle layer opacity change
  const handleLayerOpacityChange = (layerId: string, opacity: number) => {
    setLayers(layers.map(layer =>
      layer.id === layerId
        ? { ...layer, opacity }
        : layer
    ))
  }

  // Handle file upload
  const handleFileUpload = async (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string

          // Validate file format
          const validation = validateOpenAirFile(content)
          if (!validation.isValid) {
            reject(new Error(`Invalid OpenAir file: ${validation.errors.join('; ')}`))
            return
          }

          // Send to API for processing (server-side, uses cache if available)
          const formData = new FormData()
          formData.append('file', new Blob([content], { type: 'text/plain' }), file.name)
          formData.append('fileName', file.name)

          const response = await fetch('/api/process-file', {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            let errorMessage = 'Failed to process file'
            try {
              const errorData = await response.json()
              errorMessage = errorData.error || errorMessage
            } catch {
              errorMessage = `Server error: ${response.status} ${response.statusText}`
            }
            reject(new Error(errorMessage))
            return
          }

          const result = await response.json()
          const converted = result.data as AirspaceData[]

          if (!converted || converted.length === 0) {
            reject(new Error('No airspace data found in file'))
            return
          }

          // Generate unique ID for this file layer
          const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          const fileName = file.name

          // Add file data
          setUploadedFiles(prev => [...prev, { id: fileId, name: fileName, data: converted }])

          // Add as layer
          setLayers(prev => [...prev, {
            id: fileId,
            name: fileName,
            visible: true,
            opacity: 1.0
          }])

          resolve()
        } catch (error: any) {
          reject(new Error(`Failed to process file: ${error.message}`))
        }
      }

      reader.onerror = () => {
        reject(new Error('Failed to read file'))
      }

      reader.readAsText(file)
    })
  }

  // Route drawing functions
  const startRouteDrawing = useCallback(() => {
    setIsDrawingRoute(true)
    setRouteVertices([])
    setCompletedRoute(null)
    setRouteCorridor(null)
    setClickedPoint(null) // Close popup
  }, [])
  
  const addRouteVertex = useCallback((lat: number, lon: number) => {
    setRouteVertices(prev => [...prev, { lat, lon }])
  }, [])
  
  const undoRouteVertex = useCallback(() => {
    setRouteVertices(prev => {
      if (prev.length <= 1) return prev
      return prev.slice(0, -1)
    })
  }, [])
  
  const splitRouteSegment = useCallback((segmentIndex: number, lat: number, lon: number) => {
    setRouteVertices(prev => {
      if (segmentIndex < 0 || segmentIndex >= prev.length - 1) return prev
      const newVertices = [...prev]
      newVertices.splice(segmentIndex + 1, 0, { lat, lon })
      return newVertices
    })
  }, [])
  
  const finishRouteDrawing = useCallback(() => {
    if (routeVertices.length < 2) {
      alert('Route needs at least 2 points')
      return
    }
    setCompletedRoute(routeVertices)
    setIsDrawingRoute(false)
    setRouteVertices([])
    
    // Generate corridor polygon
    const corridor = generateRouteCorridor(routeVertices, routeRadius)
    setRouteCorridor(corridor)
    
    // Open side panel to show route analysis
    setIsPanelOpen(true)
  }, [routeVertices, routeRadius])
  
  const cancelRouteDrawing = useCallback(() => {
    setIsDrawingRoute(false)
    setRouteVertices([])
    setCompletedRoute(null)
    setRouteCorridor(null)
  }, [])
  
  // Import route from GPX or IGC file
  const importRoute = useCallback(async (file: File) => {
    try {
      let waypoints: Array<{ lat: number; lon: number }> = []
      
      if (file.name.toLowerCase().endsWith('.gpx')) {
        waypoints = await parseGPX(file)
      } else if (file.name.toLowerCase().endsWith('.igc')) {
        waypoints = await parseIGC(file)
      } else {
        alert('Unsupported file format. Please use GPX or IGC files.')
        return
      }
      
      if (waypoints.length < 2) {
        alert('Route file must contain at least 2 waypoints')
        return
      }
      
      setCompletedRoute(waypoints)
      setIsDrawingRoute(false)
      
      // Generate corridor
      const corridor = generateRouteCorridor(waypoints, routeRadius)
      setRouteCorridor(corridor)
      
      // Fit map to route
      if (mapRef.current && waypoints.length > 0) {
        const bounds = waypoints.map(w => [w.lat, w.lon] as [number, number])
        mapRef.current.fitBounds(bounds, {
          padding: [50, 50],
          maxZoom: 14,
          animate: true
        })
      }
      
      // Open side panel
      setIsPanelOpen(true)
    } catch (error) {
      console.error('Error importing route:', error)
      alert('Failed to import route file: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }, [routeRadius])
  
  // Handle route file import
  const handleRouteFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      importRoute(file)
      // Reset input
      e.target.value = ''
    }
  }, [importRoute])

  const handleMapClick = useCallback((lat: number, lon: number) => {
    // Normalize coordinates to 6 decimal places to prevent tiny epsilon changes
    const nLat = Number(lat.toFixed(6))
    const nLon = Number(lon.toFixed(6))

    // Click guard: Prevent double-processing of the same event 
    const now = Date.now()
    if (lastClickRef.current &&
      now - lastClickRef.current.time < 150 &&
      Math.abs(lastClickRef.current.lat - nLat) < 0.0001 &&
      Math.abs(lastClickRef.current.lon - nLon) < 0.0001) {
      return
    }
    lastClickRef.current = { lat: nLat, lon: nLon, time: now }

    // If in route drawing mode, check if clicking on a segment to split it
    if (isDrawingRoute) {
      // Check if click is near an existing segment (for splitting)
      let clickedSegment = -1
      const clickThreshold = 0.001 // degrees, roughly 100m
      
      for (let i = 0; i < routeVertices.length - 1; i++) {
        const p1 = routeVertices[i]
        const p2 = routeVertices[i + 1]
        
        // Calculate distance from click point to line segment
        const A = nLon - p1.lon
        const B = nLat - p1.lat
        const C = p2.lon - p1.lon
        const D = p2.lat - p1.lat
        
        const dot = A * C + B * D
        const lenSq = C * C + D * D
        let param = -1
        
        if (lenSq !== 0) param = dot / lenSq
        
        let xx, yy
        
        if (param < 0) {
          xx = p1.lon
          yy = p1.lat
        } else if (param > 1) {
          xx = p2.lon
          yy = p2.lat
        } else {
          xx = p1.lon + param * C
          yy = p1.lat + param * D
        }
        
        const dx = nLon - xx
        const dy = nLat - yy
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance < clickThreshold && param >= 0 && param <= 1) {
          clickedSegment = i
          break
        }
      }
      
      if (clickedSegment >= 0) {
        // Split the segment
        splitRouteSegment(clickedSegment, nLat, nLon)
      } else {
        // Add new vertex
        addRouteVertex(nLat, nLon)
      }
      return
    }

    // Use a temporary variable to check against current state to avoid 
    // unnecessary state updates if the point is essentially the same.
    setClickedPoint(prev => {
      if (prev && prev.lat === nLat && prev.lon === nLon) {
        return prev
      }
      return { lat: nLat, lon: nLon }
    })

    // Batch simple state resets
    setIsPanelOpen(false)
    setSelectedAirspaceId(null)
    setIsElevationLoading(true)
    setElevation(null)

    // Fetch elevation for this spot
    fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${nLat},${nLon}`)
      .then(res => res.json())
      .then(data => {
        if (data.results?.[0]) {
          // Store in meters, convert in UI
          setElevation(Math.round(data.results[0].elevation))
        }
      })
      .catch(err => console.error('Elevation fetch error:', err))
      .finally(() => setIsElevationLoading(false))
  }, [isDrawingRoute, addRouteVertex])

  // Handle airspace selection from side panel
  const handleAirspaceSelect = useCallback((ids: string | string[]) => {
    setSelectedAirspaceId(ids)

    const idList = Array.isArray(ids) ? ids : [ids]
    const selectedAirspaces = allAirspaces.filter(a => idList.includes(a.id))

    if (selectedAirspaces.length > 0 && mapRef.current) {
      const allPoints: [number, number][] = []

      selectedAirspaces.forEach(airspace => {
        if (airspace.polygon && airspace.polygon.length > 0) {
          airspace.polygon.forEach(p => allPoints.push([p.latitude, p.longitude]))
        } else if (airspace.coordinates) {
          const lat = airspace.coordinates.latitude
          const lon = airspace.coordinates.longitude
          if (airspace.radius) {
            const radiusDeg = airspace.radius / 60
            allPoints.push([lat - radiusDeg, lon - radiusDeg])
            allPoints.push([lat + radiusDeg, lon + radiusDeg])
          } else {
            allPoints.push([lat, lon])
          }
        }
      })

      if (allPoints.length > 0) {
        mapRef.current.fitBounds(allPoints as any, {
          paddingBottomRight: [isPanelOpen ? 500 : 50, 50],
          paddingTopLeft: [50, 50],
          maxZoom: 12,
          animate: true
        })
      }
    }
  }, [allAirspaces, isPanelOpen])

  // Memoize popup position to prevent flickering when elevation data loads
  const popupPosition = useMemo(() => {
    if (!clickedPoint) return null
    return [Number(clickedPoint.lat.toFixed(6)), Number(clickedPoint.lon.toFixed(6))] as LatLngExpression
  }, [clickedPoint])

  // Memoize airspace layer rendering to prevent re-computation on every render
  const airspaceLayer = useMemo(() => {
          // Filter airspaces by type and viewport bounds for performance
          const filtered = allAirspaces
            .filter(item => {
              if (!visibleTypes.has(item.type)) return false

              // Skip if no bounds yet
              if (!mapBounds) return true

              // Optimized viewport filtering using pre-calculated bounds
              const padding = 2.0
              const b = item.bounds
              if (b) {
                return b.north >= mapBounds.south - padding &&
                  b.south <= mapBounds.north + padding &&
                  b.east >= mapBounds.west - padding &&
                  b.west <= mapBounds.east + padding
              }

              // Fallback filtering if bounds missing
              if (item.polygon && item.polygon.length > 0) {
                return item.polygon.some(coord =>
                  coord.latitude >= mapBounds.south - padding &&
                  coord.latitude <= mapBounds.north + padding &&
                  coord.longitude >= mapBounds.west - padding &&
                  coord.longitude <= mapBounds.east + padding
                )
              }

              return true
            })

          return filtered.map((item) => {
            if (!item.coordinates && !item.polygon) return null

            const color = getAirspaceColor(item.type)
            const baseOpacity = getFillOpacity(item.type)
            const layerOpacity = layers.find(l => l.id === 'airspace')?.opacity || 1.0
            const fillOpacity = baseOpacity * layerOpacity
            const isSelected = Array.isArray(selectedAirspaceId)
              ? selectedAirspaceId.includes(item.id)
              : selectedAirspaceId === item.id

            // Render polygon if available
            if (item.polygon && item.polygon.length > 2) {
              const polygonCoords: LatLngExpression[] = item.polygon.map(coord => [
                coord.latitude,
                coord.longitude,
              ])
              return (
                <Polygon
                  key={item.id}
                  positions={polygonCoords}
                  pathOptions={{
                    color: isSelected ? '#facc15' : color,
                    fillColor: color,
                    fillOpacity: isSelected ? 0.6 : fillOpacity,
                    weight: isSelected ? 4 : 1.5,
                  }}
                />
              )
            }

            // Render circle if radius is available
            if (item.coordinates && item.radius) {
              const center: LatLngExpression = [
                item.coordinates.latitude,
                item.coordinates.longitude,
              ]
              // Convert radius from nautical miles to meters (1 NM = 1852 meters)
              const radiusMeters = item.radius * 1852

              return (
                <Circle
                  key={item.id}
                  center={center}
                  radius={radiusMeters}
                  pathOptions={{
                    color: isSelected ? '#facc15' : color,
                    fillColor: color,
                    fillOpacity: isSelected ? 0.6 : fillOpacity,
                    weight: isSelected ? 4 : 1.5,
                  }}
                />
              )
            }

            // Fallback: render a small marker if only coordinates available
            if (item.coordinates) {
              const center: LatLngExpression = [
                item.coordinates.latitude,
                item.coordinates.longitude,
              ]
              const radiusMeters = 1852 // 1 nautical mile default

              return (
                <Circle
                  key={item.id}
                  center={center}
                  radius={radiusMeters}
                  pathOptions={{
                    color: isSelected ? '#facc15' : color,
                    fillColor: color,
                    fillOpacity: isSelected ? 0.6 : fillOpacity,
                    weight: isSelected ? 4 : 1.5,
                  }}
                />
              )
            }

            return null
          })
  }, [allAirspaces, visibleTypes, mapBounds, layers, selectedAirspaceId])

  // Memoize allAirspaceData for SidePanel
  const allAirspaceData = useMemo(() => [
    { id: 'base-us', name: 'US Airspace', data: initialData },
    ...uploadedFiles
  ], [initialData, uploadedFiles])

  // Memoize currentFiles for SidePanel
  const currentFiles = useMemo(() => {
    // Extract unique files and their metadata from allAirspaceData
    const fileMap = new Map<string, { name: string; source: string; size?: number; date?: string }>()

    // Basic check for base airspace (from initialData)
    initialData.forEach(item => {
      if (item.metadata && !fileMap.has(item.metadata.fileName)) {
        fileMap.set(item.metadata.fileName, {
          name: item.metadata.fileName,
          source: item.metadata.source,
          size: item.metadata.fileSize,
          date: item.metadata.lastModified
        })
      }
    })

    // Check uploaded files
    uploadedFiles.forEach(file => {
      const firstItem = file.data[0]
      if (firstItem?.metadata) {
        fileMap.set(file.name, {
          name: file.name,
          source: firstItem.metadata.source,
          size: firstItem.metadata.fileSize,
          date: firstItem.metadata.lastModified
        })
      } else {
        // Fallback for files without metadata property
        fileMap.set(file.name, {
          name: file.name,
          source: 'User Upload',
        })
      }
    })

    return Array.from(fileMap.values())
  }, [initialData, uploadedFiles])

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        style={{ height: '100%', width: '100%', zIndex: 1 }}
        scrollWheelZoom={true}
        zoomControl={false}
        preferCanvas={true}
        closePopupOnClick={false}
      >
        <MapInitializer center={mapCenter} zoom={mapZoom} />
        <MapClickHandler
          onMapClick={handleMapClick}
          setMapBounds={setMapBounds}
          boundsUpdateTimerRef={boundsUpdateTimerRef}
          mapRef={mapRef}
          onMouseMove={(lat, lon) => setCursorPosition({ lat, lon })}
          onMouseOut={() => setCursorPosition(null)}
        />

        {/* Basemap Layer - selected from dropdown */}
        {selectedBasemap === 'openstreetmap' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}
        {selectedBasemap === 'osm-humanitarian' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/">HOT</a>'
            url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}
        {selectedBasemap === 'topographic' && (
          <TileLayer
            attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            subdomains={['a', 'b', 'c']}
            maxZoom={17}
          />
        )}
        {selectedBasemap === 'cartodb-positron' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20}
          />
        )}
        {selectedBasemap === 'cartodb-dark' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20}
          />
        )}
        {selectedBasemap === 'cartodb-voyager' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20}
          />
        )}
        {selectedBasemap === 'esri-imagery' && (
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}
        {selectedBasemap === 'esri-topo' && (
          <TileLayer
            attribution='Tiles &copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}
        {selectedBasemap === 'esri-street' && (
          <TileLayer
            attribution='Tiles &copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}
        {selectedBasemap === 'esri-gray' && (
          <TileLayer
            attribution='Tiles &copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            maxZoom={16}
          />
        )}
        {selectedBasemap === 'esri-ocean' && (
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"
            maxZoom={13}
          />
        )}
        {selectedBasemap === 'esri-natgeo' && (
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; National Geographic, Esri, DeLorme, NAVTEQ, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}"
            maxZoom={16}
          />
        )}
        {selectedBasemap === 'stadia-outdoors' && (
          <TileLayer
            attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
            url="https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png"
            maxZoom={20}
          />
        )}
        {selectedBasemap === 'stadia-bright' && (
          <TileLayer
            attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
            url="https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png"
            maxZoom={20}
          />
        )}
        {selectedBasemap === 'cyclosm' && (
          <TileLayer
            attribution='<a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases">CyclOSM</a> | Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png"
            maxZoom={20}
          />
        )}

        {/* Thermal Skyways Layer from thermal.kk7.ch */}
        {layers.find(l => l.id === 'thermal-skyways')?.visible && (
          <TileLayer
            attribution='thermal.kk7.ch <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC-BY-NC-SA</a>'
            url="https://thermal.kk7.ch/tiles/skyways_all_all/{z}/{x}/{y}.png?src=airplan2"
            maxNativeZoom={13}
            maxZoom={19}
            tms={true}
            opacity={layers.find(l => l.id === 'thermal-skyways')?.opacity ?? 0.7}
          />
        )}

        {/* Thermal Hotspots Layer from thermal.kk7.ch */}
        {layers.find(l => l.id === 'thermal-hotspots')?.visible && (
          <TileLayer
            attribution='thermal.kk7.ch <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC-BY-NC-SA</a>'
            url="https://thermal.kk7.ch/tiles/thermals_jul_07/{z}/{x}/{y}.png?src=airplan2"
            maxNativeZoom={12}
            maxZoom={19}
            tms={true}
            opacity={layers.find(l => l.id === 'thermal-hotspots')?.opacity ?? 0.7}
          />
        )}

        {/* Render base airspace restrictions */}
        {layers.find(l => l.id === 'airspace')?.visible && airspaceLayer}

        {/* Preview circle following cursor */}
        {cursorPosition && !clickedPoint && (
          <Circle
            center={[cursorPosition.lat, cursorPosition.lon]}
            radius={fetchRadius * 1000}  // Convert km to meters
            pathOptions={{
              color: '#9ca3af',
              fillColor: '#3b82f6',
              fillOpacity: 0.1,
              weight: 1.5,
              dashArray: '4, 4',
            }}
          />
        )}

        {/* Circle showing cylinder base radius */}
        {clickedPoint && !isDrawingRoute && (
          <Circle
            center={[clickedPoint.lat, clickedPoint.lon]}
            radius={fetchRadius * 1000}  // Convert km to meters
            pathOptions={{
              color: '#3b82f6',
              fillColor: 'transparent',
              fillOpacity: 0,
              weight: 2,
              dashArray: '5, 5',
            }}
          />
        )}

        {/* Route drawing - active route line */}
        {(isDrawingRoute && routeVertices.length > 1) && (
          <Polyline
            positions={routeVertices.map(v => [v.lat, v.lon] as LatLngExpression)}
            pathOptions={{
              color: '#22c55e',
              weight: 3,
            }}
          />
        )}

        {/* Route drawing - vertex markers */}
        {isDrawingRoute && routeVertices.map((vertex, idx) => (
          <Circle
            key={idx}
            center={[vertex.lat, vertex.lon]}
            radius={8}
            pathOptions={{
              color: idx === 0 ? '#16a34a' : '#22c55e',
              fillColor: idx === 0 ? '#16a34a' : '#22c55e',
              fillOpacity: 0.8,
              weight: 2,
            }}
          />
        ))}

        {/* Completed route corridor */}
        {routeCorridor && routeCorridor.length > 0 && (
          <Polygon
            positions={routeCorridor.map(v => [v.lat, v.lon] as LatLngExpression)}
            pathOptions={{
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.2,
              weight: 2,
            }}
          />
        )}

        {/* Completed route line */}
        {completedRoute && completedRoute.length > 1 && (
          <Polyline
            positions={completedRoute.map(v => [v.lat, v.lon] as LatLngExpression)}
            pathOptions={{
              color: '#1e40af',
              weight: 3,
            }}
          />
        )}


        {/* Single Global Popup for performance - Hide if SidePanel is open */}
        {clickedPoint && !selectedAirspaceId && popupPosition && (
          <Popup
            position={popupPosition}
            autoPan={false}
            closeOnClick={false}
            eventHandlers={{
              remove: () => {
                // We no longer clear clickedPoint here to avoid race conditions.
                // The state is cleared explicitly in handleMapClick if needed,
                // or when selecting an airspace.
              }
            }}
          >
            {isPanelOpen ? (
              generatePopupContent(clickedPoint.lat, clickedPoint.lon)
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '4px',
                minWidth: '200px',
                maxWidth: '80vw',
                maxHeight: '40vh',
                fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif",
                overflowY: 'auto'
              }}>
                {/* Coordinates and Elevation Info */}
                <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
                  <div style={{ fontSize: '13px', color: '#111827', fontWeight: 'bold' }}>
                    {clickedPoint.lat.toFixed(4)}°, {clickedPoint.lon.toFixed(4)}°
                  </div>
                  <div style={{ fontSize: '13px', color: '#3b82f6', fontWeight: 'bold', marginTop: '2px', minHeight: '1.5em' }}>
                    {isElevationLoading ? 'Loading elevation...' : (elevation !== null ? `${Math.round(elevation * 3.28084)} ft | ${elevation} m MSL` : 'Elevation unavailable')}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsPanelOpen(true)
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
                  >
                    Retrieve airspace here
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      startRouteDrawing()
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#22c55e',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#16a34a'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#22c55e'}
                  >
                    Start drawing route
                  </button>
                </div>
              </div>
            )}
          </Popup>
        )}

        {/* Route Drawing Toolbar */}
        {isDrawingRoute && (
          <div
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            style={{
              position: 'absolute',
              top: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              backgroundColor: 'white',
              padding: '12px 16px',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif"
            }}
          >
            <div style={{ marginRight: '8px', fontWeight: 'bold', color: '#374151' }}>
              Route Drawing Mode
            </div>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                undoRouteVertex()
              }}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              disabled={routeVertices.length === 0}
              style={{
                padding: '6px 12px',
                backgroundColor: routeVertices.length > 0 ? '#ef4444' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: routeVertices.length > 0 ? 'pointer' : 'not-allowed',
                transition: 'background-color 0.2s'
              }}
            >
              Undo
            </button>
            <label
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                display: 'inline-block'
              }}
            >
              Import GPX/IGC
              <input
                type="file"
                accept=".gpx,.igc"
                onChange={handleRouteFileImport}
                onClick={(e) => {
                  e.stopPropagation()
                }}
                style={{ display: 'none' }}
              />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '8px' }}>
              <label style={{ fontSize: '12px', color: '#374151', fontWeight: 'bold' }}>
                Radius (km):
              </label>
              <input
                type="number"
                min="0.5"
                max="25"
                step="0.5"
                value={routeRadius}
                onChange={(e) => setRouteRadius(parseFloat(e.target.value) || fetchRadius)}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                style={{
                  width: '60px',
                  padding: '4px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              />
            </div>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                finishRouteDrawing()
              }}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              disabled={routeVertices.length < 2}
              style={{
                padding: '6px 12px',
                backgroundColor: routeVertices.length >= 2 ? '#22c55e' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: routeVertices.length >= 2 ? 'pointer' : 'not-allowed',
                transition: 'background-color 0.2s'
              }}
            >
              Finish Route
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                cancelRouteDrawing()
              }}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              Cancel
            </button>
            <div style={{ marginLeft: '8px', fontSize: '12px', color: '#6b7280' }}>
              {routeVertices.length} point{routeVertices.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </MapContainer>
      
      {/* Side Panel */}
      <SidePanel
        isOpen={isPanelOpen}
        onToggle={() => setIsPanelOpen(!isPanelOpen)}
        layers={layers}
        onLayerToggle={handleLayerToggle}
        onLayerOpacityChange={handleLayerOpacityChange}
        basemapOptions={basemapOptions}
        selectedBasemap={selectedBasemap}
        onBasemapChange={setSelectedBasemap}
        onFileUpload={handleFileUpload}
        allAirspaceData={allAirspaceData}
        selectedAirspaceId={selectedAirspaceId}
        onAirspaceSelect={handleAirspaceSelect}
        onSearchLocation={handleSearchLocation}
        currentFiles={currentFiles}
        airspaceTypes={allTypes}
        visibleTypes={visibleTypes}
        onTypeToggle={handleTypeToggle}
        clickedPoint={clickedPoint}
        fetchRadius={fetchRadius}
        onFetchRadiusChange={setFetchRadius}
        onElevationCellsChange={(cells, minElev, maxElev) => {
          setElevationCells(cells)
          setElevationRange({ min: minElev, max: maxElev })
        }}
        route={completedRoute}
        routeCorridor={routeCorridor}
        routeRadius={routeRadius}
      />

    </div>
  )
}
