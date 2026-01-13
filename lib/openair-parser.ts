// OpenAir file format parser
// Reference: http://www.winpilot.com/UsersGuide/UserAirspace.asp

import { arcToPolygonPoints, ArcDefinition, arcByAngles } from './arc-converter'

interface OpenAirAirspace {
  id: string
  name: string
  type: string
  altitudeLow: string
  altitudeHigh: string
  coordinates: Array<{ latitude: number; longitude: number }>
  center?: { latitude: number; longitude: number }
  radius?: number // in nautical miles
  polygon?: Array<{ latitude: number; longitude: number }>
}

// Convert DD:MM:SS.S format to decimal degrees
function parseCoordinate(coord: string): number {
  const parts = coord.trim().split(/[:\s]+/)
  if (parts.length < 3) return 0
  
  const degrees = parseFloat(parts[0])
  const minutes = parseFloat(parts[1])
  const seconds = parseFloat(parts[2] || '0')
  const direction = parts[parts.length - 1] // N, S, E, W
  
  let decimal = degrees + minutes / 60 + seconds / 3600
  
  if (direction === 'S' || direction === 'W') {
    decimal = -decimal
  }
  
  return decimal
}

// Parse a coordinate pair like "49:03:17 N 122:07:24 W"
function parseCoordinatePair(line: string): { latitude: number; longitude: number } | null {
  const match = line.match(/(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)\s*([NS])\s+(\d{1,3}:\d{2}:\d{2}(?:\.\d+)?)\s*([EW])/)
  if (!match) return null
  
  const latCoord = parseCoordinate(match[1] + ' ' + match[2])
  const lonCoord = parseCoordinate(match[3] + ' ' + match[4])
  
  return { latitude: latCoord, longitude: lonCoord }
}

// Parse OpenAir format file
export function parseOpenAirFile(content: string, source: 'US' | 'CA' | 'USER' = 'US'): OpenAirAirspace[] {
  const lines = content.split('\n')
  const airspaces: OpenAirAirspace[] = []
  let currentAirspace: Partial<OpenAirAirspace> | null = null
  let currentPolygon: Array<{ latitude: number; longitude: number }> = []
  let airspaceCounter = 0
  let arcCenter: { latitude: number; longitude: number } | null = null
  let arcClockwise: boolean = true // Default to clockwise
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Skip empty lines and comments
    if (!line || line.startsWith('*')) {
      // End of airspace definition
      if (line === '*' && currentAirspace) {
        if (currentPolygon.length > 0) {
          // Close polygon if not already closed
          if (currentPolygon.length > 2) {
            const first = currentPolygon[0]
            const last = currentPolygon[currentPolygon.length - 1]
            const threshold = 0.0001
            if (Math.abs(first.latitude - last.latitude) > threshold || 
                Math.abs(first.longitude - last.longitude) > threshold) {
              currentPolygon.push({ ...first })
            }
          }
          currentAirspace.polygon = currentPolygon
        }
        if (currentAirspace.name && (currentAirspace.coordinates || currentAirspace.center)) {
          airspaces.push({
            id: currentAirspace.id || `airspace-${airspaceCounter++}`,
            name: currentAirspace.name || 'Unknown',
            type: currentAirspace.type || 'Unknown',
            altitudeLow: currentAirspace.altitudeLow || '0',
            altitudeHigh: currentAirspace.altitudeHigh || '18000',
            coordinates: currentAirspace.coordinates || [],
            center: currentAirspace.center,
            radius: currentAirspace.radius,
            polygon: currentAirspace.polygon,
          })
        }
        currentAirspace = null
        currentPolygon = []
        arcCenter = null
      }
      continue
    }
    
    // AC - Airspace Class
    if (line.startsWith('AC ')) {
      if (currentAirspace) {
        // Save previous airspace
        if (currentPolygon.length > 0) {
          currentAirspace.polygon = currentPolygon
        }
        if (currentAirspace.name && (currentAirspace.coordinates || currentAirspace.center)) {
          airspaces.push({
            id: currentAirspace.id || `airspace-${airspaceCounter++}`,
            name: currentAirspace.name || 'Unknown',
            type: currentAirspace.type || 'Unknown',
            altitudeLow: currentAirspace.altitudeLow || '0',
            altitudeHigh: currentAirspace.altitudeHigh || '18000',
            coordinates: currentAirspace.coordinates || [],
            center: currentAirspace.center,
            radius: currentAirspace.radius,
            polygon: currentAirspace.polygon,
          })
        }
      }
      currentAirspace = {
        id: `airspace-${airspaceCounter}`,
        coordinates: [],
      }
      currentPolygon = []
      arcCenter = null
      
      const classCode = line.substring(3).trim()
      // Map OpenAir class codes to types
      const classMap: Record<string, string> = {
        'Q': 'Class E',
        'R': 'Restricted',
        'P': 'Prohibited',
        'A': 'Class A',
        'B': 'Class B',
        'C': 'Class C',
        'D': 'Class D',
        'E': 'Class E',
        'F': 'Restricted',
        'W': 'Warning',
        'G': 'Class G',
      }
      currentAirspace.type = classMap[classCode] || classCode
    }
    
    // AN - Airspace Name
    if (line.startsWith('AN ')) {
      if (currentAirspace) {
        currentAirspace.name = line.substring(3).trim()
      }
    }
    
    // AL - Altitude Low
    if (line.startsWith('AL ')) {
      if (currentAirspace) {
        currentAirspace.altitudeLow = line.substring(3).trim()
      }
    }
    
    // AH - Altitude High
    if (line.startsWith('AH ')) {
      if (currentAirspace) {
        currentAirspace.altitudeHigh = line.substring(3).trim()
      }
    }
    
    // V D=+ or V D=- - Arc direction
    if (line.match(/^V\s+D\s*=\s*[+\-]/)) {
      arcClockwise = line.includes('D=+') || line.includes('D =+')
    }
    
    // V X= - Arc/Circle center (used by DC, DA, and DB commands)
    if (line.match(/^V\s+X\s*=/)) {
      const coord = parseCoordinatePair(line.substring(line.indexOf('X=') + 2))
      if (coord && currentAirspace) {
        arcCenter = coord
        // Also set as potential circle center
        currentAirspace.center = coord
        if (!currentAirspace.coordinates || currentAirspace.coordinates.length === 0) {
          currentAirspace.coordinates = [coord]
        }
      }
    }
    
    // DB - Arc boundary points (start, end)
    if (line.startsWith('DB ')) {
      if (arcCenter && currentAirspace) {
        const dbLine = line.substring(3).trim()
        // DB format: "lat1 lon1, lat2 lon2"
        const parts = dbLine.split(',')
        if (parts.length === 2) {
          const startCoord = parseCoordinatePair(parts[0].trim())
          const endCoord = parseCoordinatePair(parts[1].trim())
          
          if (startCoord && endCoord) {
            // Use the DB start point as arc start (or last polygon point if available)
            const arcStart = currentPolygon.length > 0 
              ? currentPolygon[currentPolygon.length - 1]
              : startCoord
            
            // Convert arc to polygon points
            const arcDef: ArcDefinition = {
              center: arcCenter,
              startPoint: arcStart,
              endPoint: endCoord,
              clockwise: arcClockwise
            }
            
            const arcPoints = arcToPolygonPoints(arcDef, 30) // 30 points for smooth arc
            // Add arc points (skip first point if it duplicates last polygon point)
            const startIdx = currentPolygon.length > 0 ? 1 : 0
            for (let j = startIdx; j < arcPoints.length; j++) {
              currentPolygon.push(arcPoints[j])
            }
          }
        }
      }
    }
    
    // DP - Define Point (polygon point)
    if (line.startsWith('DP ')) {
      const coord = parseCoordinatePair(line.substring(3))
      if (coord && currentAirspace) {
        currentPolygon.push(coord)
        if (!currentAirspace.coordinates) {
          currentAirspace.coordinates = []
        }
        currentAirspace.coordinates.push(coord)
      }
    }
    
    // DC - Circle (center point with radius)
    if (line.startsWith('DC ')) {
      if (currentAirspace) {
        const radiusMatch = line.match(/DC\s+([\d.]+)/)
        if (radiusMatch) {
          currentAirspace.radius = parseFloat(radiusMatch[1])
        }
      }
    }
    
    // DA - Arc defined by radius and angles
    // Format: DA radius, startAngle, endAngle
    if (line.startsWith('DA ')) {
      if (arcCenter && currentAirspace) {
        const daMatch = line.match(/DA\s+([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/)
        if (daMatch) {
          const radius = parseFloat(daMatch[1])
          const startAngle = parseFloat(daMatch[2])
          const endAngle = parseFloat(daMatch[3])
          
          // Generate arc points
          const arcPoints = arcByAngles(arcCenter, radius, startAngle, endAngle, arcClockwise, 30)
          
          // Add arc points to polygon
          for (const point of arcPoints) {
            currentPolygon.push(point)
          }
        }
      }
    }
  }
  
  // Add last airspace if exists
  if (currentAirspace) {
    if (currentPolygon.length > 0) {
      // Close polygon if not already closed (first point != last point)
      if (currentPolygon.length > 2) {
        const first = currentPolygon[0]
        const last = currentPolygon[currentPolygon.length - 1]
        const threshold = 0.0001 // Very small threshold for coordinate comparison
        if (Math.abs(first.latitude - last.latitude) > threshold || 
            Math.abs(first.longitude - last.longitude) > threshold) {
          // Polygon is not closed, add first point at the end
          currentPolygon.push({ ...first })
        }
      }
      currentAirspace.polygon = currentPolygon
    }
    if (currentAirspace.name && (currentAirspace.coordinates || currentAirspace.center)) {
      airspaces.push({
        id: currentAirspace.id || `airspace-${airspaceCounter++}`,
        name: currentAirspace.name || 'Unknown',
        type: currentAirspace.type || 'Unknown',
        altitudeLow: currentAirspace.altitudeLow || '0',
        altitudeHigh: currentAirspace.altitudeHigh || '18000',
        coordinates: currentAirspace.coordinates || [],
        center: currentAirspace.center,
        radius: currentAirspace.radius,
        polygon: currentAirspace.polygon,
      })
    }
  }
  
  return airspaces
}

// Convert parsed OpenAir data to our API format
export function convertToApiFormat(
  openAirData: OpenAirAirspace[],
  source: 'US' | 'CA' | 'USER' = 'US'
): Array<{
  id: string
  notamNumber: string
  type: string
  location: string
  effectiveStart: string
  effectiveEnd: string
  message: string
  coordinates?: { latitude: number; longitude: number }
  radius?: number
  altitude?: { floor: number; ceiling: number }
  polygon?: Array<{ latitude: number; longitude: number }>
}> {
  return openAirData.map((airspace, index) => {
    // Parse altitude
    const parseAltitude = (alt: string): number => {
      if (!alt) return 0
      const match = alt.match(/(\d+)/)
      if (match) {
        let value = parseFloat(match[1])
        if (alt.includes('FL')) {
          value = value * 100 // Flight level to feet
        }
        return value
      }
      if (alt.includes('GND') || alt.includes('SFC')) return 0
      return 0
    }
    
    const floor = parseAltitude(airspace.altitudeLow)
    const ceiling = parseAltitude(airspace.altitudeHigh)
    
    // Use center for circles, or first coordinate for polygons
    const center = airspace.center || 
                   (airspace.coordinates && airspace.coordinates.length > 0 
                     ? airspace.coordinates[0] 
                     : undefined)
    
    return {
      id: `${source}-${airspace.id}-${index}`,
      notamNumber: airspace.name,
      type: airspace.type,
      location: airspace.name,
      effectiveStart: new Date().toISOString(),
      effectiveEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
      message: `${airspace.type}: ${airspace.name} (${airspace.altitudeLow} to ${airspace.altitudeHigh})`,
      coordinates: center,
      radius: airspace.radius,
      altitude: {
        floor,
        ceiling: ceiling || 18000,
      },
      polygon: airspace.polygon,
    }
  })
}

