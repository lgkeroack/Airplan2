'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import AirspaceMap from './AirspaceMap'
import ParsingProgress from './ParsingProgress'
import { loadAirspaceDataWithProgress } from '@/lib/parse-with-progress'
import type { AirspaceData } from '@/lib/airspace-processing'
import type { ParseProgress } from '@/lib/parse-with-progress'
import type { AirspaceFile } from '@/lib/load-airspace-files'

interface LoadingAirspaceMapProps {
  initialFiles?: AirspaceFile[]
}

export default function LoadingAirspaceMap({ initialFiles = [] }: LoadingAirspaceMapProps) {
  const [airspaceData, setAirspaceData] = useState<AirspaceData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [progress, setProgress] = useState<ParseProgress>({
    progress: 0,
    status: 'Initializing...',
  })

  useEffect(() => {
    async function loadData() {
      try {
        console.log('LoadingAirspaceMap: Starting to parse airspace data...', { fileCount: initialFiles?.length || 0 })

        if (!initialFiles || initialFiles.length === 0) {
          console.error('LoadingAirspaceMap: No files provided')
          setProgress({
            progress: 100,
            status: 'No files to parse',
          })
          setIsLoading(false)
          return
        }

        setProgress({
          progress: 0,
          status: `Starting to parse ${initialFiles.length} file(s)...`,
        })

        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 100))

        setProgress({
          progress: 5,
          status: `Parsing ${initialFiles.length} file(s)...`,
          itemsParsed: 0,
        })

        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 100))

        console.log('LoadingAirspaceMap: Starting to parse files...')
        const data = await loadAirspaceDataWithProgress(initialFiles, (progress) => {
          console.log('LoadingAirspaceMap: Progress update:', progress)
          setProgress(progress)
        })
        console.log(`LoadingAirspaceMap: Parsing complete, ${data.length} entries`)

        setAirspaceData(data)
        setProgress({
          progress: 100,
          status: `Loaded ${data.length} airspace entries`,
        })
        setIsLoading(false)
      } catch (error) {
        console.error('Error loading airspace data:', error)
        setProgress({
          progress: 100,
          status: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
        setIsLoading(false)
      }
    }

    loadData()
  }, [initialFiles])

  if (isLoading) {
    return (
      <ParsingProgress
        progress={progress.progress}
        status={progress.status}
        currentFile={progress.currentFile}
        itemsParsed={progress.itemsParsed}
      />
    )
  }

  if (airspaceData.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#111827',
        color: 'white',
        fontFamily: 'monospace'
      }}>
        <div>No airspace data loaded</div>
      </div>
    )
  }

  return <AirspaceMap initialData={airspaceData} />
}

