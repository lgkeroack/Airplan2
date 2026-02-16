// Load airspace file contents from server (for client-side parsing)

import { join } from 'path'

export interface AirspaceFile {
  content: string
  source: 'CA'
  name: string
}

// Load Canadian airspace file content from URL (server-side only)
async function loadCanadianFileContent(): Promise<AirspaceFile | null> {
  try {
    const response = await fetch(
      'https://soaringweb.org/Airspace/NA/CanAirspace318nolowE.txt',
      {
        headers: {
          'User-Agent': 'TopographicAirspaceApp/1.0',
        },
      }
    )

    if (!response.ok) {
      console.error(`Failed to fetch Canadian airspace file: ${response.status} ${response.statusText}`)
      return null
    }

    const content = await response.text()
    return {
      content,
      source: 'CA',
      name: 'CanAirspace318nolowE.txt'
    }
  } catch (error: any) {
    console.error('Error fetching Canadian airspace:', error)
    return null
  }
}

// Load all airspace file contents (server-side only)
export async function loadAirspaceFileContents(country: 'CA' | 'ALL' = 'ALL'): Promise<AirspaceFile[]> {
  const files: AirspaceFile[] = []

  try {
    const caFile = await loadCanadianFileContent()
    if (caFile) {
      files.push(caFile)
    }
  } catch (error: any) {
    console.error('Error loading airspace files:', error)
  }

  return files
}
