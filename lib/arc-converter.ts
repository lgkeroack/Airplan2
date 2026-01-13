// Convert OpenAir arcs to polygon points

export interface ArcDefinition {
  center: { latitude: number; longitude: number }
  startPoint: { latitude: number; longitude: number }
  endPoint: { latitude: number; longitude: number }
  clockwise: boolean // true for D=+, false for D=-
}

// Calculate distance between two points (Haversine formula) in nautical miles
function distance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3440.065 // Earth radius in nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Calculate bearing from point 1 to point 2 (in degrees)
function bearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2Rad)
  const x = 
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon)
  const brng = Math.atan2(y, x) * 180 / Math.PI
  return (brng + 360) % 360
}

// Calculate point at distance and bearing from a starting point
function destination(
  lat: number, lon: number,
  bearing: number, distance: number
): { latitude: number; longitude: number } {
  const R = 3440.065 // Earth radius in nautical miles
  const latRad = lat * Math.PI / 180
  const lonRad = lon * Math.PI / 180
  const brngRad = bearing * Math.PI / 180
  const distRad = distance / R
  
  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(distRad) +
    Math.cos(latRad) * Math.sin(distRad) * Math.cos(brngRad)
  )
  const newLonRad = lonRad + Math.atan2(
    Math.sin(brngRad) * Math.sin(distRad) * Math.cos(latRad),
    Math.cos(distRad) - Math.sin(latRad) * Math.sin(newLatRad)
  )
  
  return {
    latitude: newLatRad * 180 / Math.PI,
    longitude: newLonRad * 180 / Math.PI
  }
}

// Convert arc to polygon points
export function arcToPolygonPoints(arc: ArcDefinition, numPoints: number = 20): Array<{ latitude: number; longitude: number }> {
  const points: Array<{ latitude: number; longitude: number }> = []
  
  // Calculate radius from center to start point
  const radius = distance(
    arc.center.latitude, arc.center.longitude,
    arc.startPoint.latitude, arc.startPoint.longitude
  )
  
  // Calculate bearings
  const startBearing = bearing(
    arc.center.latitude, arc.center.longitude,
    arc.startPoint.latitude, arc.startPoint.longitude
  )
  
  const endBearing = bearing(
    arc.center.latitude, arc.center.longitude,
    arc.endPoint.latitude, arc.endPoint.longitude
  )
  
  // Calculate raw arc angle (difference between bearings)
  let arcAngle = endBearing - startBearing
  
  // Normalize angle based on direction
  // For clockwise (D=+): we want to go in the increasing bearing direction (turning right)
  // For counterclockwise (D=-): we want to go in the decreasing bearing direction (turning left)
  if (arc.clockwise) {
    // Clockwise: if endBearing < startBearing, we need to go the long way (wrap around)
    if (arcAngle < 0) {
      arcAngle = arcAngle + 360
    }
    // If arcAngle is already positive, use it as is
  } else {
    // Counterclockwise: if endBearing > startBearing, we need to go the long way (wrap around)
    if (arcAngle > 0) {
      arcAngle = arcAngle - 360
    }
    // If arcAngle is already negative, use it as is
  }
  
  // Generate points along the arc
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints
    let currentBearing = startBearing + arcAngle * t
    // Normalize bearing to 0-360 range
    currentBearing = ((currentBearing % 360) + 360) % 360
    const point = destination(arc.center.latitude, arc.center.longitude, currentBearing, radius)
    points.push(point)
  }
  
  return points
}

// Convert arc defined by angles (DA command) to polygon points
// DA radius, startAngle, endAngle - angles in degrees, clockwise from north
export function arcByAngles(
  center: { latitude: number; longitude: number },
  radiusNM: number,
  startAngle: number,
  endAngle: number,
  clockwise: boolean,
  numPoints: number = 30
): Array<{ latitude: number; longitude: number }> {
  const points: Array<{ latitude: number; longitude: number }> = []
  
  // Calculate arc angle
  let arcAngle = endAngle - startAngle
  
  // Normalize based on direction
  if (clockwise) {
    // Clockwise: positive direction
    if (arcAngle < 0) {
      arcAngle = arcAngle + 360
    }
  } else {
    // Counterclockwise: negative direction
    if (arcAngle > 0) {
      arcAngle = arcAngle - 360
    }
  }
  
  // Generate points along the arc
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints
    let currentBearing = startAngle + arcAngle * t
    // Normalize bearing to 0-360 range
    currentBearing = ((currentBearing % 360) + 360) % 360
    const point = destination(center.latitude, center.longitude, currentBearing, radiusNM)
    points.push(point)
  }
  
  return points
}

