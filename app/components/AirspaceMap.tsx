// ... existing code up to line 20 ...

// Generate a corridor polygon from a route path
// Creates a "meandering slot" shape: semicircles at ends connected by a corridor
function generateRouteCorridor(
  route: Array<{ lat: number; lon: number }>,
  radiusKm: number
): Array<{ lat: number; lon: number }> {
  if (route.length < 2) return []
  
  const vertices: Array<{ lat: number; lon: number }> = []
  
  // Helper: Calculate distance between two points in km
  const distanceKm = (p1: { lat: number; lon: number }, p2: { lat: number; lon: number }): number => {
    const dx = (p2.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
    const dy = (p2.lat - p1.lat) * 111
    return Math.sqrt(dx * dx + dy * dy)
  }
  
  // Helper: Get perpendicular offset point
  const getPerpOffset = (
    p1: { lat: number; lon: number },
    p2: { lat: number; lon: number },
    offsetKm: number
  ): { left: { lat: number; lon: number }, right: { lat: number; lon: number } } => {
    const dx = (p2.lon - p1.lon) * 111 * Math.cos(p1.lat * Math.PI / 180)
    const dy = (p2.lat - p1.lat) * 111
    const len = Math.sqrt(dx * dx + dy * dy)
    
    if (len === 0) {
      return { left: p1, right: p1 }
    }
    
    // Perpendicular vector (normalized)
    const perpX = -dy / len
    const perpY = dx / len
    
    // Convert offset to degrees
    const offsetLat = (offsetKm / 111) * perpY
    const offsetLon = (offsetKm / (111 * Math.cos(p1.lat * Math.PI / 180))) * perpX
    
    return {
      left: { lat: p1.lat + offsetLat, lon: p1.lon + offsetLon },
      right: { lat: p1.lat - offsetLat, lon: p1.lon - offsetLon }
    }
  }
  
  // Generate semicircle points
  const generateSemicircle = (
    center: { lat: number; lon: number },
    direction: { lat: number; lon: number }, // Point the semicircle faces
    radiusKm: number,
    segments: number = 16
  ): Array<{ lat: number; lon: number }> => {
    const points: Array<{ lat: number; lon: number }> = []
    
    // Calculate direction vector
    const dx = (direction.lon - center.lon) * 111 * Math.cos(center.lat * Math.PI / 180)
    const dy = (direction.lat - center.lat) * 111
    const len = Math.sqrt(dx * dx + dy * dy)
    
    if (len === 0) return []
    
    // Angle of direction
    const dirAngle = Math.atan2(dy, dx)
    
    // Generate semicircle (facing the direction)
    const radiusDegLat = radiusKm / 111
    const radiusDegLon = radiusKm / (111 * Math.cos(center.lat * Math.PI / 180))
    
    for (let i = 0; i <= segments; i++) {
      // Semicircle from -90° to +90° relative to direction
      const angle = dirAngle - Math.PI / 2 + (i / segments) * Math.PI
      points.push({
        lat: center.lat + Math.cos(angle) * radiusDegLat,
        lon: center.lon + Math.sin(angle) * radiusDegLon
      })
    }
    
    return points
  }
  
  // Build left and right sides of corridor
  const leftSide: Array<{ lat: number; lon: number }> = []
  const rightSide: Array<{ lat: number; lon: number }> = []
  
  // For each segment, add points on left and right sides
  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i]
    const p2 = route[i + 1]
    
    // Get perpendicular offsets for this segment
    const offset = getPerpOffset(p1, p2, radiusKm)
    
    if (i === 0) {
      // First segment - add points at p1
      leftSide.push(offset.left)
      rightSide.push(offset.right)
    }
    
    // Add points at p2
    if (i < route.length - 2) {
      // Not the last segment - smooth transition at p2
      const p3 = route[i + 2]
      const offsetNext = getPerpOffset(p2, p3, radiusKm)
      
      // Average for smooth corner
      leftSide.push({
        lat: (offset.left.lat + offsetNext.left.lat) / 2,
        lon: (offset.left.lon + offsetNext.left.lon) / 2
      })
      rightSide.push({
        lat: (offset.right.lat + offsetNext.right.lat) / 2,
        lon: (offset.right.lon + offsetNext.right.lon) / 2
      })
    } else {
      // Last segment - use offsets directly at p2
      leftSide.push(offset.left)
      rightSide.push(offset.right)
    }
  }
  
  // Build polygon: start semicircle → left side → end semicircle (reversed) → right side (reversed)
  if (route.length >= 2) {
    // Start semicircle (facing first segment)
    const startSemi = generateSemicircle(route[0], route[1], radiusKm)
    vertices.push(...startSemi)
  }
  
  // Left side
  vertices.push(...leftSide)
  
  // End semicircle (facing backward from last segment, reversed)
  if (route.length >= 2) {
    const endSemi = generateSemicircle(
      route[route.length - 1],
      route[route.length - 2],
      radiusKm
    ).reverse()
    vertices.push(...endSemi)
  }
  
  // Right side (reversed to close polygon)
  vertices.push(...rightSide.reverse())
  
  // Close polygon
  if (vertices.length > 0 && 
      (vertices[0].lat !== vertices[vertices.length - 1].lat ||
       vertices[0].lon !== vertices[vertices.length - 1].lon)) {
    vertices.push(vertices[0])
  }
  
  return vertices
}

// ... rest of existing code ...
