'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Circle, Polyline, Polygon } from 'react-leaflet'
import { DivIcon } from 'leaflet'
import { LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import SidePanel from './SidePanel'
import type { AirspaceData } from '@/lib/types'
import L from 'leaflet'

// Fix for default marker icon in Next.js
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  })
}

interface AirspaceMapProps {
  initialData?: AirspaceData[]
}

// Generate a corridor polygon from a route path
// Creates a "meandering slot" shape: semicircles at ends connected by a corridor
function generateRouteCorridor(
  route: Array<{ lat: number; lon: number }>,
  radiusKm: number
): Array<{ lat: number; lon: number }> {
  if (route.length < 2) return []
  
  const vertices: Array<{ lat: number; lon: number }> = []
  
  // Helper: Calculate distance between two points in km
  const distanceKm = (p1: { lat: number; lon: number }, p2: { lat: number; lon: number }): number => {
    const dx = (p2.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
    const dy = (p2.lat - p1.lat) * 111
    return Math.sqrt(dx * dx + dy * dy)
  }
  
  // Helper: Get perpendicular offset point
  const getPerpOffset = (
    p1: { lat: number; lon: number },
    p2: { lat: number; lon: number },
    offsetKm: number
  ): { left: { lat: number; lon: number }, right: { lat: number; lon: number } } => {
    const dx = (p2.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
    const dy = (p2.lat - p1.lat) * 111
    const len = Math.sqrt(dx * dx + dy * dy)
    
    if (len === 0) {
      return { left: p1, right: p1 }
    }
    
    // Perpendicular vector (normalized)
    const perpX = -dy / len
    const perpY = dx / len
    
    // Convert offset to degrees
    const offsetLat = (offsetKm / 111) * perpY
    const offsetLon = (offsetKm / (111 * Math.cos(p1.lat * Math.PI / 180))) * perpX
    
    return {
      left: { lat: p1.lat + offsetLat, lon: p1.lon + offsetLon },
      right: { lat: p1.lat - offsetLat, lon: p1.lon - offsetLon }
    }
  }
  
  // Generate semicircle points
  const generateSemicircle = (
    center: { lat: number; lon: number },
    direction: { lat: number; lon: number }, // Point the semicircle faces
    radiusKm: number,
    segments: number = 16
  ): Array<{ lat: number; lon: number }> => {
    const points: Array<{ lat: number; lon: number }> = []
    
    // Calculate direction vector
    const dx = (direction.lon - center.lon) * 111 * Math.cos(center.lat * Math.PI / 180)
    const dy = (direction.lat - center.lat) * 111
    const len = Math.sqrt(dx * dx + dy * dy)
    
    if (len === 0) return []
    
    // Angle of direction
    const dirAngle = Math.atan2(dy, dx)
    
    // Generate semicircle (facing the direction)
    const radiusDegLat = radiusKm / 111
    const radiusDegLon = radiusKm / (111 * Math.cos(center.lat * Math.PI / 180))
    
    for (let i = 0; i <= segments; i++) {
      // Semicircle from -90° to +90° relative to direction
      const angle = dirAngle - Math.PI / 2 + (i / segments) * Math.PI
      points.push({
        lat: center.lat + Math.cos(angle) * radiusDegLat,
        lon: center.lon + Math.sin(angle) * radiusDegLon
      })
    }
    
    return points
  }
  
  // Build left and right sides of corridor
  const leftSide: Array<{ lat: number; lon: number }> = []
  const rightSide: Array<{ lat: number; lon: number }> = []
  
  // For each segment, add points on left and right sides
  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i]
    const p2 = route[i + 1]
    
    // Get perpendicular offsets for this segment
    const offset = getPerpOffset(p1, p2, radiusKm)
    
    if (i === 0) {
      // First segment - add points at p1
      leftSide.push(offset.left)
      rightSide.push(offset.right)
    }
    
    // Add points at p2
    if (i < route.length - 2) {
      // Not the last segment - smooth transition at p2
      const p3 = route[i + 2]
      const offsetNext = getPerpOffset(p2, p3, radiusKm)
      
      // Average for smooth corner
      leftSide.push({
        lat: (offset.left.lat + offsetNext.left.lat) / 2,
        lon: (offset.left.lon + offsetNext.left.lon) / 2
      })
      rightSide.push({
        lat: (offset.right.lat + offsetNext.right.lat) / 2,
        lon: (offset.right.lon + offsetNext.right.lon) / 2
      })
    } else {
      // Last segment - use offsets directly at p2
      leftSide.push(offset.left)
      rightSide.push(offset.right)
    }
  }
  
  // Build polygon: start semicircle → left side → end semicircle (reversed) → right side (reversed)
  if (route.length >= 2) {
    // Start semicircle (facing first segment)
    const startSemi = generateSemicircle(route[0], route[1], radiusKm)
    vertices.push(...startSemi)
  }
  
  // Left side
  vertices.push(...leftSide)
  
  // End semicircle (facing backward from last segment, reversed)
  if (route.length >= 2) {
    const endSemi = generateSemicircle(
      route[route.length - 1],
      route[route.length - 2],
      radiusKm
    ).reverse()
    vertices.push(...endSemi)
  }
  
  // Right side (reversed to close polygon)
  vertices.push(...rightSide.reverse())
  
  // Close polygon
  if (vertices.length > 0 && 
      (vertices[0].lat !== vertices[vertices.length - 1].lat ||
       vertices[0].lon !== vertices[vertices.length - 1].lon)) {
    vertices.push(vertices[0])
  }
  
  return vertices
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
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
  
  let accumulatedDist = 0
  
  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i]
    const p2 = route[i + 1]
    const segLen = distanceKmBetween(p1, p2)
    
    if (accumulatedDist + segLen >= distanceKm) {
      // Point is on this segment
      const t = (distanceKm - accumulatedDist) / segLen
      return {
        lat: p1.lat + t * (p2.lat - p1.lat),
        lon: p1.lon + t * (p2.lon - p1.lon)
      }
    }
    
    accumulatedDist += segLen
  }
  
  // Return last point if distance exceeds route length
  return route[route.length - 1]
}

// Calculate total route length
function calculateRouteLength(route: Array<{ lat: number; lon: number }>): number {
  if (route.length < 2) return 0
  
  const distanceKm = (p1: { lat: number; lon: number }, p2: { lat: number; lon: number }): number => {
    const dx = (p2.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
    const dy = (p2.lat - p1.lat) * 111
    return Math.sqrt(dx * dx + dy * dy)
  }
  
  let total = 0
  for (let i = 0; i < route.length - 1; i++) {
    total += distanceKm(route[i], route[i + 1])
  }
  return total
}

export default function AirspaceMap({ initialData = [] }: AirspaceMapProps) {
  const [clickedPoint, setClickedPoint] = useState<{ lat: number; lon: number } | null>(null)
  const [fetchRadius, setFetchRadius] = useState(5)
  const [isDrawingRoute, setIsDrawingRoute] = useState(false)
  const [routeVertices, setRouteVertices] = useState<Array<{ lat: number; lon: number }>>([])
  const [routeRadius, setRouteRadius] = useState(5)
  const [completedRoute, setCompletedRoute] = useState<Array<{ lat: number; lon: number }> | null>(null)
  const [routeCorridor, setRouteCorridor] = useState<Array<{ lat: number; lon: number }> | null>(null)
  const [isRouteLoading, setIsRouteLoading] = useState(false)
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Layers and basemap state
  const [layers, setLayers] = useState<Array<{ id: string; name: string; visible: boolean; opacity: number }>>([
    { id: 'airspace', name: 'Airspace', visible: true, opacity: 0.7 }
  ])
  const [selectedBasemap, setSelectedBasemap] = useState('topographic')
  
  const basemapOptions = [
    { id: 'topographic', name: 'Topographic' },
    { id: 'satellite', name: 'Satellite' },
    { id: 'street', name: 'Street Map' }
  ]
  
  const handleLayerToggle = useCallback((layerId: string) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
    ))
  }, [])
  
  const handleLayerOpacityChange = useCallback((layerId: string, opacity: number) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId ? { ...layer, opacity } : layer
    ))
  }, [])
  
  const handleBasemapChange = useCallback((basemapId: string) => {
    setSelectedBasemap(basemapId)
  }, [])

  // Sync routeRadius with fetchRadius when not drawing
  useEffect(() => {
    if (!isDrawingRoute) {
      setRouteRadius(fetchRadius)
    }
  }, [fetchRadius, isDrawingRoute])

  const handleMapClick = useCallback((lat: number, lon: number) => {
    if (isRouteLoading) return
    
    if (isDrawingRoute) {
      setRouteVertices(prev => [...prev, { lat, lon }])
    } else {
      setClickedPoint({ lat, lon })
      setCompletedRoute(null)
      setRouteCorridor(null)
    }
  }, [isDrawingRoute, isRouteLoading])

  const startRouteDrawing = useCallback(() => {
    setIsDrawingRoute(true)
    setRouteVertices([])
    setClickedPoint(null)
    setCompletedRoute(null)
    setRouteCorridor(null)
  }, [])

  const addRouteVertex = useCallback((lat: number, lon: number) => {
    if (isRouteLoading) return
    setRouteVertices(prev => [...prev, { lat, lon }])
  }, [isRouteLoading])

  const undoRouteVertex = useCallback(() => {
    if (isRouteLoading) return
    setRouteVertices(prev => prev.slice(0, -1))
  }, [isRouteLoading])

  const splitRouteSegment = useCallback((lat: number, lon: number, segmentIndex: number) => {
    if (isRouteLoading) return
    setRouteVertices(prev => {
      const newVertices = [...prev]
      newVertices.splice(segmentIndex + 1, 0, { lat, lon })
      return newVertices
    })
  }, [isRouteLoading])

  const finishRouteDrawing = useCallback(async () => {
    if (routeVertices.length < 2 || isRouteLoading) return
    
    setIsRouteLoading(true)
    try {
      const corridor = generateRouteCorridor(routeVertices, routeRadius)
      setCompletedRoute([...routeVertices])
      setRouteCorridor(corridor)
      setIsDrawingRoute(false)
    } catch (error) {
      console.error('Error finishing route:', error)
    } finally {
      setIsRouteLoading(false)
    }
  }, [routeVertices, routeRadius, isRouteLoading])

  const cancelRouteDrawing = useCallback(() => {
    setIsDrawingRoute(false)
    setRouteVertices([])
    setCompletedRoute(null)
    setRouteCorridor(null)
  }, [])

  const importRoute = useCallback(async (file: File) => {
    if (isRouteLoading) return
    
    setIsRouteLoading(true)
    try {
      const text = await file.text()
      const vertices: Array<{ lat: number; lon: number }> = []
      
      if (file.name.endsWith('.gpx')) {
        const parser = new DOMParser()
        const xml = parser.parseFromString(text, 'text/xml')
        const trkpts = xml.querySelectorAll('trkpt, wpt, rtept')
        trkpts.forEach(pt => {
          const lat = parseFloat(pt.getAttribute('lat') || '0')
          const lon = parseFloat(pt.getAttribute('lon') || '0')
          if (lat && lon) vertices.push({ lat, lon })
        })
      } else if (file.name.endsWith('.igc')) {
        const lines = text.split('\n')
        lines.forEach(line => {
          if (line.startsWith('B')) {
            const latStr = line.substring(7, 15)
            const lonStr = line.substring(15, 24)
            const lat = parseFloat(latStr.substring(0, 2)) + parseFloat(latStr.substring(2)) / 60
            const lon = parseFloat(lonStr.substring(0, 3)) + parseFloat(lonStr.substring(3)) / 60
            if (lat && lon) vertices.push({ lat, lon })
          }
        })
      }
      
      if (vertices.length >= 2) {
        setRouteVertices(vertices)
        const corridor = generateRouteCorridor(vertices, routeRadius)
        setCompletedRoute(vertices)
        setRouteCorridor(corridor)
        setIsDrawingRoute(false)
      }
    } catch (error) {
      console.error('Error importing route:', error)
    } finally {
      setIsRouteLoading(false)
    }
  }, [routeRadius, isRouteLoading])

  const handleRouteFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      importRoute(file)
    }
  }, [importRoute])

  const routePolyline = useMemo(() => {
    if (routeVertices.length < 2) return null
    return routeVertices.map(v => [v.lat, v.lon] as LatLngExpression)
  }, [routeVertices])

  const routeCorridorPolygon = useMemo(() => {
    if (!routeCorridor || routeCorridor.length < 3) return null
    return routeCorridor.map(v => [v.lat, v.lon] as LatLngExpression)
  }, [routeCorridor])

  // Generate distance markers along the route
  const routeDistanceMarkers = useMemo(() => {
    if (!completedRoute || completedRoute.length < 2) return []
    
    const routeLength = calculateRouteLength(completedRoute)
    if (routeLength === 0) return []
    
    // Place markers every 1km, or every 5km if route is very long
    const interval = routeLength > 50 ? 5 : 1
    const markers: Array<{ distance: number; lat: number; lon: number }> = []
    
    for (let d = 0; d <= routeLength; d += interval) {
      const point = getRoutePointAtDistance(completedRoute, d)
      if (point) {
        markers.push({ distance: Math.round(d), ...point })
      }
    }
    
    // Always include the end marker
    if (markers.length === 0 || markers[markers.length - 1].distance < routeLength) {
      const endPoint = completedRoute[completedRoute.length - 1]
      markers.push({ distance: Math.round(routeLength), lat: endPoint.lat, lon: endPoint.lon })
    }
    
    return markers
  }, [completedRoute])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <MapContainer
        center={[56.0, -106.0]}
        zoom={5}
        style={{ height: '100%', width: '100%' }}
      >
        {selectedBasemap === 'topographic' && (
          <TileLayer
            attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            maxZoom={17}
          />
        )}
        {selectedBasemap === 'satellite' && (
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com/">Esri</a> &copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}
        {selectedBasemap === 'street' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}
        
        <MapClickHandler onMapClick={handleMapClick} />
        
        {clickedPoint && (
          <Marker position={[clickedPoint.lat, clickedPoint.lon]}>
            <Popup>
              <div>
                <button onClick={startRouteDrawing}>Start Drawing Route</button>
              </div>
            </Popup>
          </Marker>
        )}
        
        {isDrawingRoute && routePolyline && (
          <Polyline positions={routePolyline} color="blue" />
        )}
        
        {isDrawingRoute && routeVertices.map((v, i) => (
          <Circle key={i} center={[v.lat, v.lon]} radius={50} color="blue" />
        ))}
        
        {routeCorridorPolygon && (
          <Polygon positions={routeCorridorPolygon} color="green" fillOpacity={0.2} />
        )}
        
        {/* Distance markers along the route */}
        {routeDistanceMarkers.map((marker, idx) => {
          const icon = new DivIcon({
            className: 'distance-marker',
            html: `<div style="
              background-color: #3b82f6;
              color: white;
              border: 2px solid white;
              border-radius: 50%;
              width: 32px;
              height: 32px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 11px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">${marker.distance}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          })
          
          return (
            <Marker
              key={idx}
              position={[marker.lat, marker.lon]}
              icon={icon}
            >
              <Popup>
                <div style={{ textAlign: 'center', fontWeight: 'bold', color: '#3b82f6', fontSize: '14px' }}>
                  {marker.distance} km
                </div>
              </Popup>
            </Marker>
          )
        })}
        
        {/* Render airspace polygons and circles */}
        {layers.find(l => l.id === 'airspace')?.visible && initialData.map((airspace, idx) => {
          const opacity = layers.find(l => l.id === 'airspace')?.opacity || 0.7
          
          // Get airspace color based on type
          const getAirspaceColor = (type: string): string => {
            const colors: Record<string, string> = {
              'Class A': '#ff0000',
              'Class B': '#ff00ff',
              'Class C': '#ffff00',
              'Class D': '#00ffff',
              'Class E': '#00ff00',
              'Class F': '#0000ff',
              'Class G': '#808080',
              'Restricted': '#ff8800',
              'Prohibited': '#ff0000',
              'Danger': '#ff4444',
              'Warning': '#ffaa00',
              'MOA': '#00ff88',
              'Alert': '#ffaa00',
            }
            return colors[type] || '#64748b'
          }
          
          const color = getAirspaceColor(airspace.type)
          
          // Render circle-based airspace
          if (airspace.coordinates && airspace.radius !== undefined) {
            const radiusMeters = airspace.radius * 1852 // Convert NM to meters
            return (
              <Circle
                key={airspace.id || idx}
                center={[airspace.coordinates.latitude, airspace.coordinates.longitude]}
                radius={radiusMeters}
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: opacity,
                  weight: 2
                }}
              >
                <Popup>
                  <div>
                    <strong>{airspace.type}</strong>
                    {airspace.location && <div>{airspace.location}</div>}
                    {airspace.altitude?.floor !== undefined && (
                      <div>Floor: {Math.round(airspace.altitude.floor / 3.28084)}m</div>
                    )}
                    {airspace.altitude?.ceiling !== undefined && (
                      <div>Ceiling: {Math.round(airspace.altitude.ceiling / 3.28084)}m</div>
                    )}
                  </div>
                </Popup>
              </Circle>
            )
          }
          
          // Render polygon-based airspace
          if (airspace.polygon && airspace.polygon.length >= 3) {
            const positions = airspace.polygon.map(p => [p.latitude, p.longitude] as LatLngExpression)
            return (
              <Polygon
                key={airspace.id || idx}
                positions={positions}
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: opacity,
                  weight: 2
                }}
              >
                <Popup>
                  <div>
                    <strong>{airspace.type}</strong>
                    {airspace.location && <div>{airspace.location}</div>}
                    {airspace.altitude?.floor !== undefined && (
                      <div>Floor: {Math.round(airspace.altitude.floor / 3.28084)}m</div>
                    )}
                    {airspace.altitude?.ceiling !== undefined && (
                      <div>Ceiling: {Math.round(airspace.altitude.ceiling / 3.28084)}m</div>
                    )}
                  </div>
                </Popup>
              </Polygon>
            )
          }
          
          return null
        })}
      </MapContainer>

      {isDrawingRoute && (
        <div
                    style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'white',
            padding: '12px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            gap: '8px',
            alignItems: 'center'
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button onClick={undoRouteVertex} disabled={routeVertices.length === 0 || isRouteLoading}>
            Undo
          </button>
          <label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gpx,.igc"
              onChange={handleRouteFileImport}
              style={{ display: 'none' }}
            />
            <button onClick={() => fileInputRef.current?.click()} disabled={isRouteLoading}>
              Import
            </button>
          </label>
          <input
            type="number"
            value={routeRadius}
            onChange={(e) => setRouteRadius(parseFloat(e.target.value) || fetchRadius)}
            min="0.5"
            max="25"
            step="0.5"
                    style={{
              width: '80px',
              padding: '4px 8px',
              fontSize: '14px',
              textAlign: 'center',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <span>km</span>
          <button onClick={finishRouteDrawing} disabled={routeVertices.length < 2 || isRouteLoading}>
            Finish
          </button>
          <button onClick={cancelRouteDrawing} disabled={isRouteLoading}>
            Cancel
                  </button>
                </div>
      )}

      {isRouteLoading && (
        <>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: 'white',
              padding: '20px',
              borderRadius: '8px',
              zIndex: 2000,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <div className="spinner" style={{
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #3498db',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              animation: 'spin 1s linear infinite'
            }} />
            <div>Processing route...</div>
              </div>
        </>
            )}

      <SidePanel
        isOpen={isSidePanelOpen}
        onToggle={() => setIsSidePanelOpen(!isSidePanelOpen)}
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
        route={completedRoute}
        routeCorridor={routeCorridor}
        routeRadius={routeRadius}
      />
    </div>
  )
}
