'use client'

import dynamic from 'next/dynamic'
import type { AirspaceData } from '@/lib/types'

const AirspaceMap = dynamic(() => import('./AirspaceMap'), {
  ssr: false,
  loading: () => <div>Loading map...</div>
})

interface AirspaceMapLoaderProps {
  initialData: AirspaceData[]
}

export default function AirspaceMapLoader({ initialData }: AirspaceMapLoaderProps) {
  return <AirspaceMap initialData={initialData} />
}
