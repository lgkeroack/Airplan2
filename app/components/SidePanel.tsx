'use client'

import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import type { AirspaceData } from '@/lib/types'
import { findAirspacesAtPoint, findAirspacesNearby } from '@/lib/point-in-airspace'
import dynamic from 'next/dynamic'
import type { ElevationCellData } from './AirspaceCylinder'

const AirspaceCylinder = dynamic(() => import('./AirspaceCylinder'), { ssr: false })
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
  selectedRoute?: RouteData
  activeTab?: 'layers' | 'aircolumn' | 'search'
  // Airspace filtering
  hiddenAirspaceClasses?: Set<string>
  onAirspaceClassToggle?: (airspaceClass: string) => void
  altitudeRange?: { min: number; max: number }
  onAltitudeRangeChange?: (range: { min: number; max: number }) => void
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
  selectedRoute,
  activeTab: activeTabProp,
  hiddenAirspaceClasses = new Set(),
  onAirspaceClassToggle,
  altitudeRange = { min: 0, max: 60000 },
  onAltitudeRangeChange,
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<'layers' | 'aircolumn' | 'search' | undefined>(activeTabProp)
  const [activeTabState, setActiveTabState] = useState<'layers' | 'aircolumn' | 'search' | undefined>(activeTabProp)
  
  // Update activeTab when prop changes
  useEffect(() => { 
    setActiveTab(activeTabProp)
    setActiveTabState(activeTabProp)
  }, [activeTabProp])

  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [searchResults, setSearchResults] = useState<{
    airspaces: AirspaceData[]
    loading: boolean
  }>({ airspaces: [], loading: false })
  const [searchQuery, setSearchQuery] = useState('')

  // Use prop value for fetchRadius, with local state as fallback
  const fetchRadius = fetchRadiusProp
  const setFetchRadius = (value: number) => {
    if (onFetchRadiusChange) {
      onFetchRadiusChange(value)
    }
  }
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
    } else if (selectedRoute && selectedRoute.points && selectedRoute.points.length > 0) {
      setActiveTab('aircolumn')
    }
  }, [clickedPoint, selectedRoute])

  // Helper to check if airspace type is hidden
  const isAirspaceHidden = useCallback((type: string): boolean => {
    // Check exact matches first
    if (hiddenAirspaceClasses.has(type)) return true

    // Check if type contains any hidden class
    for (const hiddenClass of hiddenAirspaceClasses) {
      if (hiddenClass === 'Other') {
        // 'Other' matches anything that's not a standard class
        const standardClasses = ['Class A', 'Class B', 'Class C', 'Class D', 'Class E', 'Class G', 'Restricted', 'MOA', 'TFR']
        const isStandard = standardClasses.some(sc => type.includes(sc) || type === sc)
        if (!isStandard) return true
      } else if (type.includes(hiddenClass)) {
        return true
      }
    }
    return false
  }, [hiddenAirspaceClasses])

  // Helper to check if airspace is within altitude range
  const isWithinAltitudeRange = useCallback((airspace: AirspaceData): boolean => {
    const floor = airspace.altitude?.floor ?? 0
    const ceiling = airspace.altitude?.ceiling ?? 60000
    // Airspace is visible if any part of it overlaps with the filter range
    return ceiling >= altitudeRange.min && floor <= altitudeRange.max
  }, [altitudeRange])

  // Search for airspaces matching query
  const searchAirspaces = useCallback((query: string): AirspaceData[] => {
    if (!query || query.length < 2) return []

    const lowerQuery = query.toLowerCase()
    const allAirspaces: AirspaceData[] = []
    allAirspaceData.forEach(source => {
      allAirspaces.push(...source.data)
    })

    // Filter airspaces that match the query (by location, type, or NOTAM number)
    const matches = allAirspaces.filter(airspace => {
      // Skip hidden airspace classes
      if (isAirspaceHidden(airspace.type)) return false

      // Check location/identifier
      const identifier = (airspace.location || airspace.id || '').toLowerCase()
      if (identifier.includes(lowerQuery)) return true

      // Check type
      if (airspace.type.toLowerCase().includes(lowerQuery)) return true

      // Check NOTAM number if it exists
      if (airspace.notamNumber && airspace.notamNumber.toLowerCase().includes(lowerQuery)) return true

      // Check class (e.g., "class b", "b")
      const classMatch = lowerQuery.match(/^(?:class\s*)?([a-g])$/i)
      if (classMatch) {
        const classLetter = classMatch[1].toUpperCase()
        if (airspace.type.includes(`Class ${classLetter}`)) return true
      }

      return false
    })

    // Sort by relevance (exact matches first, then by type)
    return matches
      .sort((a, b) => {
        const aIdentifier = (a.location || a.id || '').toLowerCase()
        const bIdentifier = (b.location || b.id || '').toLowerCase()

        // Exact matches first
        if (aIdentifier === lowerQuery && bIdentifier !== lowerQuery) return -1
        if (bIdentifier === lowerQuery && aIdentifier !== lowerQuery) return 1

        // Then starts with query
        if (aIdentifier.startsWith(lowerQuery) && !bIdentifier.startsWith(lowerQuery)) return -1
        if (bIdentifier.startsWith(lowerQuery) && !aIdentifier.startsWith(lowerQuery)) return 1

        // Then alphabetically
        return aIdentifier.localeCompare(bIdentifier)
      })
      .slice(0, 20) // Limit to 20 results
  }, [allAirspaceData, isAirspaceHidden])

  // Update search results when query changes
  useEffect(() => {
    if (searchQuery.length >= 2) {
      const matches = searchAirspaces(searchQuery)
      setSearchResults({ airspaces: matches, loading: false })
    } else {
      setSearchResults({ airspaces: [], loading: false })
    }
  }, [searchQuery, searchAirspaces])

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
      // Filter by hidden classes and altitude range
      .filter(a => !isAirspaceHidden(a.type) && isWithinAltitudeRange(a))
      .sort((a, b) => {
        // Sort by altitude floor (lowest first)
        const aFloor = a.altitude?.floor || 0
        const bFloor = b.altitude?.floor || 0
        return aFloor - bFloor
      })

    console.log('[SidePanel] Found', found.length, 'airspaces nearby (after filtering)')
    found.forEach((a, i) => {
      console.log(`  [${i}] ${a.type} (${a.id}): floor=${a.altitude?.floor}, ceiling=${a.altitude?.ceiling}`)
    })

    return found
  }, [clickedPoint, allAirspaceData, fetchRadius, isAirspaceHidden, isWithinAltitudeRange])


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

      {/* Navigation Column - Desktop: Right side, Mobile: Bottom */}
      <div
        style={{
          position: 'fixed',
          // Desktop: right side vertical bar
          // Mobile: bottom horizontal bar
          top: isMobile ? 'auto' : 0,
          bottom: isMobile ? 0 : 'auto',
          right: isMobile ? 0 : 0,
          left: isMobile ? 0 : 'auto',
          width: isMobile ? '100%' : '64px',
          height: isMobile ? '60px' : '100vh',
          backgroundColor: 'white',
          borderLeft: isMobile ? 'none' : '1px solid #e5e7eb',
          borderTop: isMobile ? '1px solid #e5e7eb' : 'none',
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: isMobile ? 'center' : 'flex-start',
          padding: isMobile ? '0 20px' : '20px 0',
          gap: isMobile ? '24px' : '12px',
          boxShadow: isMobile ? '0 -2px 8px rgba(0,0,0,0.05)' : (isOpen ? 'none' : '-2px 0 8px rgba(0,0,0,0.05)'),
          zIndex: 1001,
          fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif"
        }}
      >
        {/* Navigation Items */}
        {[
          { id: 'search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z', label: 'Search' },
          { id: 'aircolumn', icon: 'M18 20V10 M12 20V4 M6 20v-6', label: 'Air Column' },
          { id: 'layers', icon: 'M12 2L2 7l10 5l10-5l-10-5z M2 17l10 5l10-5 M2 12l10 5l10-5', label: 'Layers' },
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
                // Desktop: indicator on right edge
                // Mobile: indicator on top edge
                right: isMobile ? 'auto' : '-1px',
                left: isMobile ? '12px' : 'auto',
                top: isMobile ? '-1px' : '12px',
                bottom: isMobile ? 'auto' : '12px',
                width: isMobile ? '20px' : '3px',
                height: isMobile ? '3px' : 'auto',
                backgroundColor: '#3b82f6',
                borderRadius: isMobile ? '0 0 3px 3px' : '3px 0 0 3px'
              }} />
            )}
          </button>
        ))}
      </div>

      {/* Main Content Panel Container */}
      <div
        style={{
          position: 'fixed',
          // Desktop: to the left of nav bar
          // Mobile: slides up from bottom (above nav bar)
          top: isMobile ? 'auto' : 0,
          bottom: isMobile ? '60px' : 'auto',
          right: isMobile ? 0 : 64,
          left: isMobile ? 0 : 'auto',
          height: isMobile ? (isOpen ? '55vh' : '0') : '100vh',
          width: isMobile ? '100%' : 'auto',
          display: 'flex',
          zIndex: 1000,
          fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif",
          pointerEvents: isOpen ? 'auto' : 'none'
        }}
      >
        {/* Content Panel */}
        <div
          style={{
            width: isMobile ? '100%' : (isOpen ? '400px' : '0'),
            height: '100%',
            backgroundColor: 'white',
            overflowX: 'hidden',
            overflowY: 'auto',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: isOpen ? (isMobile ? '0 -4px 15px rgba(0,0,0,0.15)' : '-4px 0 15px rgba(0,0,0,0.1)') : 'none',
            display: 'flex',
            flexDirection: 'column',
            borderLeft: !isMobile && isOpen ? '1px solid #e5e7eb' : 'none',
            borderTop: isMobile && isOpen ? '1px solid #e5e7eb' : 'none',
            borderRadius: isMobile ? '16px 16px 0 0' : '0',
            opacity: isOpen ? 1 : 0,
            transform: isMobile ? (isOpen ? 'translateY(0)' : 'translateY(100%)') : 'none'
          }}
        >
          {isOpen && (
            <div style={{ width: isMobile ? '100%' : '400px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* Mobile drag handle */}
              {isMobile && (
                <div
                  style={{
                    width: '100%',
                    padding: '8px 0',
                    display: 'flex',
                    justifyContent: 'center',
                    cursor: 'grab'
                  }}
                  onClick={onToggle}
                >
                  <div style={{
                    width: '40px',
                    height: '4px',
                    backgroundColor: '#d1d5db',
                    borderRadius: '2px'
                  }} />
                </div>
              )}
              {/* Content Header */}
              <div style={{
                padding: isMobile ? '12px 16px' : '24px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'sticky',
                top: 0,
                backgroundColor: '#ffffff',
                zIndex: 1000
              }}>
                <h2 style={{ margin: 0, fontSize: isMobile ? '16px' : '20px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.02em', color: '#111827' }}>
                  {activeTab === 'layers' ? 'Map Layers' : activeTab === 'search' ? 'Search' : 'Air Column'}
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
              <div style={{ flex: 1, padding: isMobile ? '16px' : '24px', paddingBottom: isMobile ? '24px' : '24px' }}>
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

                    {/* Airspace Class Filters */}
                    <div style={{ marginTop: '24px' }}>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#374151',
                        marginBottom: '12px'
                      }}>
                        Airspace Classes
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {['Class A', 'Class B', 'Class C', 'Class D', 'Class E', 'Class G', 'Restricted', 'MOA', 'TFR', 'Other'].map((airspaceClass) => {
                          const isHidden = hiddenAirspaceClasses.has(airspaceClass)
                          const colors: Record<string, string> = {
                            'Class A': '#ef4444',
                            'Class B': '#3b82f6',
                            'Class C': '#8b5cf6',
                            'Class D': '#06b6d4',
                            'Class E': '#22c55e',
                            'Class G': '#84cc16',
                            'Restricted': '#f97316',
                            'MOA': '#a855f7',
                            'TFR': '#ef4444',
                            'Other': '#64748b',
                          }
                          const color = colors[airspaceClass] || '#64748b'
                          return (
                            <button
                              key={airspaceClass}
                              onClick={() => onAirspaceClassToggle?.(airspaceClass)}
                              style={{
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: '600',
                                border: `2px solid ${color}`,
                                borderRadius: '6px',
                                backgroundColor: isHidden ? 'transparent' : color,
                                color: isHidden ? color : 'white',
                                cursor: 'pointer',
                                opacity: isHidden ? 0.5 : 1,
                                transition: 'all 0.2s ease',
                              }}
                            >
                              {airspaceClass.replace('Class ', '')}
                            </button>
                          )
                        })}
                      </div>
                      <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>
                        Click to toggle airspace classes on/off
                      </p>
                    </div>

                    {/* Altitude Range Filter */}
                    <div style={{ marginTop: '24px' }}>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#374151',
                        marginBottom: '12px'
                      }}>
                        Altitude Range
                      </label>
                      <div style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ fontSize: '12px', color: '#374151', fontWeight: '500' }}>
                            {altitudeRange.min.toLocaleString()} ft ({Math.round(altitudeRange.min * 0.3048).toLocaleString()} m)
                          </span>
                          <span style={{ fontSize: '12px', color: '#374151', fontWeight: '500' }}>
                            {altitudeRange.max.toLocaleString()} ft ({Math.round(altitudeRange.max * 0.3048).toLocaleString()} m)
                          </span>
                        </div>
                        {/* Dual-handle range slider */}
                        <div style={{ position: 'relative', height: '20px', marginBottom: '8px' }}>
                          {/* Track background */}
                          <div style={{
                            position: 'absolute',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            left: 0,
                            right: 0,
                            height: '6px',
                            backgroundColor: '#e5e7eb',
                            borderRadius: '3px'
                          }} />
                          {/* Active range highlight */}
                          <div style={{
                            position: 'absolute',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            left: `${(altitudeRange.min / 60000) * 100}%`,
                            right: `${100 - (altitudeRange.max / 60000) * 100}%`,
                            height: '6px',
                            backgroundColor: '#3b82f6',
                            borderRadius: '3px'
                          }} />
                          {/* Min slider */}
                          <input
                            type="range"
                            min="0"
                            max="60000"
                            step="500"
                            value={altitudeRange.min}
                            onChange={(e) => {
                              const newMin = parseInt(e.target.value)
                              if (newMin < altitudeRange.max - 500) {
                                onAltitudeRangeChange?.({ min: newMin, max: altitudeRange.max })
                              }
                            }}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              WebkitAppearance: 'none',
                              appearance: 'none',
                              background: 'transparent',
                              pointerEvents: 'none',
                              cursor: 'pointer'
                            }}
                            className="dual-range-min"
                          />
                          {/* Max slider */}
                          <input
                            type="range"
                            min="0"
                            max="60000"
                            step="500"
                            value={altitudeRange.max}
                            onChange={(e) => {
                              const newMax = parseInt(e.target.value)
                              if (newMax > altitudeRange.min + 500) {
                                onAltitudeRangeChange?.({ min: altitudeRange.min, max: newMax })
                              }
                            }}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              WebkitAppearance: 'none',
                              appearance: 'none',
                              background: 'transparent',
                              pointerEvents: 'none',
                              cursor: 'pointer'
                            }}
                            className="dual-range-max"
                          />
                          <style>{`
                            .dual-range-min::-webkit-slider-thumb,
                            .dual-range-max::-webkit-slider-thumb {
                              -webkit-appearance: none;
                              appearance: none;
                              width: 18px;
                              height: 18px;
                              background: #3b82f6;
                              border-radius: 50%;
                              cursor: pointer;
                              pointer-events: auto;
                              border: 2px solid white;
                              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                            }
                            .dual-range-min::-moz-range-thumb,
                            .dual-range-max::-moz-range-thumb {
                              width: 18px;
                              height: 18px;
                              background: #3b82f6;
                              border-radius: 50%;
                              cursor: pointer;
                              pointer-events: auto;
                              border: 2px solid white;
                              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                            }
                          `}</style>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af' }}>
                          <span>0 ft</span>
                          <span>60,000 ft</span>
                        </div>
                        <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>
                          Only show airspaces within this altitude range
                        </p>
                      </div>
                    </div>

                    {/* Fetch Radius */}
                    <div style={{ marginTop: '24px' }}>
                      <div style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
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
                          style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }}
                        />
                        <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
                          Search radius for finding nearby airspaces (1-25 km).
                        </p>
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
                          placeholder="Search airspaces, locations..."
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

                    {/* Airspace Search Results */}
                    {searchQuery.length >= 2 && (
                      <div style={{ marginBottom: '24px' }}>
                        {searchResults.airspaces.length > 0 ? (
                          <>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Airspaces ({searchResults.airspaces.length})
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflowY: 'auto' }}>
                              {searchResults.airspaces.map((airspace) => {
                                const colors: Record<string, string> = {
                                  'Class A': '#ef4444',
                                  'Class B': '#3b82f6',
                                  'Class C': '#8b5cf6',
                                  'Class D': '#06b6d4',
                                  'Class E': '#22c55e',
                                  'Class G': '#84cc16',
                                  'Restricted': '#f97316',
                                  'MOA': '#a855f7',
                                  'TFR': '#ef4444',
                                }
                                let color = '#64748b'
                                for (const [key, val] of Object.entries(colors)) {
                                  if (airspace.type.includes(key)) {
                                    color = val
                                    break
                                  }
                                }
                                const floor = airspace.altitude?.floor ?? 0
                                const ceiling = airspace.altitude?.ceiling ?? 0
                                const floorM = Math.round(floor * 0.3048)
                                const ceilingM = Math.round(ceiling * 0.3048)

                                return (
                                  <button
                                    key={airspace.id}
                                    onClick={() => {
                                      onAirspaceSelect?.(airspace.id)
                                      setSearchQuery('')
                                    }}
                                    style={{
                                      textAlign: 'left',
                                      padding: '10px 12px',
                                      background: 'white',
                                      border: `2px solid ${color}`,
                                      borderRadius: '8px',
                                      cursor: 'pointer',
                                      fontSize: '13px',
                                      color: '#374151',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '4px',
                                      transition: 'all 0.15s ease',
                                      fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = color
                                      e.currentTarget.style.color = 'white'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = 'white'
                                      e.currentTarget.style.color = '#374151'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{
                                        padding: '2px 6px',
                                        backgroundColor: color,
                                        color: 'white',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        fontWeight: 'bold'
                                      }}>
                                        {airspace.type.replace('Class ', '')}
                                      </span>
                                      <span style={{ fontWeight: '600', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {airspace.location || airspace.id}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '11px', opacity: 0.8 }}>
                                      {floor.toLocaleString()} - {ceiling.toLocaleString()} ft ({floorM.toLocaleString()} - {ceilingM.toLocaleString()} m)
                                      {airspace.notamNumber && <span style={{ marginLeft: '8px' }}>• {airspace.notamNumber}</span>}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          </>
                        ) : (
                          <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                            No airspaces found matching "{searchQuery}"
                          </div>
                        )}

                        {/* Location search hint */}
                        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '8px', borderLeft: '3px solid #3b82f6' }}>
                          <div style={{ fontSize: '12px', color: '#1e40af' }}>
                            <strong>Tip:</strong> Press GO or Enter to search for locations (cities, addresses, coordinates)
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Search History */}
                    {searchHistory.length > 0 && searchQuery.length < 2 && (
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

                {activeTab === 'aircolumn' && (
                  <div>
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
                          selectedBasemap={selectedBasemap}
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
