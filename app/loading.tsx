'use client'

import { useEffect } from 'react'

export default function Loading() {
  useEffect(() => {
    console.log('[Loading] Component mounted')
  }, [])
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw',
      backgroundColor: '#111827',
      fontFamily: "'Times New Roman', Times, serif",
      color: 'white',
      position: 'relative'
    }}>
      <div style={{
        backgroundColor: '#1f2937',
        border: '2px solid #374151',
        borderRadius: '8px',
        padding: '32px',
        minWidth: '400px',
        maxWidth: '500px',
        boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.3)'
      }}>
        <h2 style={{
          fontSize: '20px',
          fontWeight: 'bold',
          marginBottom: '24px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          textAlign: 'center'
        }}>
          Loading Airspace Data
        </h2>
        
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
            fontSize: '14px'
          }}>
            <span style={{ textTransform: 'uppercase' }}>Loading...</span>
          </div>
          
          <div style={{
            width: '100%',
            height: '8px',
            backgroundColor: '#374151',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: '45%',
              height: '100%',
              backgroundColor: '#3b82f6',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
        
        <div style={{
          fontSize: '12px',
          color: '#9ca3af',
          textAlign: 'center',
          marginTop: '16px'
        }}>
          Loading airspace files and parsing data...
          <br />
          This may take a minute or two depending on file size
        </div>
      </div>
    </div>
  )
}

