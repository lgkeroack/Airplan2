'use client'

interface ParsingProgressProps {
  progress: number // 0-100
  status: string
  currentFile?: string
  itemsParsed?: number
}

export default function ParsingProgress({
  progress,
  status,
  currentFile,
  itemsParsed,
}: ParsingProgressProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(17, 24, 39, 0.9)',
      fontFamily: "'Times New Roman', Times, serif"
    }}>
      <div style={{
        maxWidth: '28rem',
        width: '100%',
        margin: '0 1rem',
        backgroundColor: '#1f2937',
        border: '2px solid #374151',
        borderRadius: '8px',
        padding: '32px',
        boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.3)'
      }}>
        <h2 style={{
          fontSize: '20px',
          fontWeight: 'bold',
          color: 'white',
          marginBottom: '16px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          Loading Airspace Data
        </h2>
        
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '14px', color: '#d1d5db', textTransform: 'uppercase' }}>{status}</span>
            <span style={{ fontSize: '14px', color: '#d1d5db' }}>{Math.round(progress)}%</span>
          </div>
          
          <div style={{
            width: '100%',
            height: '8px',
            backgroundColor: '#374151',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              backgroundColor: '#3b82f6',
              transition: 'width 0.3s ease'
            }} />
          </div>
          
          {currentFile && (
            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>
              Processing: {currentFile}
            </p>
          )}
          
          {itemsParsed !== undefined && (
            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
              Airspace entries parsed: {itemsParsed.toLocaleString()}
            </p>
          )}
        </div>
        
        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '16px' }}>
          This may take a minute or two depending on file size...
        </div>
      </div>
    </div>
  )
}

