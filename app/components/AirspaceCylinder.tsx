'use client'

import { useRef, useLayoutEffect, useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Mesh, BufferAttribute, MathUtils, DoubleSide } from 'three'

function CylinderMesh({ tilt }: { tilt: number }) {
    const meshRef = useRef<Mesh>(null)

    useLayoutEffect(() => {
        if (!meshRef.current) return
        const geo = meshRef.current.geometry
        if (!geo) return

        const count = geo.attributes.position.count
        const colors = new Float32Array(count * 3)
        const positions = geo.attributes.position.array

        // Cylinder height is 4, centered at 0 (range -2 to 2)
        for (let i = 0; i < count; i++) {
            // Access y value from buffer attribute array
            // @ts-ignore - buffer attribute array access is safe here
            const y = positions[i * 3 + 1]

            // Normalize y from [-2, 2] to [0, 1]
            const t = (y + 2) / 4

            // Gradient: Green (bottom) -> Blue (top)
            // Green: 0, 1, 0
            // Blue: 0, 0, 1

            colors[i * 3] = 0     // R
            colors[i * 3 + 1] = 1 - t // G
            colors[i * 3 + 2] = t     // B
        }

        geo.setAttribute('color', new BufferAttribute(colors, 3))
        geo.attributes.color.needsUpdate = true
    }, []) // Run once on mount

    return (
        <mesh
            ref={meshRef}
            rotation={[MathUtils.degToRad(tilt), 0, 0]} // Tilt around X axis
        >
            <cylinderGeometry args={[1.5, 1.5, 4, 32, 1, false]} />
            <meshBasicMaterial vertexColors side={DoubleSide} transparent opacity={0.7} />
        </mesh>
    )
}

export default function AirspaceCylinder() {
    const [tilt, setTilt] = useState(0)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return (
            <div style={{ marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                    3D Airspace View
                </h3>
                <div style={{ position: 'relative', height: '300px', width: '100%', backgroundColor: '#111827', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#9ca3af' }}>Loading 3D view...</span>
                </div>
            </div>
        )
    }

    return (
        <div style={{ marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                3D Airspace View
            </h3>

            <div style={{ position: 'relative', height: '300px', width: '100%', backgroundColor: '#111827', borderRadius: '8px', overflow: 'hidden' }}>
                <Canvas camera={{ position: [0, 0, 8], fov: 50 }}>
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} />
                    <CylinderMesh tilt={tilt} />
                    <OrbitControls
                        enablePan={false}
                        enableZoom={true}
                        minPolarAngle={0}
                        maxPolarAngle={Math.PI}
                    />
                    <gridHelper args={[10, 10, 0x444444, 0x222222]} rotation={[Math.PI / 2, 0, 0]} />
                </Canvas>
            </div>

            <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                        Tilt (from Z-axis)
                    </label>
                    <span style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>
                        {tilt}°
                    </span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="45"
                    step="1"
                    value={tilt}
                    onChange={(e) => setTilt(parseInt(e.target.value))}
                    style={{
                        width: '100%',
                        accentColor: '#3b82f6',
                        cursor: 'pointer'
                    }}
                />
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
                    Rotate along X-axis to tilt the cylinder.
                </p>
            </div>
        </div>
    )
}
