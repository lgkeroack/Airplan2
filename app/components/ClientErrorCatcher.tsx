'use client'

import { useEffect } from 'react'

export default function ClientErrorCatcher({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Catch unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[Client] Unhandled promise rejection:', event.reason)
      event.preventDefault()
    }
    
    // Catch uncaught errors
    const handleError = (event: ErrorEvent) => {
      console.error('[Client] Uncaught error:', event.error)
      console.error('[Client] Error message:', event.message)
      console.error('[Client] Error filename:', event.filename)
      console.error('[Client] Error lineno:', event.lineno)
      console.error('[Client] Error colno:', event.colno)
      event.preventDefault()
    }
    
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleError)
    
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleError)
    }
  }, [])
  
  return <>{children}</>
}

