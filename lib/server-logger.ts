// Server-side logger that also stores logs for client access
import { addServerLog } from './server-log-store'

export const serverLogger = {
  log: (message: string, ...args: any[]) => {
    const fullMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message
    addServerLog('info', fullMessage)
  },
  
  error: (message: string, error?: any) => {
    let fullMessage = message
    if (error) {
      if (error instanceof Error) {
        fullMessage = `${message}: ${error.message}\nStack: ${error.stack}`
      } else {
        fullMessage = `${message}: ${JSON.stringify(error)}`
      }
    }
    addServerLog('error', fullMessage)
  },
  
  warn: (message: string, ...args: any[]) => {
    const fullMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message
    addServerLog('warn', fullMessage)
  },
  
  info: (message: string, ...args: any[]) => {
    const fullMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message
    addServerLog('info', fullMessage)
  }
}

