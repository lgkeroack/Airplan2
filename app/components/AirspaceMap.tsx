'use client'

import { MapContainer, TileLayer, Circle, Polygon, Popup, useMap, useMapEvents } from 'react-leaflet'
import L, { LatLngExpression, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
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

  const handleMapClick = useCallback((lat: number, lon: number) => {
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
  }, []) // Empty dependency array makes this function PERMANENTLY stable

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

        {/* Render base airspace restrictions */}
        {layers.find(l => l.id === 'airspace')?.visible && useMemo(() => {
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
        }, [allAirspaces, visibleTypes, mapBounds, layers, selectedAirspaceId, handleMapClick])}

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
                    disabled={true}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#f3f4f6',
                      color: '#9ca3af',
                      border: '2px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'not-allowed',
                      transition: 'all 0.2s',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em'
                    }}
                  >
                    Start drawing route (Coming Soon)
                  </button>
                </div>
              </div>
            )}
          </Popup>
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
        allAirspaceData={useMemo(() => [
          { id: 'base-us', name: 'US Airspace', data: initialData },
          ...uploadedFiles
        ], [initialData, uploadedFiles])}
        selectedAirspaceId={selectedAirspaceId}
        onAirspaceSelect={handleAirspaceSelect}
        onSearchLocation={handleSearchLocation}
        currentFiles={useMemo(() => {
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
        }, [initialData, uploadedFiles])}
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
      />

    </div>
  )
}
