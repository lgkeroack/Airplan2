
// Check if two line segments intersect (for self-intersection detection)
function segmentsIntersect(
    p1: { lat: number; lon: number },
    p2: { lat: number; lon: number },
    p3: { lat: number; lon: number },
    p4: { lat: number; lon: number }
): boolean {
    const ccw = (A: { lat: number; lon: number }, B: { lat: number; lon: number }, C: { lat: number; lon: number }) => {
        return (C.lon - A.lon) * (B.lat - A.lat) > (B.lon - A.lon) * (C.lat - A.lat)
    }
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4)
}

// Check if a polygon has self-intersections
export function hasSelfintersection(vertices: Array<{ lat: number; lon: number }>): boolean {
    if (vertices.length < 4) return false

    for (let i = 0; i < vertices.length; i++) {
        const p1 = vertices[i]
        const p2 = vertices[(i + 1) % vertices.length]

        for (let j = i + 2; j < vertices.length; j++) {
            // Skip adjacent segments
            if (j === vertices.length - 1 && i === 0) continue

            const p3 = vertices[j]
            const p4 = vertices[(j + 1) % vertices.length]

            if (segmentsIntersect(p1, p2, p3, p4)) {
                return true
            }
        }
    }
    return false
}
