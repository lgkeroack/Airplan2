// Wrapper for parsing with progress tracking

import { parseOpenAirFile, convertToApiFormat } from './openair-parser'
import type { AirspaceData } from './load-airspace-data'

export interface ParseProgress {
  progress: number // 0-100
  status: string
  currentFile?: string
  itemsParsed?: number
}

export type ProgressCallback = (progress: ParseProgress) => void

// Parse OpenAir file with progress tracking
export async function parseOpenAirFileWithProgress(
  content: string,
  source: 'US' | 'CA' | 'USER',
  fileName: string,
  onProgress?: ProgressCallback
): Promise<AirspaceData[]> {
  if (onProgress) {
    onProgress({
      progress: 0,
      status: `Reading ${fileName}...`,
      currentFile: fileName,
    })
  }

  // Allow UI to update
  await new Promise(resolve => setTimeout(resolve, 50))
  
  if (onProgress) {
    onProgress({
      progress: 10,
      status: `Parsing ${fileName}...`,
      currentFile: fileName,
    })
  }

  // Allow UI to update before heavy parsing
  await new Promise(resolve => setTimeout(resolve, 50))

  // Parse the file (this is synchronous but may take time)
  const parsed = parseOpenAirFile(content, source)
  
  if (onProgress) {
    onProgress({
      progress: 60,
      status: `Converting ${fileName}...`,
      currentFile: fileName,
      itemsParsed: parsed.length,
    })
  }

  // Allow UI to update
  await new Promise(resolve => setTimeout(resolve, 50))

  // Convert to API format
  const converted = convertToApiFormat(parsed, source)
  
  if (onProgress) {
    onProgress({
      progress: 100,
      status: `Completed ${fileName}`,
      currentFile: fileName,
      itemsParsed: converted.length,
    })
  }

  return converted
}

// Load multiple files with progress tracking
export async function loadAirspaceDataWithProgress(
  files: Array<{ content: string; source: 'US' | 'CA' | 'USER'; name: string }>,
  onProgress?: ProgressCallback
): Promise<AirspaceData[]> {
  const allData: AirspaceData[] = []
  const totalFiles = files.length

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const fileProgress = ((i / totalFiles) * 100)
    const nextFileProgress = (((i + 1) / totalFiles) * 100)

    const fileData = await parseOpenAirFileWithProgress(
      file.content,
      file.source,
      file.name,
      (progress) => {
        if (onProgress) {
          // Scale progress for this file within overall progress
          const scaledProgress = fileProgress + (progress.progress / 100) * (nextFileProgress - fileProgress)
          onProgress({
            progress: scaledProgress,
            status: progress.status,
            currentFile: progress.currentFile,
            itemsParsed: allData.length + (progress.itemsParsed || 0),
          })
        }
      }
    )

    allData.push(...fileData)

    if (onProgress) {
      onProgress({
        progress: nextFileProgress,
        status: `Completed ${file.name}`,
        currentFile: undefined,
        itemsParsed: allData.length,
      })
    }
  }

  return allData
}

