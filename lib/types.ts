export interface AirspaceData {
    id: string
    notamNumber: string
    type: string
    location: string
    effectiveStart: string
    effectiveEnd: string
    message: string
    coordinates?: {
        latitude: number
        longitude: number
    }
    radius?: number // in nautical miles
    altitude?: {
        floor: number
        ceiling: number
    }
    polygon?: Array<{ latitude: number; longitude: number }>
    bounds?: {
        north: number
        south: number
        east: number
        west: number
    }
    metadata?: {
        fileName: string
        fileSize: number
        lastModified: string
        source: string
    }
}
