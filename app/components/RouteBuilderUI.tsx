import React, { useRef } from 'react'
import * as toGeoJSON from 'togeojson'

interface RouteBuilderUIProps {
    distance: number // in meters
    onUndo: () => void
    onRedo: () => void
    onClear: () => void
    onCancel: () => void
    onFinish?: () => void
    onImport: (points: Array<{ lat: number; lon: number; ele?: number }>) => void
    canUndo: boolean
    canRedo: boolean
}

export default function RouteBuilderUI({
    distance,
    onUndo,
    onRedo,
    onClear,
    onCancel,
    onImport,
    onFinish,
    canUndo,
    canRedo
}: RouteBuilderUIProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (event) => {
            const result = event.target?.result as string
            if (!result) return

            try {
                const parser = new DOMParser()
                const xmlDoc = parser.parseFromString(result, 'text/xml')
                let geojson

                if (file.name.toLowerCase().endsWith('.gpx')) {
                    geojson = toGeoJSON.gpx(xmlDoc)
                } else if (file.name.toLowerCase().endsWith('.kml')) {
                    geojson = toGeoJSON.kml(xmlDoc)
                }

                if (geojson && geojson.features) {
                    const points: Array<{ lat: number; lon: number; ele?: number }> = []

                    // Extract coordinates from LineString or MultiLineString
                    geojson.features.forEach((feature: any) => {
                        if (feature.geometry.type === 'LineString') {
                            feature.geometry.coordinates.forEach((coord: number[]) => {
                                // GeoJSON is [lon, lat, ele]
                                points.push({ lon: coord[0], lat: coord[1], ele: coord[2] })
                            })
                        }
                    })

                    if (points.length > 0) {
                        onImport(points)
                    }
                }
            } catch (err) {
                console.error('Error parsing route file:', err)
                alert('Failed to parse route file. Please ensure it is a valid GPX or KML file.')
            }
        }
        reader.readAsText(file)
    }

    // Format distance
    const formatDistance = (meters: number) => {
        if (meters < 1000) return `${Math.round(meters)} m`
        return `${(meters / 1000).toFixed(2)} km`
    }

    const formatDistanceFt = (meters: number) => {
        const feet = meters * 3.28084
        if (feet < 5280) return `${Math.round(feet)} ft`
        return `${(feet / 5280).toFixed(2)} mi`
    }

    return (
        <div
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{
                position: 'absolute',
                bottom: '30px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(17, 24, 39, 0.9)',
                backdropFilter: 'blur(10px)',
                padding: '16px 24px',
                borderRadius: '16px',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                zIndex: 1000,
                fontFamily: "'Inter', sans-serif",
                border: '1px solid rgba(255,255,255,0.1)',
                minWidth: '450px'
            }}>
            {/* Stats Section */}
            <div style={{ display: 'flex', gap: '24px', paddingRight: '24px', borderRight: '1px solid rgba(255,255,255,0.2)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af' }}>Total Distance</span>
                    <span style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                        {formatDistance(distance)} <span style={{ fontSize: '14px', color: '#9ca3af', fontWeight: 'normal' }}>({formatDistanceFt(distance)})</span>
                    </span>
                </div>
            </div>

            {/* Controls Section */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px', borderRadius: '8px' }}>
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        title="Undo (Ctrl+Z)"
                        style={{
                            background: 'none',
                            border: 'none',
                            color: canUndo ? 'white' : 'rgba(255,255,255,0.3)',
                            cursor: canUndo ? 'pointer' : 'default',
                            padding: '8px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => canUndo && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 7v6h6" />
                            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                        </svg>
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        title="Redo (Ctrl+Y)"
                        style={{
                            background: 'none',
                            border: 'none',
                            color: canRedo ? 'white' : 'rgba(255,255,255,0.3)',
                            cursor: canRedo ? 'pointer' : 'default',
                            padding: '8px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => canRedo && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 7v6h-6" />
                            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 3.7" />
                        </svg>
                    </button>
                </div>

                <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                        background: 'rgba(59, 130, 246, 0.2)',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        color: '#60a5fa',
                        cursor: 'pointer',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.3)'
                        e.currentTarget.style.borderColor = '#60a5fa'
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)'
                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)'
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Import
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".gpx,.kml"
                    style={{ display: 'none' }}
                />

                <div style={{ flex: 1 }} />

                <button
                    onClick={onCancel}
                    style={{
                        background: 'transparent',
                        border: '1px solid rgba(239, 68, 68, 0.5)',
                        color: '#f87171',
                        cursor: 'pointer',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    Stop Drawing
                </button>
                {onFinish && (
                    <button
                        onClick={onFinish}
                        style={{
                            background: 'linear-gradient(90deg,#10b981,#06b6d4)',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: 700,
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
                    >
                        Finish Route
                    </button>
                )}
            </div>
        </div>
    )
}
