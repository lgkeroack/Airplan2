// Client-side logger for extensive logging throughout the app

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

interface LogEntry {
  timestamp: number
  level: LogLevel
  category: string
  message: string
  data?: any
}

class ClientLogger {
  private logs: LogEntry[] = []
  private maxLogs = 1000

  private formatMessage(category: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString()
    const dataStr = data !== undefined ? ` | Data: ${JSON.stringify(data)}` : ''
    return `[${timestamp}] [${category}] ${message}${dataStr}`
  }

  private addLog(level: LogLevel, category: string, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      data
    }

    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    const formattedMessage = this.formatMessage(category, message, data)

    // Output to console with appropriate level
    switch (level) {
      case 'error':
        console.error(formattedMessage)
        break
      case 'warn':
        console.warn(formattedMessage)
        break
      case 'debug':
        console.debug(formattedMessage)
        break
      default:
        console.log(formattedMessage)
    }
  }

  log(category: string, message: string, data?: any) {
    this.addLog('log', category, message, data)
  }

  info(category: string, message: string, data?: any) {
    this.addLog('info', category, message, data)
  }

  warn(category: string, message: string, data?: any) {
    this.addLog('warn', category, message, data)
  }

  error(category: string, message: string, error?: any) {
    const errorData = error instanceof Error 
      ? { message: error.message, stack: error.stack, name: error.name }
      : error
    this.addLog('error', category, message, errorData)
  }

  debug(category: string, message: string, data?: any) {
    this.addLog('debug', category, message, data)
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clearLogs() {
    this.logs = []
  }
}

// Export singleton instance
export const clientLogger = typeof window !== 'undefined' ? new ClientLogger() : {
  log: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  getLogs: () => [],
  clearLogs: () => {}
}
