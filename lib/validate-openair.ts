// Validate OpenAir file format

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  airspaceCount: number
}

// Basic OpenAir format validation
export function validateOpenAirFile(content: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const lines = content.split('\n')
  
  let hasAC = false
  let hasAN = false
  let hasAL = false
  let hasAH = false
  let hasCoordinates = false
  let airspaceCount = 0
  let currentAirspace = false
  
  // Check for basic structure
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    if (line.startsWith('AC ')) {
      if (currentAirspace && !hasCoordinates) {
        warnings.push(`Airspace ${airspaceCount} has no coordinates`)
      }
      airspaceCount++
      currentAirspace = true
      hasAC = true
      hasAN = false
      hasAL = false
      hasAH = false
      hasCoordinates = false
    }
    
    if (line.startsWith('AN ')) {
      hasAN = true
    }
    
    if (line.startsWith('AL ')) {
      hasAL = true
    }
    
    if (line.startsWith('AH ')) {
      hasAH = true
    }
    
    if (line.startsWith('DP ') || line.startsWith('V X=') || line.startsWith('DC ')) {
      hasCoordinates = true
    }
  }
  
  // Final check for last airspace
  if (currentAirspace && !hasCoordinates) {
    warnings.push(`Airspace ${airspaceCount} has no coordinates`)
  }
  
  // Validation rules
  if (lines.length === 0) {
    errors.push('File is empty')
  }
  
  if (!hasAC) {
    errors.push('No airspace definitions found (AC entries missing)')
  }
  
  if (airspaceCount === 0) {
    errors.push('No valid airspace entries found')
  }
  
  // Check for basic OpenAir format markers
  const hasOpenAirFormat = lines.some(line => 
    line.startsWith('AC ') || 
    line.startsWith('AN ') || 
    line.startsWith('DP ') || 
    line.startsWith('V X=')
  )
  
  if (!hasOpenAirFormat && lines.length > 0) {
    errors.push('File does not appear to be in OpenAir format')
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    airspaceCount
  }
}

