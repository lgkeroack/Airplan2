'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef, useId } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Circle, Polyline, Polygon } from 'react-leaflet'
import L, { DivIcon, LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import SidePanel from './SidePanel'
import { findAirspacesAtPoint, findAirspacesNearby } from '@/lib/point-in-airspace'

import dynamic from 'next/dynamic'
import RouteBuilderUI from './RouteBuilderUI'
import type { AirspaceData } from '@/lib/types'
import { validateOpenAirFile } from '@/lib/validate-openair'

const RouteOverlay = dynamic(() => import('./RouteOverlay'), { ssr: false })
import type { ElevationCellData } from './AirspaceCylinder'

// Fix for default marker icon in Next.js
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  })
}

// Check if two line segments intersect (for self-intersection detection)


export interface RoutePoint {
  id: string
  lat: number
  lon: number
  ele?: number
}

// Calculate distance between two points in meters
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

// Calculate bearing between two points in radians
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

// Generate terrain corridor polygon for a route
function generateTerrainCorridorPolygon(points: RoutePoint[], widthKm: number): [number, number][] {
  if (points.length < 2) return []

  const leftSide: { lat: number; lon: number }[] = []
  const rightSide: { lat: number; lon: number }[] = []

  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    let bearing: number

    if (i === 0) {
      // First point: use bearing to next point
      bearing = getBearingRadians(p.lat, p.lon, points[i + 1].lat, points[i + 1].lon)
    } else if (i === points.length - 1) {
      // Last point: use bearing from previous point
      bearing = getBearingRadians(points[i - 1].lat, points[i - 1].lon, p.lat, p.lon)
    } else {
      // Middle points: average bearing
      const bearingIn = getBearingRadians(points[i - 1].lat, points[i - 1].lon, p.lat, p.lon)
      const bearingOut = getBearingRadians(p.lat, p.lon, points[i + 1].lat, points[i + 1].lon)
      // Average the bearings (handle wraparound)
      const sinAvg = (Math.sin(bearingIn) + Math.sin(bearingOut)) / 2
      const cosAvg = (Math.cos(bearingIn) + Math.cos(bearingOut)) / 2
      bearing = Math.atan2(sinAvg, cosAvg)
    }

    // Calculate perpendicular points
    const leftPoint = calculateDestinationPoint(p.lat, p.lon, bearing - Math.PI / 2, widthKm / 2)
    const rightPoint = calculateDestinationPoint(p.lat, p.lon, bearing + Math.PI / 2, widthKm / 2)

    leftSide.push(leftPoint)
    rightSide.push(rightPoint)
  }

  // Build polygon: left side forward, then right side backward to close the polygon
  const polygon: [number, number][] = [
    ...leftSide.map(p => [p.lat, p.lon] as [number, number]),
    ...rightSide.reverse().map(p => [p.lat, p.lon] as [number, number])
  ]

  return polygon
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
  onMouseOut,
  onDoubleClick,
  isDrawingRoute
}: {
  onMapClick: (lat: number, lon: number, event?: L.LeafletMouseEvent) => void,
  setMapBounds: (bounds: { north: number; south: number; east: number; west: number }) => void,
  boundsUpdateTimerRef: React.MutableRefObject<NodeJS.Timeout | null>,
  mapRef: React.MutableRefObject<LeafletMap | null>,
  onMouseMove?: (lat: number, lon: number) => void,
  onMouseOut?: () => void,
  onDoubleClick?: () => void,
  isDrawingRoute?: boolean
}) {
  const map = useMap()

  useEffect(() => {
    mapRef.current = map
    // Ensure native Leaflet dragging is disabled; we'll handle panning manually
    try {
      map.dragging.disable()
    } catch {}

    // Disable double-click zoom when drawing route
    if (isDrawingRoute) {
      map.doubleClickZoom.disable()
    } else {
      map.doubleClickZoom.enable()
    }

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
      // Re-enable on cleanup
      if (map && isDrawingRoute) {
        map.doubleClickZoom.enable()
      }
    }
  }, [map, mapRef, setMapBounds, isDrawingRoute])

  // Track whether a drag occurred to prevent click events after dragging
  const isDraggingRef = useRef(false)
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasDraggedRef = useRef(false)
  const mouseDownPosRef = useRef<{ lat: number; lon: number } | null>(null)
  const mouseMovedRef = useRef(false)
  // Manual pan tracking using container pixel points
  const manualDragActiveRef = useRef(false)
  const lastContainerPointRef = useRef<L.Point | null>(null)

  useMapEvents({
    mousedown: (e) => {
      // Reset drag tracking and record mouse down position
      hasDraggedRef.current = false
      mouseMovedRef.current = false
      mouseDownPosRef.current = { lat: e.latlng.lat, lon: e.latlng.lng }
      // Begin manual drag: record starting container point
      manualDragActiveRef.current = true
      lastContainerPointRef.current = map.latLngToContainerPoint(e.latlng)
    },
    mousemove: (e) => {
      // Check if mouse moved significantly from mousedown position
      if (mouseDownPosRef.current) {
        const latDiff = Math.abs(e.latlng.lat - mouseDownPosRef.current.lat)
        const lonDiff = Math.abs(e.latlng.lng - mouseDownPosRef.current.lon)
        // If moved more than ~0.0001 degrees (about 10 meters), consider it a drag
        if (latDiff > 0.0001 || lonDiff > 0.0001) {
          mouseMovedRef.current = true
        }
      }
      // Manual pan while dragging
      if (manualDragActiveRef.current && lastContainerPointRef.current) {
        const currentPt = map.latLngToContainerPoint(e.latlng)
        const dx = currentPt.x - lastContainerPointRef.current.x
        const dy = currentPt.y - lastContainerPointRef.current.y
        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
          // Pan by the negative delta to move the map with the cursor
          map.panBy(new L.Point(-dx, -dy), { animate: false })
          lastContainerPointRef.current = currentPt
          isDraggingRef.current = true
          hasDraggedRef.current = true
        }
      }
      if (onMouseMove) {
        onMouseMove(e.latlng.lat, e.latlng.lng)
      }
    },
    dragstart: () => {
      // Mark that a drag is occurring
      isDraggingRef.current = true
      hasDraggedRef.current = true
      mouseMovedRef.current = true
      // Clear any pending timeout
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current)
        dragTimeoutRef.current = null
      }
    },
    drag: () => {
      // Continuously mark as dragging during the drag
      isDraggingRef.current = true
      hasDraggedRef.current = true
      mouseMovedRef.current = true
    },
    mouseup: () => {
      // End manual drag on mouse up
      manualDragActiveRef.current = false
      lastContainerPointRef.current = null
      // Keep drag flag set for longer to ensure click events don't fire
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current)
      }
      dragTimeoutRef.current = setTimeout(() => {
        isDraggingRef.current = false
        hasDraggedRef.current = false
        mouseMovedRef.current = false
        mouseDownPosRef.current = null
        dragTimeoutRef.current = null
      }, 300)
    },
    dragend: () => {
      // Keep drag flag set for longer to ensure click events don't fire
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current)
      }
      dragTimeoutRef.current = setTimeout(() => {
        isDraggingRef.current = false
        hasDraggedRef.current = false
        mouseMovedRef.current = false
        mouseDownPosRef.current = null
        dragTimeoutRef.current = null
      }, 300)
    },
    click: (e) => {
      // Block click if any drag occurred, mouse moved, or currently marked as dragging
      if (!isDraggingRef.current && !hasDraggedRef.current && !mouseMovedRef.current) {
        onMapClick(e.latlng.lat, e.latlng.lng, e)
      }
      // Reset tracking after click attempt
      mouseDownPosRef.current = null
      mouseMovedRef.current = false
    },
    dblclick: (e) => {
      // Prevent default zoom on double-click only when drawing route
      if (onDoubleClick) {
        e.originalEvent.preventDefault()
        e.originalEvent.stopPropagation()
        onDoubleClick()
      }
    },
    mouseout: () => {
      if (onMouseOut) {
        onMouseOut()
      }
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

// Get point at a specific distance along the route
function getRoutePointAtDistance(
  route: Array<{ lat: number; lon: number }>,
  distanceKm: number
): { lat: number; lon: number } | null {
  if (route.length < 2) return null
  
  // Calculate distance between two points in km
  const distanceKmBetween = (p1: { lat: number; lon: number }, p2: { lat: number; lon: number }): number => {
    const dx = (p2.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
    const dy = (p2.lat - p1.lat) * 111
    return Math.sqrt(dx * dx + dy * dy)
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
  // Use a unique ID to track this instance
  const instanceId = useId()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  // Generate a fresh container id per mount so dev-mode double-mounts
  // don't reuse the same DOM node for Leaflet (prevents _initContainer errors)
  const containerIdRef = useRef<string>(`leaflet-${Math.random().toString(36).slice(2)}`)

  // Defer mounting the MapContainer until after commit to avoid
  // Leaflet initialization during React StrictMode's mount/unmount/mount.
  const [showMap, setShowMap] = useState(false)
  useEffect(() => {
    setShowMap(true)
    return () => setShowMap(false)
  }, [])

  // Ensure we remove the Leaflet map instance on unmount to avoid
  // leftover DOM state that can cause "reused by another instance" errors.
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch (e) {
          // ignore removal errors
        }
        mapRef.current = null
      }
    }
  }, [])



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
  // Start with side panel closed and no active tab; center on Squamish, BC
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [sidePanelActiveTab, setSidePanelActiveTab] = useState<'layers' | 'files' | 'aircolumn' | 'search' | 'settings' | null>(null)
  const [mapCenter, setMapCenter] = useState<LatLngExpression>([49.7016, -123.1558])
  const [mapZoom, setMapZoom] = useState(10)
  const mapRef = useRef<LeafletMap | null>(null)
  const [clickedPoint, setClickedPoint] = useState<{ lat: number; lon: number } | null>(null)
  const [mapBounds, setMapBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null)
  const boundsUpdateTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [selectedAirspaceId, setSelectedAirspaceId] = useState<string | string[] | null>(null)
  const [elevation, setElevation] = useState<number | null>(null)
  const [isElevationLoading, setIsElevationLoading] = useState(false)
  const lastClickRef = useRef<{ lat: number; lon: number; time: number } | null>(null)

  // Context menu state for map click options
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    lat: number
    lon: number
  } | null>(null)

  // Initialize fetchRadius from localStorage, default to 1km
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
    return 1
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

  // Route Drawing State
  const [isDrawingRoute, setIsDrawingRoute] = useState(false)
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([])
  const [undoStack, setUndoStack] = useState<RoutePoint[][]>([])
  const [redoStack, setRedoStack] = useState<RoutePoint[][]>([])

  // When the user begins drawing a route, close any open popups/tooltips
  // so they don't clutter the map while drawing.
  useEffect(() => {
    if (isDrawingRoute && mapRef.current) {
      try {
        mapRef.current.closePopup()
        // also close any open tooltips
        // @ts-ignore - Leaflet map has closeTooltip in runtime
        if (typeof (mapRef.current as any).closeTooltip === 'function') {
          ;(mapRef.current as any).closeTooltip()
        }
      } catch (e) {
        // ignore
      }
    }
  }, [isDrawingRoute])

  // Finished routes with their terrain profiles
  const [finishedRoutes, setFinishedRoutes] = useState<Array<{
    id: string
    points: RoutePoint[]
    terrainProfileWidth: number
  }>>([])
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const routeStats = useMemo(() => {
    let distance = 0

    for (let i = 0; i < routePoints.length - 1; i++) {
      distance += getDistanceMeters(
        routePoints[i].lat, routePoints[i].lon,
        routePoints[i + 1].lat, routePoints[i + 1].lon
      )
    }

    return { distance }
  }, [routePoints])

  // Helper to push state to undo stack
  const pushToUndo = useCallback(() => {
    setUndoStack(prev => [...prev, routePoints])
    setRedoStack([]) // Clear redo stack on new action
  }, [routePoints])

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

  // Sync routeRadius with fetchRadius when not drawing
  useEffect(() => {
    if (!isDrawingRoute) {
      setRouteRadius(fetchRadius)
    }
  }, [fetchRadius, isDrawingRoute])

  const handleMapClick = useCallback((lat: number, lon: number, event?: L.LeafletMouseEvent) => {
    // Normalize coordinates to 6 decimal places to prevent tiny epsilon changes
    const nLat = Number(lat.toFixed(6))
    const nLon = Number(lon.toFixed(6))

    // Click guard: Prevent double-processing of the same event 
    // (e.g., when both a polygon and the map trigger a click)
    const now = Date.now()
    if (lastClickRef.current &&
      now - lastClickRef.current.time < 150 &&
      Math.abs(lastClickRef.current.lat - nLat) < 0.0001 &&
      Math.abs(lastClickRef.current.lon - nLon) < 0.0001) {
      return
    }
    lastClickRef.current = { lat: nLat, lon: nLon, time: now }

    // If drawing route, add point directly
    if (isDrawingRoute) {
      pushToUndo()
      const newPoint: RoutePoint = {
        id: crypto.randomUUID(),
        lat: nLat,
        lon: nLon
      }
      setRoutePoints(prev => [...prev, newPoint])
      return
    }

    // Show context menu for user to choose action
    // Get screen position from the event
    const screenX = event?.originalEvent?.clientX ?? window.innerWidth / 2
    const screenY = event?.originalEvent?.clientY ?? window.innerHeight / 2
    
    setContextMenu({
      visible: true,
      x: screenX,
      y: screenY,
      lat: nLat,
      lon: nLon
    })
  }, [isDrawingRoute, pushToUndo])

  // Handle "Retrieve Airspace" from context menu
  const handleRetrieveAirspace = useCallback(() => {
    if (!contextMenu) return
    
    const { lat, lon } = contextMenu
    setContextMenu(null) // Close menu
    
    // Set clicked point
    setClickedPoint({ lat, lon })

    // Check if there are airspaces at this point
    const airspacesAtClick = findAirspacesNearby({ latitude: lat, longitude: lon }, fetchRadius, allAirspaces)
    
    // Open side panel and show aircolumn tab
    setIsPanelOpen(true)
    setSidePanelActiveTab('aircolumn')
    
    // Reset selection state
    setSelectedAirspaceId(null)
    setIsElevationLoading(true)
    setElevation(null)

    // Fetch elevation for this spot
    fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`)
      .then(res => res.json())
      .then(data => {
        if (data.results?.[0]) {
          // Store in meters, convert in UI
          setElevation(Math.round(data.results[0].elevation))
        }
      })
      .catch(err => console.error('Elevation fetch error:', err))
      .finally(() => setIsElevationLoading(false))
  }, [contextMenu, fetchRadius, allAirspaces])

  // Handle "Start Route" from context menu
  const handleStartRouteFromMenu = useCallback(() => {
    if (!contextMenu) return
    
    const { lat, lon } = contextMenu
    setContextMenu(null) // Close menu
    
    // Start route drawing with this point as the first node
    setIsDrawingRoute(true)
    setRoutePoints([{ id: crypto.randomUUID(), lat, lon }])
    setUndoStack([])
    setRedoStack([])
    setFinishedRoutes([])
    setSelectedRouteId(null)
    setIsPanelOpen(false)
    setClickedPoint(null)
  }, [contextMenu])



  // Route Handlers
  const handleStartMeasurement = useCallback(() => {
    setIsDrawingRoute(true)
    // Start with the clicked point as the first node
    if (clickedPoint) {
      setRoutePoints([{ id: crypto.randomUUID(), lat: clickedPoint.lat, lon: clickedPoint.lon }])
    } else {
      setRoutePoints([])
    }
    setUndoStack([])
    setRedoStack([])
    setFinishedRoutes([])
    setSelectedRouteId(null)
    setIsPanelOpen(false)
  }, [clickedPoint])

  const handleRoutePointMove = useCallback((id: string, lat: number, lon: number) => {
    pushToUndo()
    setRoutePoints(prev => prev.map(p => {
      if (p.id === id) {
        // Fetch new elevation on move end (if we wanted to be precise, or draggable updates it)
        // For now just update coords
        return { ...p, lat, lon }
      }
      return p
    }))
  }, [pushToUndo])

  const handleSplitSegment = useCallback((index: number, lat: number, lon: number) => {
    pushToUndo()
    const newPoint: RoutePoint = {
      id: crypto.randomUUID(),
      lat,
      lon
    }



    // Insert after index
    setRoutePoints(prev => [
      ...prev.slice(0, index + 1),
      newPoint,
      ...prev.slice(index + 1)
    ])
  }, [pushToUndo])

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    const newUndo = undoStack.slice(0, -1)

    setRedoStack(cur => [...cur, routePoints])
    setRoutePoints(prev)
    setUndoStack(newUndo)
  }, [undoStack, routePoints])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    const newRedo = redoStack.slice(0, -1)

    setUndoStack(cur => [...cur, routePoints])
    setRoutePoints(next)
    setRedoStack(newRedo)
  }, [redoStack, routePoints])

  const handleRouteClear = useCallback(() => {
    pushToUndo()
    setRoutePoints([])
  }, [pushToUndo])

  const handleRouteImport = useCallback((points: Array<{ lat: number; lon: number; ele?: number }>) => {
    pushToUndo()
    const newPoints = points.map(p => ({
      id: crypto.randomUUID(),
      lat: p.lat,
      lon: p.lon,
      ele: p.ele
    }))
    setRoutePoints(newPoints)

    // Fit map to imported route
    if (mapRef.current && newPoints.length > 0) {
      const bounds = L.latLngBounds(newPoints.map(p => [p.lat, p.lon]))
      mapRef.current.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [pushToUndo])

  const handleRouteFinish = useCallback(() => {
    if (isDrawingRoute && routePoints.length >= 2) {
      setIsDrawingRoute(false)

      // Save finished route with terrain profile width set to current fetchRadius
      const routeId = crypto.randomUUID()
      setFinishedRoutes(prev => [...prev, {
        id: routeId,
        points: routePoints,
        terrainProfileWidth: fetchRadius
      }])

      setSelectedRouteId(routeId)

      // Open side panel and show air column tab
      setIsPanelOpen(true)
      setSidePanelActiveTab('aircolumn')

      // Clear drawing state
      setRoutePoints([])
      setUndoStack([])
      setRedoStack([])
    }
  }, [isDrawingRoute, routePoints, fetchRadius])

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
              interactive: false,
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
              interactive: false,
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
              interactive: false,
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
      <div
        id={`leaflet-wrapper-${instanceId}`}
        ref={el => {
          // Only set the ref if not already set, to avoid TypeScript read-only error
          if (!mapContainerRef.current && el) {
            (mapContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el as HTMLDivElement | null;
          }
          if (el) {
            const existing = el.querySelector('.leaflet-container') as any;
            if (existing && existing._leaflet_id) {
              try {
                delete existing._leaflet_id;
              } catch (e) {
                // ignore
              }
            }
          }
        }}
        style={{ height: '100%', width: '100%' }}
      >
        {showMap && (
          <MapContainer
            key={containerIdRef.current}
            id={containerIdRef.current}
            ref={mapRef}
            center={mapCenter}
            zoom={mapZoom}
            style={{ height: '100%', width: '100%', zIndex: 1 }}
            scrollWheelZoom={true}
            zoomControl={false}
            preferCanvas={true}
            closePopupOnClick={false}
            scrollWheelZoom={true}
            dragging={false}
      >
        <MapInitializer center={mapCenter} zoom={mapZoom} />
        <MapClickHandler
          onMapClick={handleMapClick}
          setMapBounds={setMapBounds}
          boundsUpdateTimerRef={boundsUpdateTimerRef}
          mapRef={mapRef}
          onMouseMove={(lat, lon) => setCursorPosition({ lat, lon })}
          onMouseOut={() => setCursorPosition(null)}
          isDrawingRoute={isDrawingRoute}
          onDoubleClick={handleRouteFinish}
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

        {/* Route Builder Overlay */}
        {isDrawingRoute && (
          <>
            {/* Preview terrain corridor while drawing */}
            {routePoints.length >= 2 && (
              <Polygon
                positions={generateTerrainCorridorPolygon(routePoints, fetchRadius)}
                pathOptions={{
                  color: '#3b82f6',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.1,
                  weight: 1,
                  dashArray: '3, 3',
                  interactive: false,
                }}
              />
            )}
            <RouteOverlay
              points={routePoints}
              onPointMove={handleRoutePointMove}
              onSplitSegment={handleSplitSegment}
            />
          </>
        )}

        {/* Finished Routes Display */}
        {finishedRoutes.map((route) => (
          <React.Fragment key={route.id}>
            {/* Terrain Corridor Polygon */}
            <Polygon
              positions={generateTerrainCorridorPolygon(route.points, route.terrainProfileWidth)}
              pathOptions={{
                color: '#10b981',
                fillColor: '#10b981',
                fillOpacity: 0.15,
                weight: 2,
                dashArray: '5, 5',
                interactive: false,
              }}
            />
            {/* Route Line Overlay */}
            <RouteOverlay
              points={route.points}
              onPointMove={(id, lat, lon) => {
                setFinishedRoutes(prev => prev.map(r => 
                  r.id === route.id ? {
                    ...r,
                    points: r.points.map(p => p.id === id ? { ...p, lat, lon } : p)
                  } : r
                ))
              }}
              onSplitSegment={(index, lat, lon) => {
                const newPoint = {
                  id: crypto.randomUUID(),
                  lat,
                  lon
                }
                setFinishedRoutes(prev => prev.map(r => 
                  r.id === route.id ? {
                    ...r,
                    points: [
                      ...r.points.slice(0, index + 1),
                      newPoint,
                      ...r.points.slice(index + 1)
                    ]
                  } : r
                ))
              }}
            />
          </React.Fragment>
        ))}

        {/* Preview circle following cursor */}
        {cursorPosition && !clickedPoint && !isDrawingRoute && (
          <Circle
            center={[cursorPosition.lat, cursorPosition.lon]}
            radius={fetchRadius * 1000}  // Convert km to meters
            pathOptions={{
              color: '#9ca3af',
              fillColor: '#3b82f6',
              fillOpacity: 0.1,
              weight: 1.5,
              dashArray: '4, 4',
              interactive: false,
            }}
          />
        )}

        {/* Circle showing cylinder base radius */}
        {clickedPoint && (
          <Circle
            center={[clickedPoint.lat, clickedPoint.lon]}
            radius={fetchRadius * 1000}  // Convert km to meters
            pathOptions={{
              color: '#3b82f6',
              fillColor: 'transparent',
              fillOpacity: 0,
              weight: 2,
              dashArray: '5, 5',
              interactive: false,
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
                      handleStartMeasurement()
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#ef4444',
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
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
                  >
                    Start drawing route
                  </button>

                </div>
              </div>
            )}
          </Popup>
        )}
          </MapContainer>
        )}
      </div>

      {/* Side Panel */}
      <SidePanel
        isOpen={isPanelOpen}
        onToggle={() => {
          const newOpenState = !isPanelOpen
          setIsPanelOpen(newOpenState)
          // When closing the panel, clear the point and route data
          if (!newOpenState) {
            setClickedPoint(null)
            setSelectedRouteId(null)
          }
        }}
        layers={layers}
        onLayerToggle={handleLayerToggle}
        onLayerOpacityChange={handleLayerOpacityChange}
        basemapOptions={basemapOptions}
        selectedBasemap={selectedBasemap}
        onBasemapChange={handleBasemapChange}
        clickedPoint={clickedPoint}
        allAirspaceData={[{ id: 'default', name: 'Default', data: initialData }]}
        fetchRadius={fetchRadius}
        onFetchRadiusChange={setFetchRadius}
        onElevationCellsChange={(cells, minElev, maxElev) => {
          setElevationCells(cells)
          setElevationRange({ min: minElev, max: maxElev })
        }}
        selectedRoute={selectedRouteId && finishedRoutes.length > 0 ? finishedRoutes.find(r => r.id === selectedRouteId) : undefined}
        activeTab={sidePanelActiveTab ?? undefined}
      />

      {/* Route Builder UI */}
      {isDrawingRoute && (
        <RouteBuilderUI
          distance={routeStats.distance}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={handleRouteClear}
          onCancel={() => setIsDrawingRoute(false)}
          onFinish={handleRouteFinish}
          onImport={handleRouteImport}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
        />
      )}

      {/* Context Menu for map clicks */}
      {contextMenu?.visible && (
        <>
          {/* Backdrop to close menu on click outside */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9998,
            }}
            onClick={() => setContextMenu(null)}
          />
          {/* Context menu */}
          <div
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e5e7eb',
              zIndex: 9999,
              minWidth: '200px',
              overflow: 'hidden',
              fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif",
              transform: `translate(${contextMenu.x > window.innerWidth - 220 ? '-100%' : '0'}, ${contextMenu.y > window.innerHeight - 120 ? '-100%' : '0'})`,
            }}
          >
            {/* Header with coordinates */}
            <div style={{
              padding: '10px 14px',
              backgroundColor: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
              fontSize: '11px',
              color: '#6b7280',
              fontWeight: 500,
            }}>
              {contextMenu.lat.toFixed(5)}, {contextMenu.lon.toFixed(5)}
            </div>

            {/* Menu options */}
            <div style={{ padding: '6px 0' }}>
              <button
                onClick={handleRetrieveAirspace}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '10px 14px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#111827',
                  textAlign: 'left',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <span>Retrieve Airspace Here</span>
              </button>

              <button
                onClick={handleStartRouteFromMenu}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '10px 14px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#111827',
                  textAlign: 'left',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <span>Start Drawing Route</span>
              </button>
            </div>
          </div>
        </>
      )}
      {/* Terrain Profile is now displayed in the side panel air column tab */}

    </div>
  )
}
