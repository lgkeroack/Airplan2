'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

type Phase = 'ad' | 'hosting-message' | 'collapsed' | 'thank-you' | 'hidden'

export default function BannerAd() {
  const [phase, setPhase] = useState<Phase>('ad')
  const [secondsLeft, setSecondsLeft] = useState(30)
  const adPushed = useRef(false)

  // Push the AdSense ad once the script is loaded
  useEffect(() => {
    if (adPushed.current) return
    adPushed.current = true
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({})
    } catch {
      // AdSense script not yet loaded or ad blocked — banner still shows gracefully
    }
  }, [])

  useEffect(() => {
    if (phase === 'hidden') return

    if (phase === 'ad' || phase === 'hosting-message') {
      const interval = setInterval(() => {
        setSecondsLeft((prev) => {
          const next = prev - 1
          if (next <= 0) {
            clearInterval(interval)
          }
          return next
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [phase])

  useEffect(() => {
    if (secondsLeft === 5 && phase === 'ad') {
      setPhase('hosting-message')
    }
    if (secondsLeft <= 0 && phase === 'hosting-message') {
      setPhase('thank-you')
    }
  }, [secondsLeft, phase])

  useEffect(() => {
    if (phase === 'thank-you') {
      const timeout = setTimeout(() => {
        setPhase('collapsed')
        // After collapse animation, fully hide
        setTimeout(() => setPhase('hidden'), 400)
      }, 5000)
      return () => clearTimeout(timeout)
    }
  }, [phase])

  const handleDismiss = useCallback(() => {
    setPhase('collapsed')
    setTimeout(() => setPhase('hidden'), 400)
  }, [])

  if (phase === 'hidden') return null

  const isCollapsed = phase === 'collapsed'
  const showAd = phase === 'ad' || phase === 'hosting-message'
  const showThankYou = phase === 'thank-you'
  const showHostingMessage = phase === 'hosting-message'

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1100,
        width: '100%',
        maxHeight: isCollapsed ? 0 : showThankYou ? 48 : 110,
        overflow: 'hidden',
        transition: 'max-height 0.4s ease-in-out',
        backgroundColor: showThankYou ? '#065f46' : '#1e293b',
        borderBottom: isCollapsed ? 'none' : '1px solid #334155',
        flexShrink: 0,
      }}
    >
      {showAd && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 16px' }}>
          <ins
            className="adsbygoogle"
            style={{
              display: 'inline-block',
              width: 728,
              height: 90,
              maxWidth: '100%',
            }}
            data-ad-client="ca-pub-2383569184641114"
            data-ad-slot=""
            data-ad-format="horizontal"
            data-full-width-responsive="true"
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginTop: 4,
              width: '100%',
            }}
          >
            {showHostingMessage ? (
              <span
                style={{
                  color: '#94a3b8',
                  fontSize: 12,
                  animation: 'fadeIn 0.5s ease-in',
                }}
              >
                Ads like this one help cover hosting and rendering costs
              </span>
            ) : (
              <span style={{ color: '#475569', fontSize: 11 }}>
                Ad · closes in {secondsLeft}s
              </span>
            )}
            <button
              onClick={handleDismiss}
              aria-label="Dismiss ad"
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                padding: '2px 6px',
                borderRadius: 4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#94a3b8')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {showThankYou && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 48,
            color: '#a7f3d0',
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: 0.3,
            animation: 'fadeIn 0.5s ease-in',
          }}
        >
          Thank you and happy flying!
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
