'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { AirspaceData, DeeplinkParams } from '@/lib/types'

const AirspaceMap = dynamic(() => import('./AirspaceMap'), {
  ssr: false,
  loading: () => <div>Loading map...</div>
})

interface AirspaceMapLoaderProps {
  initialData: AirspaceData[]
}

function AirspaceMapInner({ initialData }: AirspaceMapLoaderProps) {
  const searchParams = useSearchParams()

  let deeplinkParams: DeeplinkParams | undefined
  const latStr = searchParams.get('lat')
  const lonStr = searchParams.get('lon')
  if (latStr && lonStr) {
    const lat = parseFloat(latStr)
    const lon = parseFloat(lonStr)
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      deeplinkParams = { lat, lon }
    }
  }

  return <AirspaceMap initialData={initialData} deeplinkParams={deeplinkParams} />
}

export default function AirspaceMapLoader({ initialData }: AirspaceMapLoaderProps) {
  return (
    <Suspense fallback={<div>Loading map...</div>}>
      <AirspaceMapInner initialData={initialData} />
    </Suspense>
  )
}
