// Check if a point is within an airspace (polygon or circle)

import type { AirspaceData } from './load-airspace-data'

// Check if a polygon is valid (has valid coordinates and reasonable area)
export function isValidPolygon(polygon: Array<{ latitude: number; longitude: number }>): boolean {
  if (!polygon || polygon.length < 3) return false

  // Check for invalid coordinates
  for (const p of polygon) {
    if (isNaN(p.latitude) || isNaN(p.longitude)) return false
    if (Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) return false
  }

  // Check for degenerate polygon (all points the same or very close)
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const p of polygon) {
    minLat = Math.min(minLat, p.latitude)
    maxLat = Math.max(maxLat, p.latitude)
    minLon = Math.min(minLon, p.longitude)
    maxLon = Math.max(maxLon, p.longitude)
  }

  const latRange = maxLat - minLat
  const lonRange = maxLon - minLon

  // Polygon must have some area (at least ~100m in each direction)
  if (latRange < 0.0009 && lonRange < 0.0009) return false

  return true
}

// Check if a point is inside a polygon's bounding box
function pointInBoundingBox(
  point: { latitude: number; longitude: number },
  polygon: Array<{ latitude: number; longitude: number }>
): boolean {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const p of polygon) {
    minLat = Math.min(minLat, p.latitude)
    maxLat = Math.max(maxLat, p.latitude)
    minLon = Math.min(minLon, p.longitude)
    maxLon = Math.max(maxLon, p.longitude)
  }

  return point.latitude >= minLat && point.latitude <= maxLat &&
    point.longitude >= minLon && point.longitude <= maxLon
}

// Check if a point is inside a polygon using ray casting algorithm
export function pointInPolygon(
  point: { latitude: number; longitude: number },
  polygon: Array<{ latitude: number; longitude: number }>
): boolean {
  if (!isValidPolygon(polygon)) return false

  // Quick bounding box check first
  if (!pointInBoundingBox(point, polygon)) return false

  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude
    const yi = polygon[i].latitude
    const xj = polygon[j].longitude
    const yj = polygon[j].latitude

    // Skip degenerate edges
    if (yi === yj) continue

    const intersect = ((yi > point.latitude) !== (yj > point.latitude)) &&
      (point.longitude < (xj - xi) * (point.latitude - yi) / (yj - yi) + xi)

    if (intersect) inside = !inside
  }

  return inside
}

// Calculate distance between two points in nautical miles (Haversine formula)
function distanceNM(
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

// Check if a point is within a circle (airspace with center and radius)
export function pointInCircle(
  point: { latitude: number; longitude: number },
  center: { latitude: number; longitude: number },
  radiusNM: number
): boolean {
  const distance = distanceNM(
    center.latitude, center.longitude,
    point.latitude, point.longitude
  )
  return distance <= radiusNM
}

// Check if a point is within an airspace
export function pointInAirspace(
  point: { latitude: number; longitude: number },
  airspace: AirspaceData
): boolean {
  // Use pre-calculated bounds if available for fast rejection
  if (airspace.bounds) {
    const b = airspace.bounds
    if (point.latitude > b.north || point.latitude < b.south ||
      point.longitude > b.east || point.longitude < b.west) {
      return false
    }
  }

  // Check polygon if available
  if (airspace.polygon && airspace.polygon.length > 2) {
    // If we have bounds, pointInPolygon's internal bounding box check is redundant but safe
    return pointInPolygon(point, airspace.polygon)
  }

  // Check circle if center and radius are available
  if (airspace.coordinates && airspace.radius !== undefined) {
    return pointInCircle(point, airspace.coordinates, airspace.radius)
  }

  // If no geometry, return false
  return false
}

// Find all airspaces that contain a point
export function findAirspacesAtPoint(
  point: { latitude: number; longitude: number },
  airspaces: AirspaceData[]
): AirspaceData[] {
  return airspaces.filter(airspace => pointInAirspace(point, airspace))
}

