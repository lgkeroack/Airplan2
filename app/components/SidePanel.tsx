'use client'

import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import type { AirspaceData } from '@/lib/types'
import { findAirspacesAtPoint, findAirspacesNearby } from '@/lib/point-in-airspace'
import dynamic from 'next/dynamic'
import type { ElevationCellData } from './AirspaceCylinder'

const AirspaceCylinder = dynamic(() => import('./AirspaceCylinder'), { ssr: false })
<<<<<<< HEAD
const RouteTerrainProfile = dynamic(() => import('./RouteTerrainProfile'), { ssr: false })
const TerrainProfile3D = dynamic(() => import('./RouteTerrainProfileCanvas.client'), {
  ssr: false,
  loading: () => <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading 3D…</div>
})

// Format date string for display (compact format)
function formatAirspaceDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return null
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    const day = date.getDate()
    const year = date.getFullYear()
    const now = new Date()
    if (year === now.getFullYear()) {
      return `${month} ${day}`
    }
    return `${month} ${day}, ${year}`
  } catch {
    return null
  }
}
=======
const AirspaceRoute = dynamic(() => import('./AirspaceRoute'), { ssr: false })
>>>>>>> e3b0f772e81e335bfddd7a801fd995cdb63f9b6c

interface Layer {
  id: string
  name: string
  visible: boolean
  opacity: number
}

interface RouteData {
  id: string
  points: Array<{ lat: number; lon: number }>
  terrainProfileWidth: number
}

interface SidePanelProps {
  isOpen: boolean
  onToggle: () => void
  onClose?: () => void // Kept for backward compatibility if needed, but unused
  layers: Layer[]
  onLayerToggle: (layerId: string) => void
  onLayerOpacityChange: (layerId: string, opacity: number) => void
  basemapOptions?: Array<{ id: string; name: string }>
  selectedBasemap?: string
  onBasemapChange?: (basemapId: string) => void
  onFileUpload?: (file: File) => Promise<void>
  currentFiles?: Array<{ name: string; source: string; size?: number; date?: string }>
  airspaceTypes?: string[]
  visibleTypes?: Set<string>
  onTypeToggle?: (type: string) => void
  clickedPoint?: { lat: number; lon: number } | null
  allAirspaceData?: Array<{ id: string; name: string; data: AirspaceData[] }>
  selectedAirspaceId?: string | string[] | null
  onAirspaceSelect?: (airspaceIds: string | string[]) => void
  onSearchLocation?: (query: string) => void
  fetchRadius?: number
  onFetchRadiusChange?: (radius: number) => void
  onElevationCellsChange?: (cells: ElevationCellData[], minElev: number, maxElev: number) => void
<<<<<<< HEAD
  selectedRoute?: RouteData
  activeTab?: 'layers' | 'files' | 'aircolumn' | 'search' | 'settings'
=======
  route?: Array<{ lat: number; lon: number }> | null
  routeCorridor?: Array<{ lat: number; lon: number }> | null
  routeRadius?: number
>>>>>>> e3b0f772e81e335bfddd7a801fd995cdb63f9b6c
}

export default function SidePanel({
  isOpen,
  onToggle,
  onClose,
  layers,
  onLayerToggle,
  onLayerOpacityChange,
  basemapOptions = [],
  selectedBasemap = 'topographic',
  onBasemapChange,
  onFileUpload,
  currentFiles = [],
  airspaceTypes = [],
  visibleTypes = new Set(),
  onTypeToggle,
  clickedPoint,
  allAirspaceData = [],
  selectedAirspaceId,
  onAirspaceSelect,
  onSearchLocation,
  fetchRadius: fetchRadiusProp = 5,
  onFetchRadiusChange,
  onElevationCellsChange,
<<<<<<< HEAD
  selectedRoute,
  activeTab: activeTabProp,
=======
  route,
  routeCorridor,
  routeRadius = 1,
>>>>>>> e3b0f772e81e335bfddd7a801fd995cdb63f9b6c
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<'layers' | 'files' | 'aircolumn' | 'search' | 'settings' | undefined>(activeTabProp)
  const [activeTabState, setActiveTabState] = useState<'layers' | 'files' | 'aircolumn' | 'search' | 'settings' | undefined>(activeTabProp)
  
  // Update activeTab when prop changes
  useEffect(() => { 
    setActiveTab(activeTabProp)
    setActiveTabState(activeTabProp)
  }, [activeTabProp])

  const [searchHistory, setSearchHistory] = useState<string[]>([])

  // Use prop value for fetchRadius, with local state as fallback
  const fetchRadius = fetchRadiusProp
  const setFetchRadius = (value: number) => {
    if (onFetchRadiusChange) {
      onFetchRadiusChange(value)
    }
  }
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ progress: 0, status: 'Starting...' })
  const [elevation, setElevation] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [is3DExpanded, setIs3DExpanded] = useState(false)
  const [isTerrain3DExpanded, setIsTerrain3DExpanded] = useState(false)
  
  // Extended airspace data with position info along route
  interface PositionedAirspace extends AirspaceData {
    startProgress: number
    endProgress: number
  }
  
  // State for 3D terrain profile data
  const [terrain3DData, setTerrain3DData] = useState<{
    cells: Array<{ lat: number; lon: number; elevation: number | null; distanceFromPath: number; progressAlongPath: number }>;
    minElev: number;
    maxElev: number;
    airspaces: PositionedAirspace[];
    routeBearing: number;
    totalDistanceKm: number;
  }>({ cells: [], minElev: 0, maxElev: 100, airspaces: [], routeBearing: 0, totalDistanceKm: 0 })
  
  // Memoized callback to prevent infinite re-renders
  const handleElevationDataChange = useCallback((
    cells: Array<{ lat: number; lon: number; elevation: number | null; distanceFromPath: number; progressAlongPath: number }>, 
    minElev: number, 
    maxElev: number, 
    airspaces: PositionedAirspace[],
    routeBearing: number = 0,
    totalDistanceKm: number = 0
  ) => {
    setTerrain3DData({ cells, minElev, maxElev, airspaces, routeBearing, totalDistanceKm })
  }, [])
  // Always show terrain profile for selected route

  // Handle responsive layout
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    // Initial check
    checkMobile()

    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Switch to air column tab when point is clicked or route is completed
  useEffect(() => {
    if (clickedPoint) {
      setActiveTab('aircolumn')
      setElevation(null)

      // Fetch elevation from Open-Elevation API
      fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${clickedPoint.lat},${clickedPoint.lon}`)
        .then(res => res.json())
        .then(data => {
          if (data?.results?.[0]?.elevation !== undefined) {
            // Convert meters to feet for internal consistency (1m = 3.28084ft)
            setElevation(data.results[0].elevation * 3.28084)
          }
        })
        .catch(err => console.error('Elevation fetch failed:', err))
    } else if (route && route.length > 0) {
      setActiveTab('aircolumn')
    }
  }, [clickedPoint, route])

  // Find airspaces at clicked point
  const airspacesAtPoint = useMemo(() => {
    if (!clickedPoint) return []

    const allAirspaces: AirspaceData[] = []
    allAirspaceData.forEach(source => {
      allAirspaces.push(...source.data)
    })

    console.log('[SidePanel] Searching for airspaces at', clickedPoint, 'with radius', fetchRadius, 'km')
    console.log('[SidePanel] Total airspaces to search:', allAirspaces.length)

    const found = findAirspacesNearby({ latitude: clickedPoint.lat, longitude: clickedPoint.lon }, fetchRadius, allAirspaces)
      .sort((a, b) => {
        // Sort by altitude floor (lowest first)
        const aFloor = a.altitude?.floor || 0
        const bFloor = b.altitude?.floor || 0
        return aFloor - bFloor
      })

    console.log('[SidePanel] Found', found.length, 'airspaces nearby')
    found.forEach((a, i) => {
      console.log(`  [${i}] ${a.type} (${a.id}): floor=${a.altitude?.floor}, ceiling=${a.altitude?.ceiling}`)
    })

    return found
  }, [clickedPoint, allAirspaceData, fetchRadius])

<<<<<<< HEAD

=======
  // Find airspaces along route corridor
  const airspacesAlongRoute = useMemo(() => {
    if (!routeCorridor || !Array.isArray(routeCorridor) || routeCorridor.length < 3) {
      console.log('[SidePanel] Invalid route corridor:', routeCorridor)
      return []
    }

    const allAirspaces: AirspaceData[] = []
    allAirspaceData.forEach(source => {
      allAirspaces.push(...source.data)
    })

    // Convert routeCorridor to polygon format (array of {lat, lon}) - findAirspacesInPolygon expects {lat, lon}
    const polygon = routeCorridor
      .filter(v => v && typeof v.lat === 'number' && typeof v.lon === 'number')
      .map(v => ({
        lat: v.lat,
        lon: v.lon
      }))

    if (polygon.length < 3) {
      console.log('[SidePanel] Polygon has insufficient valid vertices:', polygon.length)
      return []
    }

    console.log('[SidePanel] Searching for airspaces along route corridor with', polygon.length, 'vertices')
    console.log('[SidePanel] Total airspaces to search:', allAirspaces.length)
    
    try {
      const found = findAirspacesInPolygon(polygon, allAirspaces)
      .sort((a, b) => {
        // Sort by altitude floor (lowest first)
        const aFloor = a.altitude?.floor || 0
        const bFloor = b.altitude?.floor || 0
        return aFloor - bFloor
      })
    
      console.log('[SidePanel] Found', found.length, 'airspaces along route')
      found.forEach((a, i) => {
        console.log(`  [${i}] ${a.type} (${a.id}): floor=${a.altitude?.floor}, ceiling=${a.altitude?.ceiling}`)
      })
      
      return found
    } catch (error) {
      console.error('[SidePanel] Error finding airspaces along route:', error)
      return []
    }
  }, [routeCorridor, allAirspaceData])
>>>>>>> e3b0f772e81e335bfddd7a801fd995cdb63f9b6c

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.txt')) {
      setUploadStatus({ type: 'error', message: 'Please select a .txt file' })
      return
    }

    if (onFileUpload) {
      setIsUploading(true)
      setUploadStatus(null)
      setUploadProgress({ progress: 0, status: 'Reading file...' })

      try {
        // Simulate progress updates
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            if (prev.progress < 90) {
              return {
                progress: prev.progress + 10,
                status: prev.progress < 30 ? 'Validating file format...' :
                  prev.progress < 60 ? 'Parsing airspace data...' :
                    'Processing geometry...'
              }
            }
            return prev
          })
        }, 200)

        await onFileUpload(file)

        clearInterval(progressInterval)
        setUploadProgress({ progress: 100, status: 'Complete!' })

        // Small delay to show completion
        await new Promise(resolve => setTimeout(resolve, 300))

        setUploadStatus({ type: 'success', message: `File "${file.name}" uploaded successfully` })
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      } catch (error: any) {
        setUploadStatus({ type: 'error', message: error.message || 'Failed to upload file' })
      } finally {
        setIsUploading(false)
        setUploadProgress({ progress: 0, status: 'Starting...' })
      }
    }
  }

  return (
    <>
      {/* Full-screen loading overlay for file uploads */}
      {isUploading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Times New Roman', Times, serif"
        }}>
          {/* ... loader content (omitted for brevity in replace, but keeping it in implementation) ... */}
          <div style={{
            backgroundColor: '#1f2937',
            border: '2px solid #374151',
            padding: '32px',
            borderRadius: '8px',
            boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.3)',
            minWidth: '400px',
            maxWidth: '500px'
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 'bold',
              marginBottom: '24px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              textAlign: 'center',
              color: 'white'
            }}>
              Uploading Airspace File
            </h2>

            <div style={{ marginBottom: '16px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
                fontSize: '14px',
                color: 'white'
              }}>
                <span style={{ textTransform: 'uppercase' }}>{uploadProgress.status}</span>
                <span>{Math.round(uploadProgress.progress)}%</span>
              </div>

              <div style={{
                width: '100%',
                height: '32px',
                backgroundColor: '#374151',
                border: '2px solid #4b5563',
                borderRadius: '4px',
                overflow: 'hidden',
                boxShadow: 'inset 2px 2px 0px rgba(0, 0, 0, 0.3)',
                position: 'relative'
              }}>
                <div style={{
                  width: `${uploadProgress.progress}%`,
                  height: '100%',
                  backgroundColor: '#3b82f6',
                  transition: 'width 0.3s ease',
                  boxShadow: 'inset -2px -2px 0px rgba(0, 0, 0, 0.2)'
                }} />
              </div>
            </div>

            <div style={{
              fontSize: '12px',
              color: '#9ca3af',
              textAlign: 'center',
              marginTop: '16px'
            }}>
              Please wait while the file is processed...
            </div>
          </div>
        </div>
      )}

      {/* Navigation Column - Always Visible (64px) */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '64px',
          height: '100vh',
          backgroundColor: 'white',
          borderLeft: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '20px 0',
          gap: '12px',
          boxShadow: isOpen ? 'none' : '-2px 0 8px rgba(0,0,0,0.05)',
          zIndex: 1001,
          fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif"
        }}
      >
        {/* Hamburger / Toggle */}
        <button
          onClick={onToggle}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#374151',
            transition: 'background-color 0.2s',
            marginBottom: '20px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          title={isOpen ? "Collapse Menu" : "Expand Menu"}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Navigation Items */}
        {[
          { id: 'search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z', label: 'Search' },
          { id: 'layers', icon: 'M12 2L2 7l10 5l10-5l-10-5z M2 17l10 5l10-5 M2 12l10 5l10-5', label: 'Layers' },
          { id: 'files', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8', label: 'Files' },
          { id: 'aircolumn', icon: 'M18 20V10 M12 20V4 M6 20v-6', label: 'Air Column' },
          { id: 'settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 0v.01M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z', label: 'Settings' }
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => {
              if (activeTab === item.id && isOpen) {
                onToggle() // Close if clicking active tab
              } else {
                setActiveTab(item.id as any)
                if (!isOpen) onToggle() // Open if closed
              }
            }}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: activeTab === item.id && isOpen ? '#eff6ff' : 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: activeTab === item.id && isOpen ? '#3b82f6' : '#6b7280',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              if (!(activeTab === item.id && isOpen)) e.currentTarget.style.backgroundColor = '#f9fafb'
            }}
            onMouseLeave={(e) => {
              if (!(activeTab === item.id && isOpen)) e.currentTarget.style.backgroundColor = 'transparent'
            }}
            title={item.label}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={item.icon} />
            </svg>
            {activeTab === item.id && isOpen && (
              <div style={{
                position: 'absolute',
                right: '-1px',
                top: '12px',
                bottom: '12px',
                width: '3px',
                backgroundColor: '#3b82f6',
                borderRadius: '3px 0 0 3px'
              }} />
            )}
          </button>
        ))}
      </div>

      {/* Main Side Navigation Container */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 64,
          height: '100vh',
          display: 'flex',
          zIndex: 1000,
          fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif"
        }}
      >
        {/* Content Panel (Expands to the left) */}
        <div
          style={{
            width: isOpen ? (isMobile ? 'calc(100vw - 64px)' : '400px') : '0',
            backgroundColor: 'white',
            height: isMobile ? (isOpen ? '50vh' : '0') : '100%',
            position: isMobile ? 'fixed' : 'relative',
            bottom: isMobile ? 0 : 'auto',
            left: isMobile ? 0 : 'auto',
            right: isMobile ? 0 : 'auto',
            overflowX: 'hidden',
            overflowY: 'auto',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: isOpen ? (isMobile ? '0 -4px 15px rgba(0,0,0,0.1)' : '-4px 0 15px rgba(0,0,0,0.1)') : 'none',
            display: 'flex',
            flexDirection: 'column',
            borderLeft: !isMobile && isOpen ? '1px solid #e5e7eb' : 'none',
            borderTop: isMobile && isOpen ? '1px solid #e5e7eb' : 'none'
          }}
        >
          {isOpen && (
            <div style={{ width: isMobile ? '100%' : '400px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* Content Header */}
              <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: '#ffffff', zIndex: 1000 }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.02em', color: '#111827' }}>
                  {activeTab === 'layers' ? 'Map Layers' : activeTab === 'files' ? 'Airspace Files' : activeTab === 'search' ? 'Search' : activeTab === 'settings' ? 'Settings' : 'Air Column'}
                </h2>
                <button
                  onClick={onToggle}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#6b7280',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  aria-label="Close panel"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              {/* Dynamic Content */}
              <div style={{ flex: 1, padding: '24px' }}>
                {activeTab === 'layers' && (
                  <div>
                    {/* Basemap Selection Dropdown */}
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#374151',
                        marginBottom: '8px'
                      }}>
                        Basemap
                      </label>
                      <select
                        value={selectedBasemap}
                        onChange={(e) => onBasemapChange?.(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          fontSize: '14px',
                          border: '1px solid #d1d5db',
                          borderRadius: '8px',
                          backgroundColor: '#ffffff',
                          color: '#111827',
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        {basemapOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Overlay Layers */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#374151',
                        marginBottom: '12px'
                      }}>
                        Overlays
                      </label>
                      {layers.map((layer) => (
                        <div
                          key={layer.id}
                          style={{
                            marginBottom: '12px',
                            padding: '12px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <label
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500',
                                color: '#111827',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={layer.visible}
                                onChange={() => onLayerToggle(layer.id)}
                                style={{
                                  marginRight: '8px',
                                  width: '16px',
                                  height: '16px',
                                  cursor: 'pointer',
                                }}
                              />
                              {layer.name}
                            </label>
                          </div>
                          {layer.visible && (
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginTop: '8px',
                                }}
                              >
                                <span style={{ fontSize: '12px', color: '#6b7280' }}>Opacity</span>
                                <span style={{ fontSize: '12px', color: '#6b7280' }}>
                                  {Math.round(layer.opacity * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={layer.opacity}
                                onChange={(e) => onLayerOpacityChange(layer.id, parseFloat(e.target.value))}
                                style={{
                                  width: '100%',
                                  marginTop: '4px',
                                }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Airspace Types */}
                    {airspaceTypes.length > 0 && onTypeToggle && (
                      <div style={{ marginTop: '24px' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                          Airspace Types
                        </h3>
                        {airspaceTypes.map((type) => (
                          <div
                            key={type}
                            style={{
                              marginBottom: '12px',
                              padding: '10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              backgroundColor: visibleTypes.has(type) ? '#f9fafb' : '#ffffff',
                            }}
                          >
                            <label
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500',
                                color: '#111827',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={visibleTypes.has(type)}
                                onChange={() => onTypeToggle(type)}
                                style={{
                                  marginRight: '8px',
                                  width: '16px',
                                  height: '16px',
                                  cursor: 'pointer',
                                }}
                              />
                              {type}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'files' && (
                  <div>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      Airspace Files
                    </h3>

                    {/* Current Files */}
                    <div style={{ marginBottom: '24px' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                        Current Files
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {currentFiles.map((file, index) => (
                          <div
                            key={index}
                            style={{
                              padding: '10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              backgroundColor: '#f9fafb'
                            }}
                          >
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827', marginBottom: '2px' }}>
                              {file.name}
                            </div>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#6b7280' }}>
                              <span><strong>Source:</strong> {file.source}</span>
                              {file.size !== undefined && file.size > 0 && (
                                <span><strong>Size:</strong> {file.size > 1024 * 1024
                                  ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                                  : `${(file.size / 1024).toFixed(0)} KB`}</span>
                              )}
                              {file.date && (
                                <span><strong>Modified:</strong> {new Date(file.date).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Upload Section */}
                    <div>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                        Add OpenAir File
                      </h4>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt"
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        style={{
                          width: '100%',
                          padding: '10px',
                          backgroundColor: isUploading ? '#9ca3af' : '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: isUploading ? 'not-allowed' : 'pointer',
                          marginBottom: '12px',
                        }}
                        onMouseEnter={(e) => {
                          if (!isUploading) {
                            e.currentTarget.style.backgroundColor = '#2563eb'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isUploading) {
                            e.currentTarget.style.backgroundColor = '#3b82f6'
                          }
                        }}
                      >
                        {isUploading ? 'Processing...' : 'Choose OpenAir File'}
                      </button>

                      {uploadStatus && (
                        <div
                          style={{
                            padding: '10px',
                            borderRadius: '6px',
                            marginBottom: '12px',
                            fontSize: '12px',
                            backgroundColor: uploadStatus.type === 'success' ? '#d1fae5' : '#fee2e2',
                            color: uploadStatus.type === 'success' ? '#065f46' : '#991b1b',
                            border: `1px solid ${uploadStatus.type === 'success' ? '#6ee7b7' : '#fca5a5'}`,
                          }}
                        >
                          {uploadStatus.message}
                        </div>
                      )}

                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        Upload an OpenAir format (.txt) file to add as a layer. The file will be validated before being added.
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'search' && (
                  <div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (searchQuery.trim() && onSearchLocation) {
                          onSearchLocation(searchQuery.trim())
                          setSearchHistory(prev => {
                            const newHistory = [searchQuery.trim(), ...prev.filter(h => h !== searchQuery.trim())]
                            return newHistory.slice(0, 10) // Keep last 10
                          })
                        }
                      }}
                      style={{ marginBottom: '24px' }}
                    >
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="search"
                          style={{
                            flex: 1,
                            padding: '10px 14px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif",
                            outline: 'none',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                            transition: 'border-color 0.2s',
                            color: '#111827'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                          onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
                        />
                        <button
                          type="submit"
                          style={{
                            padding: '10px 16px',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif",
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
                        >
                          GO
                        </button>
                      </div>
                    </form>

                    {/* Search History */}
                    {searchHistory.length > 0 && (
                      <div>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Recent Searches
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {searchHistory.map((term, index) => (
                            <button
                              key={index}
                              onClick={() => {
                                setSearchQuery(term)
                                if (onSearchLocation) {
                                  onSearchLocation(term)
                                  setSearchHistory(prev => {
                                    const newHistory = [term, ...prev.filter(h => h !== term)]
                                    return newHistory.slice(0, 10)
                                  })
                                }
                              }}
                              style={{
                                textAlign: 'left',
                                padding: '12px',
                                background: 'none',
                                border: 'none',
                                borderBottom: '1px solid #f3f4f6',
                                cursor: 'pointer',
                                fontSize: '14px',
                                color: '#374151',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'background-color 0.1s',
                                fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif"
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px' }}>
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                              </svg>
                              {term}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setSearchHistory([])}
                          style={{
                            marginTop: '12px',
                            background: 'none',
                            border: 'none',
                            color: '#9ca3af',
                            fontSize: '12px',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          Clear History
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'settings' && (
                  <div>
                    <div style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                          Fetch Radius
                        </label>
                        <span style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>
                          {fetchRadius} km
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="25"
                        step="0.5"
                        value={fetchRadius}
                        onChange={(e) => setFetchRadius(parseFloat(e.target.value))}
                        style={{
                          width: '100%',
                          accentColor: '#3b82f6',
                          cursor: 'pointer'
                        }}
                      />
                      <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
                        Search radius for finding nearby airspaces (1-25 km).
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'aircolumn' && (
                  <div>
<<<<<<< HEAD
                    {selectedRoute ? (
                      <div style={{ border: '4px solid yellow', boxShadow: '0 0 10px yellow', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ marginBottom: '16px', fontSize: '14px', color: '#6b7280' }}>
                          <div><strong>Route Airspace & Terrain</strong></div>
                        </div>
                        <RouteTerrainProfile
                          points={selectedRoute.points}
                          width={selectedRoute.terrainProfileWidth}
                          onClose={() => {}}
                          onWidthChange={() => {}}
                          embedded={true}
                          airspaceData={allAirspaceData.flatMap(source => source.data)}
                          onElevationDataChange={handleElevationDataChange}
                        />
                        
                        {/* Render the 3D profile directly here to guarantee client-only context */}
                        {terrain3DData.cells.length > 0 && (
                          <div style={{ marginTop: '16px' }}>
                            <TerrainProfile3D
                              cells={terrain3DData.cells}
                              minElev={terrain3DData.minElev}
                              maxElev={terrain3DData.maxElev}
                              width={selectedRoute.terrainProfileWidth}
                              airspaces={terrain3DData.airspaces}
                              routeBearing={terrain3DData.routeBearing}
                              totalDistanceKm={terrain3DData.totalDistanceKm}
                              isExpanded={isTerrain3DExpanded}
                              onToggleExpand={() => setIsTerrain3DExpanded(!isTerrain3DExpanded)}
                            />
                          </div>
                        )}
                      </div>
=======
                    {route && route.length > 0 ? (
                      <>
                        <div style={{ marginBottom: '16px', fontSize: '14px', color: '#6b7280' }}>
                          <div><strong>Route:</strong> {route.length} waypoints</div>
                          <div><strong>Corridor Width:</strong> {routeRadius} km</div>
                        </div>

                        {/* Airspace List */}
                        {airspacesAlongRoute.length > 0 ? (
                          <div style={{ marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', color: '#111827' }}>
                              Airspaces Along Route ({airspacesAlongRoute.length})
                            </h3>
                            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                              {airspacesAlongRoute.map((airspace, idx) => (
                                <div
                                  key={airspace.id || idx}
                                  onClick={() => onAirspaceSelect?.(airspace.id)}
                                  style={{
                                    padding: '12px',
                                    borderBottom: idx < airspacesAlongRoute.length - 1 ? '1px solid #e5e7eb' : 'none',
                                    cursor: 'pointer',
                                    backgroundColor: selectedAirspaceId === airspace.id ? '#eff6ff' : 'white',
                                    transition: 'background-color 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (selectedAirspaceId !== airspace.id) {
                                      e.currentTarget.style.backgroundColor = '#f9fafb'
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (selectedAirspaceId !== airspace.id) {
                                      e.currentTarget.style.backgroundColor = 'white'
                                    }
                                  }}
                                >
                                  <div style={{ fontWeight: 'bold', color: '#111827', marginBottom: '4px' }}>
                                    {airspace.type} - {airspace.id}
                                  </div>
                                  {airspace.location && (
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                                      {airspace.location}
                                    </div>
                                  )}
                                  <div style={{ fontSize: '12px', color: '#374151' }}>
                                    {airspace.altitude?.floor !== undefined && (
                                      <span>Floor: {Math.round(airspace.altitude.floor / 3.28084)}m </span>
                                    )}
                                    {airspace.altitude?.ceiling !== undefined && (
                                      <span>Ceiling: {Math.round(airspace.altitude.ceiling / 3.28084)}m</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', marginBottom: '16px' }}>
                            No airspaces found along this route
                          </div>
                        )}

                        {/* Route 3D Visualization */}
                        <AirspaceRoute
                          route={route}
                          routeCorridor={routeCorridor}
                          routeRadius={routeRadius}
                          hasAirspace={airspacesAlongRoute.length > 0}
                          airspacesAlongRoute={airspacesAlongRoute}
                          isExpanded={is3DExpanded}
                          onToggleExpand={() => setIs3DExpanded(!is3DExpanded)}
                        />
                      </>
>>>>>>> e3b0f772e81e335bfddd7a801fd995cdb63f9b6c
                    ) : clickedPoint ? (
                      <>
                        <div style={{ marginBottom: '16px', fontSize: '14px', color: '#6b7280' }}>
                          <div><strong>Location:</strong> {clickedPoint.lat.toFixed(6)}, {clickedPoint.lon.toFixed(6)}</div>
                        </div>

                        {airspacesAtPoint.length > 0 ? (
                          (() => {
                            // Calculate dynamic scale based on actual altitudes
                            const allCeilings = airspacesAtPoint.map(a => a.altitude?.ceiling || 18000)
                            const groundFt = elevation || 0
                            const minAlt = 0 // Always start from sea level
                            const maxAlt = Math.max(18000, ...allCeilings, groundFt + 2000)
                            const altRange = maxAlt - minAlt

                            const ftToM = (ft: number) => Math.round(ft / 3.28084)

                            // Group airspaces with identical floor, ceiling, and type
                            const groupedAirspaces = (() => {
                              const groups: Map<string, AirspaceData[]> = new Map()
                              airspacesAtPoint.forEach(a => {
                                const key = `${a.altitude?.floor}-${a.altitude?.ceiling}-${a.type}`
                                if (!groups.has(key)) groups.set(key, [])
                                groups.get(key)!.push(a)
                              })

                              return Array.from(groups.values()).map(group => {
                                if (group.length === 1) return group[0]
                                return {
                                  ...group[0],
                                  id: `grouped-${group.map(a => a.id).join('-').substring(0, 50)}`,
                                  notamNumber: `Multiple ${group[0].type}: ${group.map(a => a.notamNumber).join(', ')}`,
                                  isGrouped: true,
                                  groupCount: group.length
                                }
                              })
                            })()

                            // Sort sortedAirspaces for consistent column assignment
                            const sortedAirspaces = groupedAirspaces.sort((a, b) =>
                              (a.altitude?.floor || 0) - (b.altitude?.floor || 0)
                            )

                            // Assign columns based on overlap
                            const columnAssignments: Map<string, number> = new Map()
                            const columnEnds: number[] = [] // Track where each column's last airspace ends

                            sortedAirspaces.forEach(airspace => {
                              const floor = airspace.altitude?.floor || 0
                              const ceiling = airspace.altitude?.ceiling || 18000

                              // Find the first column where this airspace doesn't overlap
                              let assignedColumn = 0
                              for (let col = 0; col < columnEnds.length; col++) {
                                if (columnEnds[col] <= floor) {
                                  assignedColumn = col
                                  break
                                }
                                assignedColumn = col + 1
                              }

                              columnAssignments.set(airspace.id, assignedColumn)

                              // Update or add column end
                              if (assignedColumn < columnEnds.length) {
                                columnEnds[assignedColumn] = ceiling
                              } else {
                                columnEnds.push(ceiling)
                              }
                            })

                            const numColumns = Math.max(1, columnEnds.length)

                            // Generate scale labels
                            const scaleLabels: number[] = []
                            const step = altRange > 10000 ? 5000 : altRange > 5000 ? 2500 : altRange > 2000 ? 1000 : 500
                            for (let alt = Math.ceil(minAlt / step) * step; alt <= maxAlt; alt += step) {
                              scaleLabels.push(alt)
                            }

                            // Get color for airspace type
                            const getColor = (type: string): string => {
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

                            return (
                              <div style={{ position: 'relative', height: '500px', borderRadius: '8px', padding: '16px', backgroundColor: '#f9fafb', fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif" }}>
                                {/* Altitude scale */}
                                <div style={{ position: 'absolute', left: '0', top: '16px', bottom: '16px', width: isMobile ? '70px' : '110px', color: '#6b7280' }}>
                                  {/* Central Vertical Line - Only on desktop */}
                                  {!isMobile && <div style={{
                                    position: 'absolute',
                                    top: '24px',
                                    bottom: '0',
                                    left: '55px',
                                    width: '2px',
                                    backgroundColor: '#d1d5db',
                                    zIndex: 1
                                  }} />}

                                  {/* Scale Headers */}
                                  <div style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    fontSize: '9px',
                                    fontWeight: 'bold',
                                    paddingBottom: '4px',
                                    borderBottom: '1px solid #e5e7eb',
                                    marginBottom: '12px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                  }}>
                                    <div style={{ width: isMobile ? '100%' : '50px', textAlign: isMobile ? 'center' : 'right', paddingRight: isMobile ? '0' : '5px' }}>Feet</div>
                                    {!isMobile && (
                                      <>
                                        <div style={{ width: '10px' }} />
                                        <div style={{ width: '50px', textAlign: 'left', paddingLeft: '5px' }}>Meters</div>
                                      </>
                                    )}
                                  </div>

                                  {scaleLabels.map(alt => {
                                    const topPercent = ((maxAlt - alt) / altRange) * 100
                                    if (topPercent < 6) return null

                                    return (
                                      <div key={alt} style={{
                                        position: 'absolute',
                                        top: `${topPercent}%`,
                                        left: '0',
                                        right: '0',
                                        transform: 'translateY(-50%)',
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'baseline'
                                      }}>
                                        <div style={{ width: isMobile ? '100%' : '50px', textAlign: isMobile ? 'center' : 'right', paddingRight: isMobile ? '0' : '8px', fontSize: '10px', fontWeight: '600' }}>
                                          {alt >= 1000 ? `${(alt / 1000).toFixed(alt % 1000 === 0 ? 0 : 1)}k` : alt}
                                        </div>
                                        {!isMobile && (
                                          <>
                                            <div style={{ width: '10px' }} />
                                            <div style={{ width: '50px', textAlign: 'left', paddingLeft: '8px', fontSize: '9px', opacity: 0.8 }}>
                                              {ftToM(alt)}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    )
                                  })}
                                  
                                  {/* Ground level indicator on elevation bar */}
                                  {elevation !== null && (
                                    <div style={{
                                      position: 'absolute',
                                      bottom: '0',
                                      left: isMobile ? '50%' : '52px',
                                      transform: isMobile ? 'translateX(-50%)' : 'none',
                                      width: '8px',
                                      height: `${(elevation / altRange) * 100}%`,
                                      backgroundColor: '#9ca3af',
                                      opacity: 0.6,
                                      borderTop: '2px solid #6b7280',
                                      borderRadius: '0 0 2px 2px'
                                    }}>
                                      <div style={{ 
                                        position: 'absolute', 
                                        bottom: '100%',
                                        marginBottom: '4px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        fontSize: '8px', 
                                        color: '#4a5568', 
                                        fontWeight: '600',
                                        whiteSpace: 'nowrap',
                                        backgroundColor: '#ffffff',
                                        padding: '2px 4px',
                                        borderRadius: '2px',
                                        border: '1px solid #9ca3af',
                                        textAlign: 'center',
                                        lineHeight: '1.3',
                                        zIndex: 10
                                      }}>
                                        <div>Ground level</div>
                                        <div>{Math.round(elevation)}ft {ftToM(elevation)}m</div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Airspace bars */}
                                <div style={{ marginLeft: isMobile ? '70px' : '120px', position: 'relative', height: '100%' }}>
                                  {(() => {
                                    const renderedAltitudes = new Set<number>()
                                    const labelsToRender: Array<{
                                      alt: number
                                      percent: number
                                      left: number
                                      width: number
                                      isCeiling: boolean
                                    }> = []

                                    const blocks = sortedAirspaces.map((airspace) => {
                                      const floor = airspace.altitude?.floor || 0
                                      const ceiling = airspace.altitude?.ceiling || 18000
                                      const bottomPercent = ((floor - minAlt) / altRange) * 100
                                      const topPercent = ((ceiling - minAlt) / altRange) * 100
                                      const heightPercent = ((ceiling - floor) / altRange) * 100
                                      const column = columnAssignments.get(airspace.id) || 0
                                      const columnWidth = 100 / numColumns
                                      const leftPercent = column * columnWidth

                                      // Collect labels to render in a separate overlay pass
                                      if (!renderedAltitudes.has(ceiling)) {
                                        labelsToRender.push({ alt: ceiling, percent: topPercent, left: leftPercent, width: columnWidth, isCeiling: true })
                                        renderedAltitudes.add(ceiling)
                                      }
                                      if (!renderedAltitudes.has(floor)) {
                                        labelsToRender.push({ alt: floor, percent: bottomPercent, left: leftPercent, width: columnWidth, isCeiling: false })
                                        renderedAltitudes.add(floor)
                                      }

                                      const isSelected = Array.isArray(selectedAirspaceId)
                                        ? ((airspace as any).isGrouped ? (airspace as any).group.ids.every((id: string) => selectedAirspaceId.includes(id)) : selectedAirspaceId.includes(airspace.id))
                                        : selectedAirspaceId === airspace.id

                                      // Format date range for display
                                      const startDate = formatAirspaceDate(airspace.effectiveStart)
                                      const endDate = formatAirspaceDate(airspace.effectiveEnd)
                                      const dateRange = startDate || endDate
                                        ? `${startDate || '?'} → ${endDate || '?'}`
                                        : null
                                      const titleWithDates = dateRange
                                        ? `${airspace.type}: ${airspace.notamNumber}\n${floor} - ${ceiling} ft\nEffective: ${dateRange}`
                                        : `${airspace.type}: ${airspace.notamNumber}\n${floor} - ${ceiling} ft`

                                      return (
                                        <div
                                          key={airspace.id}
                                          onClick={() => onAirspaceSelect?.((airspace as any).isGrouped ? (airspace as any).group.ids : airspace.id)}
                                          style={{
                                            position: 'absolute',
                                            bottom: `${bottomPercent}%`,
                                            height: `${Math.max(heightPercent, 2)}%`,
                                            left: `${leftPercent}%`,
                                            width: `${columnWidth - 2}%`,
                                            backgroundColor: getColor(airspace.type),
                                            opacity: 0.85,
                                            border: isSelected ? '3px solid #facc15' : '2px solid ' + getColor(airspace.type),
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '10px',
                                            color: 'white',
                                            fontWeight: '600',
                                            padding: '2px',
                                            boxSizing: 'border-box',
                                            zIndex: isSelected ? 50 : 1,
                                            transition: 'all 0.2s ease',
                                            boxShadow: isSelected ? '0 0 10px rgba(250, 204, 21, 0.5)' : 'none'
                                          }}
                                          title={titleWithDates}
                                        >
                                          <div style={{ textAlign: 'center', overflow: 'hidden' }}>
                                            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                              {(airspace as any).isGrouped ? `Multiple ${airspace.type}` : airspace.type}
                                            </div>
                                            {heightPercent > 8 && (
                                              <div style={{ fontSize: '8px', opacity: 0.9 }}>{floor}-{ceiling}</div>
                                            )}
                                            {dateRange && heightPercent > 15 && (
                                              <div style={{ fontSize: '7px', opacity: 0.85, marginTop: '1px' }}>{dateRange}</div>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })

                                    return (
                                      <>
                                        {blocks}
                                        {/* Dedicated label overlay to ensure they are ALWAYS on top of all blocks */}
                                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 100 }}>
                                          {labelsToRender.map((label, idx) => (
                                            <div
                                              key={idx}
                                              style={{
                                                position: 'absolute',
                                                bottom: `${label.percent}%`,
                                                left: `${label.left}%`,
                                                width: `${label.width - 2}%`,
                                                height: '0',
                                                borderBottom: '1px solid rgba(255,255,255,0.8)',
                                              }}
                                            >
                                              <div style={{
                                                position: 'absolute',
                                                [label.isCeiling ? 'top' : 'bottom']: '-10px',
                                                [label.isCeiling ? 'right' : 'left']: '0',
                                                fontSize: '8px',
                                                color: '#111827',
                                                fontWeight: 'bold',
                                                whiteSpace: 'nowrap',
                                                backgroundColor: 'white',
                                                padding: '1px 4px',
                                                borderRadius: '3px',
                                                border: '1px solid #9ca3af',
                                                fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif"
                                              }}>
                                                {label.alt.toLocaleString()}ft | {ftToM(label.alt).toLocaleString()}m
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </>
                                    )
                                  })()}
                                </div>
                              </div>
                            )
                          })()
                        ) : (
                          <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                            No airspaces found at this location
                          </div>
                        )}

                        {/* 3D Visualization - always show cylinder when a point is clicked and airspaces are found */}
                        <AirspaceCylinder
                          clickedPoint={clickedPoint}
                          radiusKm={fetchRadius}
                          onElevationCellsChange={onElevationCellsChange}
                          hasAirspace={airspacesAtPoint.length > 0}
                          airspacesAtPoint={airspacesAtPoint}
                          isExpanded={is3DExpanded}
                          onToggleExpand={() => setIs3DExpanded(!is3DExpanded)}
<<<<<<< HEAD
                          selectedBasemap={selectedBasemap}
=======
>>>>>>> e3b0f772e81e335bfddd7a801fd995cdb63f9b6c
                        />
                      </>
                    ) : (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                        {selectedRoute ? 'Loading route data...' : 'Click on the map to view air column or draw a route'}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  )
}
