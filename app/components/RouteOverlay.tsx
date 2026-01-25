import React, { useMemo, useState, useRef, useEffect } from 'react'
import { Polyline, CircleMarker, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'

interface RoutePoint {
    id: string
    lat: number
    lon: number
    ele?: number // meters
}

interface RouteOverlayProps {
    points: RoutePoint[]
    onPointMove: (id: string, lat: number, lon: number) => void
    onSplitSegment: (index: number, lat: number, lon: number) => void
    onPointClick?: (id: string) => void
}

export default function RouteOverlay({
    points,
    onPointMove,
    onSplitSegment,
    onPointClick
}: RouteOverlayProps) {
    const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState<number | null>(null)
    const map = useMap()
    const [zoomLevel, setZoomLevel] = useState(map.getZoom())

    // Track zoom changes
    useMemo(() => {
        const handleZoomChange = () => {
            setZoomLevel(map.getZoom())
        }
        
        map.on('zoom', handleZoomChange)
        return () => {
            map.off('zoom', handleZoomChange)
        }
    }, [map])

    // Determine marker interval based on zoom level
    // Zoom < 8: 15km interval
    // Zoom 8-10: 10km interval
    // Zoom > 10: 5km interval
    const markerIntervalKm = useMemo(() => {
        if (zoomLevel < 8) return 15
        if (zoomLevel < 11) return 10
        return 5
    }, [zoomLevel])

    // Calculate midpoints for splitting
    const midpoints = useMemo(() => {
        if (points.length < 2) return []
        const mids = []
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i]
            const p2 = points[i + 1]
            mids.push({
                lat: (p1.lat + p2.lat) / 2,
                lon: (p1.lon + p2.lon) / 2,
                index: i
            })
        }
        return mids
    }, [points])

    const distanceMarkers = useMemo(() => {
        if (points.length < 2) return []
        const markers: Array<{ lat: number; lon: number; label: string }> = []
        let accumulatedDist = 0
        const markerIntervalMeters = markerIntervalKm * 1000
        let nextMarkerDist = markerIntervalMeters // Start at the interval distance

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i]
            const p2 = points[i + 1]
            const L1 = L.latLng(p1.lat, p1.lon)
            const L2 = L.latLng(p2.lat, p2.lon)
            const segmentDist = L1.distanceTo(L2)

            // Add markers along this segment
            while (accumulatedDist + segmentDist >= nextMarkerDist) {
                const remaining = nextMarkerDist - accumulatedDist
                const ratio = remaining / segmentDist
                const lat = p1.lat + (p2.lat - p1.lat) * ratio
                const lon = p1.lon + (p2.lon - p1.lon) * ratio

                markers.push({
                    lat,
                    lon,
                    label: `${nextMarkerDist / 1000}km`
                })
                nextMarkerDist += markerIntervalMeters
            }
            accumulatedDist += segmentDist
        }
        return markers
    }, [points, markerIntervalKm])

    return (
        <>
            {/* The main route line */}
            <Polyline
                positions={points.map(p => [p.lat, p.lon])}
                pathOptions={{
                    color: '#3b82f6',
                    weight: 4,
                    opacity: 0.8,
                    lineJoin: 'round'
                }}
            />

            {/* Distance Markers */}
            {distanceMarkers.map((marker, i) => (
                <Marker
                    key={`dist-${i}`}
                    position={[marker.lat, marker.lon]}
                    icon={L.divIcon({
                        className: 'distance-marker',
                        html: `<div style="background: white; padding: 1px 3px; border-radius: 3px; border: 1px solid #3b82f6; font-size: 9px; font-weight: bold; color: #3b82f6; white-space: nowrap; transform: translate(-50%, -50%); box-shadow: 0 1px 2px rgba(0,0,0,0.1);">${marker.label}</div>`,
                        iconSize: [30, 16],
                        iconAnchor: [15, 8]
                    })}
                    interactive={false}
                    zIndexOffset={50}
                />
            ))}

            {/* Vertex Markers - We use Marker with invisible icon for drag, and CircleMarker for visual */}
            {points.map((point) => (
                <React.Fragment key={point.id}>
                    {/* Visual Marker */}
                    <CircleMarker
                        center={[point.lat, point.lon]}
                        radius={6}
                        pathOptions={{
                            color: '#1d4ed8',
                            fillColor: '#ffffff',
                            fillOpacity: 1,
                            weight: 2
                        }}
                    />

                    {/* Invisible Draggable Hit Area */}
                    <DraggableMarker
                        position={[point.lat, point.lon]}
                        onDrag={(lat, lon) => onPointMove(point.id, lat, lon)}
                        onClick={() => onPointClick?.(point.id)}
                    />
                </React.Fragment>
            ))}

            {/* Midpoint Split Handles */}
            {midpoints.map((mid) => (
                <CircleMarker
                    key={`mid-${mid.index}`}
                    center={[mid.lat, mid.lon]}
                    radius={5}
                    pathOptions={{
                        color: '#3b82f6',
                        fillColor: '#3b82f6',
                        fillOpacity: 0.5,
                        weight: 1,
                        opacity: 0.6
                    }}
                    eventHandlers={{
                        mouseover: (e) => {
                            e.target.setStyle({ fillOpacity: 1, radius: 7, weight: 2, color: 'white' })
                            setHoveredSegmentIndex(mid.index)
                        },
                        mouseout: (e) => {
                            e.target.setStyle({ fillOpacity: 0.5, radius: 5, weight: 1, color: '#3b82f6' })
                            setHoveredSegmentIndex(null)
                        },
                        mousedown: (e) => {
                            L.DomEvent.stopPropagation(e)
                            // Convert to real point
                            onSplitSegment(mid.index, mid.lat, mid.lon)
                        }
                    }}
                />
            ))}
        </>
    )
}

// Helper component for draggable handles
function DraggableMarker({
    position,
    onDrag,
    onClick
}: {
    position: [number, number],
    onDrag: (lat: number, lon: number) => void,
    onClick: () => void
}) {
    const markerRef = useRef<L.Marker>(null)

    const eventHandlers = useMemo(
        () => ({
            drag() {
                // Update position during drag
                const marker = markerRef.current
                if (marker != null) {
                    const { lat, lng } = marker.getLatLng()
                    onDrag(lat, lng)
                }
            },
            dragend() {
                // Final position update on drag end
                const marker = markerRef.current
                if (marker != null) {
                    const { lat, lng } = marker.getLatLng()
                    onDrag(lat, lng)
                }
            },
            click(e: L.LeafletMouseEvent) {
                L.DomEvent.stopPropagation(e)
                onClick()
            }
        }),
        [onDrag, onClick],
    )

    // Update marker position when position prop changes
    useEffect(() => {
        const marker = markerRef.current
        if (marker != null) {
            marker.setLatLng(position)
        }
    }, [position])

    // Invisible icon for larger touch target around the point
    const icon = L.divIcon({
        className: 'custom-drag-handle',
        html: '<div style="width: 24px; height: 24px; background: transparent; cursor: grab;"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    })

    return (
        <Marker
            draggable={true}
            eventHandlers={eventHandlers}
            position={position}
            icon={icon}
            ref={markerRef}
            zIndexOffset={100} // Ensure drag handle is on top
        />
    )
}
