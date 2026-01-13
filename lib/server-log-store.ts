// Shared log storage for server-side logging
// In-memory log storage (in production, use a proper logging service)
const logs: Array<{ timestamp: number; level: string; message: string }> = []
const MAX_LOGS = 1000

// Helper to add log
export function addServerLog(level: string, message: string) {
  const timestamp = Date.now()
  logs.push({ timestamp, level, message })
  
  // Keep only recent logs
  if (logs.length > MAX_LOGS) {
    logs.shift()
  }
  
  // Also log to console
  const logMessage = `[${new Date(timestamp).toISOString()}] [${level}] ${message}`
  if (level === 'error') {
    console.error(logMessage)
  } else if (level === 'warn') {
    console.warn(logMessage)
  } else {
    console.log(logMessage)
  }
}

export function getLogs(since?: number): Array<{ timestamp: number; level: string; message: string }> {
  if (since) {
    return logs.filter(log => log.timestamp > since)
  }
  return logs
}

