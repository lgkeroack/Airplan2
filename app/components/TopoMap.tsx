'use client'

import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'

function MapInitializer({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap()
  
  useEffect(() => {
    map.setView(center, zoom)
  }, [map, center, zoom])
  
  return null
}

export default function TopoMap() {
  const mapCenter: LatLngExpression = [37.7749, -122.4194] // Default center (San Francisco)
  const mapZoom = 10

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        style={{ height: '100%', width: '100%', zIndex: 1 }}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <MapInitializer center={mapCenter} zoom={mapZoom} />
        
        {/* OpenTopoMap - Topographic Tile Layer */}
        <TileLayer
          attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
          url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          maxZoom={17}
          minZoom={0}
        />
      </MapContainer>
    </div>
  )
}
