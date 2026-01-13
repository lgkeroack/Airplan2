'use client'

import { useEffect } from 'react'

export default function PageDebugger() {
  useEffect(() => {
    console.log('[Client] PageDebugger: Component mounted')
    console.log('[Client] Window loaded')
    console.log('[Client] Document body:', document.body)
    console.log('[Client] Main element:', document.querySelector('main'))
    console.log('[Client] Root element:', document.getElementById('__next'))
    
    // Check for errors
    const checkForErrors = () => {
      const errorElements = document.querySelectorAll('[data-error]')
      if (errorElements.length > 0) {
        console.error('[Client] Found error elements:', errorElements)
      }
    }
    
    checkForErrors()
    setTimeout(checkForErrors, 1000)
  }, [])
  
  return null
}

