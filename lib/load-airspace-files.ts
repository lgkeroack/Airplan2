// Load airspace file contents from server (for client-side parsing)

import { readFile } from 'fs/promises'
import { join } from 'path'

export interface AirspaceFile {
  content: string
  source: 'US' | 'CA'
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

// Load US airspace file content from local file (server-side only)
async function loadUSFileContent(): Promise<AirspaceFile | null> {
  try {
    const filePath = join(process.cwd(), 'data', 'allusa.txt')
    const content = await readFile(filePath, 'utf-8')
    return {
      content,
      source: 'US',
      name: 'allusa.txt'
    }
  } catch (error: any) {
    console.error('Error reading US airspace file:', error)
    return null
  }
}

// Load all airspace file contents (server-side only)
export async function loadAirspaceFileContents(country: 'US' | 'CA' | 'ALL' = 'ALL'): Promise<AirspaceFile[]> {
  const files: AirspaceFile[] = []

  try {
    if (country === 'US' || country === 'ALL') {
      const usFile = await loadUSFileContent()
      if (usFile) {
        files.push(usFile)
      }
    }

    if (country === 'CA' || country === 'ALL') {
      const caFile = await loadCanadianFileContent()
      if (caFile) {
        files.push(caFile)
      }
    }
  } catch (error: any) {
    console.error('Error loading airspace files:', error)
  }

  return files
}
