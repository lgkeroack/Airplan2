'use client'

export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100vw',
      backgroundColor: '#111827',
      color: 'white',
      fontFamily: "'Times New Roman', Times, serif",
      padding: '20px',
      overflow: 'auto'
    }}>
      <h1 style={{ fontSize: '72px', marginBottom: '20px', color: '#fbbf24', fontWeight: 'bold' }}>
        404
      </h1>
      <h2 style={{ fontSize: '28px', marginBottom: '20px', color: '#ef4444', fontWeight: 'bold' }}>
        Page Not Found
      </h2>
      <div style={{
        backgroundColor: '#1f2937',
        border: '2px solid #374151',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '700px',
        width: '100%',
        marginBottom: '20px',
        boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.3)'
      }}>
        <h3 style={{ fontSize: '18px', marginBottom: '16px', color: '#fca5a5', fontWeight: 'bold' }}>
          Possible Issues:
        </h3>
        
        <div style={{ marginBottom: '16px' }}>
          <strong style={{ color: '#fbbf24', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
            ❌ Wrong Port
          </strong>
          <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#f1f5f9', margin: 0 }}>
            The server might be running on a different port. Check your terminal for the actual port number.
            Common ports: <code style={{ backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '3px' }}>3000</code>, 
            <code style={{ backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '3px', marginLeft: '4px' }}>3001</code>, 
            <code style={{ backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '3px', marginLeft: '4px' }}>3002</code>
          </p>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <strong style={{ color: '#fbbf24', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
            ❌ Server Not Running
          </strong>
          <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#f1f5f9', margin: 0 }}>
            Make sure the development server is running. Start it with:
          </p>
          <pre style={{
            backgroundColor: '#0f172a',
            padding: '12px',
            borderRadius: '4px',
            fontSize: '12px',
            marginTop: '8px',
            border: '1px solid #1e293b',
            color: '#f1f5f9'
          }}>npm run dev</pre>
        </div>
        
        <div>
          <strong style={{ color: '#fbbf24', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
            ❌ Port Conflict
          </strong>
          <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#f1f5f9', margin: 0 }}>
            Another process might be using port 3000. Check your terminal output to see which port the server is actually using.
          </p>
        </div>
      </div>
      
      <button
        onClick={() => window.location.href = '/'}
        style={{
          padding: '12px 24px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '2px 2px 0px rgba(0, 0, 0, 0.2)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#2563eb'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#3b82f6'
        }}
      >
        Go to Home
      </button>
    </div>
  )
}
