"use client"

import dynamic from 'next/dynamic'
import React, { Component, useState, useEffect, useRef, type ReactNode } from 'react'
import type { AirspaceData } from '@/lib/types'

interface ElevationGridCell {
  lat: number
  lon: number
  elevation: number | null
  distanceFromPath: number
  progressAlongPath: number
}

// Error boundary for catching render errors in the 3D component
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

interface ErrorBoundaryProps {
  children: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

class ThreeErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('3D Terrain Error:', error, errorInfo)
    this.setState({ errorInfo })
    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state
      return (
        <ErrorDisplay 
          title="3D Rendering Error"
          message={error?.message || 'An unknown error occurred while rendering the 3D terrain.'}
          details={[
            error?.name ? `Error Type: ${error.name}` : null,
            errorInfo?.componentStack ? `Component: ${errorInfo.componentStack.split('\n')[1]?.trim() || 'Unknown'}` : null,
          ].filter(Boolean) as string[]}
          onRetry={() => this.setState({ hasError: false, error: null, errorInfo: null })}
        />
      )
    }
    return this.props.children
  }
}

// Detailed error display component
function ErrorDisplay({ 
  title, 
  message, 
  details, 
  suggestions,
  onRetry 
}: { 
  title: string
  message: string
  details?: string[]
  suggestions?: string[]
  onRetry?: () => void 
}) {
  const [showDetails, setShowDetails] = useState(false)
  
  return (
    <div style={{
      width: '100%',
      minHeight: '300px',
      backgroundColor: '#1f2937',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      border: '2px solid #ef4444'
    }}>
      <div style={{ color: '#ef4444', fontSize: '32px', marginBottom: '16px' }}>⚠️</div>
      <div style={{ color: '#f87171', fontWeight: 'bold', fontSize: '16px', marginBottom: '12px' }}>
        {title}
      </div>
      <div style={{ 
        color: '#d1d5db', 
        fontSize: '14px', 
        textAlign: 'center', 
        maxWidth: '400px',
        marginBottom: '16px',
        lineHeight: '1.5'
      }}>
        {message}
      </div>
      
      {suggestions && suggestions.length > 0 && (
        <div style={{
          backgroundColor: '#374151',
          borderRadius: '6px',
          padding: '12px 16px',
          marginBottom: '16px',
          maxWidth: '400px',
          width: '100%'
        }}>
          <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px', fontWeight: 'bold' }}>
            💡 Suggestions:
          </div>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#d1d5db', fontSize: '12px' }}>
            {suggestions.map((suggestion, i) => (
              <li key={i} style={{ marginBottom: '4px' }}>{suggestion}</li>
            ))}
          </ul>
        </div>
      )}
      
      {details && details.length > 0 && (
        <>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              background: 'none',
              border: 'none',
              color: '#6b7280',
              fontSize: '12px',
              cursor: 'pointer',
              marginBottom: '8px',
              textDecoration: 'underline'
            }}
          >
            {showDetails ? 'Hide Details' : 'Show Technical Details'}
          </button>
          {showDetails && (
            <div style={{
              backgroundColor: '#111827',
              borderRadius: '4px',
              padding: '12px',
              maxWidth: '400px',
              width: '100%',
              marginBottom: '16px',
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#9ca3af',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {details.map((detail, i) => (
                <div key={i} style={{ marginBottom: '4px' }}>{detail}</div>
              ))}
            </div>
          )}
        </>
      )}
      
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '10px 24px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          🔄 Try Again
        </button>
      )}
    </div>
  )
}

// Loading placeholder
function LoadingPlaceholder() {
  return (
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
        <div>Loading 3D terrain...</div>
      </div>
    </div>
  )
}

// Simple dynamic import - no catch handler that could cause issues
const ThreeCanvas = dynamic(() => import('./ThreeCanvas.client'), {
  ssr: false,
  loading: () => <LoadingPlaceholder />
})

// Extended airspace data with position info along route
interface PositionedAirspace extends AirspaceData {
  startProgress: number
  endProgress: number
}

interface Props {
  cells: ElevationGridCell[]
  minElev: number
  maxElev: number
  width: number
  airspaces?: PositionedAirspace[]
  routeBearing?: number
  totalDistanceKm?: number
  isExpanded?: boolean
  onToggleExpand?: () => void
}

export default function RouteTerrainProfileCanvas({ cells, minElev, maxElev, width, airspaces = [], routeBearing = 0, totalDistanceKm = 0, isExpanded = false, onToggleExpand }: Props) {
  const [isClient, setIsClient] = useState(false)
  const [webGLSupported, setWebGLSupported] = useState<boolean | null>(null)
  const [webGLDetails, setWebGLDetails] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const checkedRef = useRef(false)

  // Ensure we're on the client
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Check WebGL support once on mount
  useEffect(() => {
    if (!isClient || checkedRef.current) return
    checkedRef.current = true
    
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null
      
      if (!gl) {
        setWebGLSupported(false)
        setLoadError('WebGL is not supported or disabled in your browser.')
        setWebGLDetails([
          'Browser: ' + navigator.userAgent,
          'WebGL Context: Not available',
          'Possible causes: GPU disabled, browser settings, or outdated drivers'
        ])
      } else {
        setWebGLSupported(true)
        // Collect WebGL info for debugging
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
          const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          setWebGLDetails([
            `WebGL Vendor: ${vendor}`,
            `WebGL Renderer: ${renderer}`,
            `WebGL Version: ${(gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).VERSION)}`
          ])
        }
      }
    } catch (e) {
      setWebGLSupported(false)
      setLoadError('Failed to initialize WebGL graphics.')
      setWebGLDetails([
        'Error: ' + (e instanceof Error ? e.message : String(e)),
        'Browser: ' + navigator.userAgent
      ])
    }
  }, [isClient])

  // Not on client yet - show placeholder
  if (!isClient) {
    return (
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
          <div>Initializing 3D view...</div>
        </div>
      </div>
    )
  }

  // Show WebGL error
  if (webGLSupported === false) {
    return (
      <ErrorDisplay 
        title="WebGL Not Available"
        message={loadError || 'WebGL is required for 3D terrain visualization but is not available in your browser.'}
        details={webGLDetails}
        suggestions={[
          'Try using a modern browser (Chrome, Firefox, Edge)',
          'Enable hardware acceleration in browser settings',
          'Update your graphics drivers',
          'Check if WebGL is disabled in browser flags'
        ]}
      />
    )
  }

  // No data yet
  if (!cells || cells.length === 0) {
    return (
      <div style={{
        width: '100%',
        height: '200px',
        backgroundColor: '#1f2937',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        border: '1px dashed #4b5563'
      }}>
        <div style={{ color: '#6b7280', marginBottom: '8px' }}>📊</div>
        <div style={{ color: '#9ca3af', fontSize: '14px', textAlign: 'center' }}>
          Waiting for elevation data...
        </div>
      </div>
    )
  }

  // Check for valid elevation data
  const validCells = cells.filter(c => c.elevation !== null)
  if (validCells.length === 0) {
    return (
      <ErrorDisplay 
        title="No Elevation Data"
        message="No valid elevation data is available for this route. The terrain cannot be rendered."
        details={[
          `Total cells received: ${cells.length}`,
          `Cells with valid elevation: 0`,
          'All elevation values are null'
        ]}
        suggestions={[
          'Try selecting a different route',
          'Adjust the terrain profile width',
          'Check if the elevation API is responding',
          'The route may be over water or unmapped terrain'
        ]}
      />
    )
  }

  // Check for sufficient data to render mesh
  const progressValues = new Set(cells.map(c => Math.round(c.progressAlongPath * 1000)))
  if (progressValues.size < 2) {
    return (
      <ErrorDisplay 
        title="Insufficient Data"
        message="Not enough data points to render a 3D terrain mesh. At least 2 rows of elevation data are required."
        details={[
          `Total cells: ${cells.length}`,
          `Valid cells: ${validCells.length}`,
          `Unique progress rows: ${progressValues.size}`,
          `Min elevation: ${Math.min(...validCells.map(c => c.elevation!))}m`,
          `Max elevation: ${Math.max(...validCells.map(c => c.elevation!))}m`
        ]}
        suggestions={[
          'Select a longer route',
          'Increase the terrain profile width',
          'The route may be too short for 3D visualization'
        ]}
      />
    )
  }

  // Expand button component
  const ExpandButton = () => (
    <button
      onClick={onToggleExpand}
      style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        padding: '6px',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        cursor: 'pointer',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      title={isExpanded ? 'Minimize' : 'Expand'}
    >
      {isExpanded ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
        </svg>
      )}
    </button>
  )

  // Expanded fullscreen view
  if (isExpanded) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#ffffff',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#f9fafb'
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
            3D Terrain Profile
          </h3>
          <button
            onClick={onToggleExpand}
            style={{
              padding: '8px 16px',
              backgroundColor: '#374151',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
            </svg>
            Minimize
          </button>
        </div>
        
        {/* 3D View */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ThreeErrorBoundary
            onError={(error, errorInfo) => {
              console.error('ThreeErrorBoundary caught error:', error)
              console.error('Component stack:', errorInfo.componentStack)
            }}
          >
            <ThreeCanvas 
              cells={cells} 
              minElev={minElev} 
              maxElev={maxElev} 
              width={width} 
              airspaces={airspaces}
              routeBearing={routeBearing}
              totalDistanceKm={totalDistanceKm}
              isFullscreen={true}
            />
          </ThreeErrorBoundary>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {onToggleExpand && <ExpandButton />}
      <ThreeErrorBoundary
        onError={(error, errorInfo) => {
          console.error('ThreeErrorBoundary caught error:', error)
          console.error('Component stack:', errorInfo.componentStack)
        }}
      >
        <ThreeCanvas 
          cells={cells} 
          minElev={minElev} 
          maxElev={maxElev} 
          width={width} 
          airspaces={airspaces}
          routeBearing={routeBearing}
          totalDistanceKm={totalDistanceKm}
        />
      </ThreeErrorBoundary>
    </div>
  )
}