// Global type declarations for the project

interface Window {
  __RenderTerrainProfile3D?: (props: {
    cells: Array<{
      lat: number
      lon: number
      elevation: number | null
      distanceFromPath: number
      progressAlongPath: number
    }>
    minElev: number
    maxElev: number
    width: number
  }) => React.ReactElement | null
}
