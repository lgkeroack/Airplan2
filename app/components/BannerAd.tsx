'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// Phase 1: hosting message (5s) → Phase 2: ad (20s) → Phase 3: thank you (5s) → collapse
const PHASE_DURATIONS = { message: 5, ad: 20, thanks: 5 } as const
const TOTAL_DURATION = PHASE_DURATIONS.message + PHASE_DURATIONS.ad + PHASE_DURATIONS.thanks

type Phase = 'message' | 'ad' | 'thanks' | 'collapsed' | 'hidden'

export default function BannerAd() {
  const [phase, setPhase] = useState<Phase>('message')
  const [elapsed, setElapsed] = useState(0)
  const [adFailed, setAdFailed] = useState(false)
  const adPushed = useRef(false)
  const adInsRef = useRef<HTMLModElement>(null)
  const startTime = useRef(Date.now())

  // Push the AdSense ad once during ad phase, then check if it loaded
  useEffect(() => {
    if (phase !== 'ad' || adPushed.current) return
    adPushed.current = true
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({})
    } catch {
      setAdFailed(true)
      return
    }

    // Check after 2s if the ad actually rendered
    const check = setTimeout(() => {
      const el = adInsRef.current
      if (!el || el.childElementCount === 0 || el.getAttribute('data-ad-status') === 'unfilled') {
        setAdFailed(true)
      }
    }, 2000)
    return () => clearTimeout(check)
  }, [phase])

  // Single timer driving everything
  useEffect(() => {
    if (phase === 'collapsed' || phase === 'hidden') return

    const interval = setInterval(() => {
      const now = (Date.now() - startTime.current) / 1000
      setElapsed(now)

      if (now < PHASE_DURATIONS.message) {
        setPhase('message')
      } else if (now < PHASE_DURATIONS.message + PHASE_DURATIONS.ad) {
        setPhase('ad')
      } else if (now < TOTAL_DURATION) {
        setPhase('thanks')
      } else {
        clearInterval(interval)
        setPhase('collapsed')
        setTimeout(() => setPhase('hidden'), 400)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [phase])

  const handleDismiss = useCallback(() => {
    setPhase('collapsed')
    setTimeout(() => setPhase('hidden'), 400)
  }, [])

  if (phase === 'hidden') return null

  const isCollapsed = phase === 'collapsed'
  const progress = Math.min(elapsed / TOTAL_DURATION, 1)

  return (
    <>
      <style>{`
        :root { --banner-h: 36px; }
        @media (max-width: 768px) { :root { --banner-h: 50px; } }
        @keyframes bannerFadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* Outer shell: fixed dimensions, never changes, clips everything */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 1100,
          width: '100%',
          height: isCollapsed ? 0 : 'var(--banner-h)',
          overflow: 'hidden',
          transition: 'height 0.4s ease-in-out',
          pointerEvents: isCollapsed ? 'none' : 'auto',
        }}
      >
        {/* Inner box: always full banner height, absolutely positioned so
            nothing inside (including AdSense) can push the outer shell */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: 'var(--banner-h)',
            backgroundColor: '#1e293b',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Content area — relative container for absolutely positioned phases */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              overflow: 'hidden',
              minHeight: 0,
            }}
          >
            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              aria-label="Dismiss ad"
              style={{
                position: 'absolute',
                top: 4,
                right: 8,
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: '4px 6px',
                borderRadius: 4,
                zIndex: 2,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#94a3b8')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
            >
              ✕
            </button>

            {/* Phase 1: Hosting message */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: phase === 'message' ? 1 : 0,
                pointerEvents: phase === 'message' ? 'auto' : 'none',
                transition: 'opacity 0.3s ease',
              }}
            >
              <span
                style={{
                  color: '#94a3b8',
                  fontSize: 'clamp(12px, 1.5vh, 16px)',
                  textAlign: 'center',
                  padding: '0 40px',
                }}
              >
                These ads help cover server and render costs
              </span>
            </div>

            {/* Phase 2: Ad (or fallback if blocked/empty) */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                opacity: phase === 'ad' ? 1 : 0,
                pointerEvents: phase === 'ad' ? 'auto' : 'none',
                transition: 'opacity 0.3s ease',
              }}
            >
              {adFailed ? (
                <span
                  style={{
                    color: '#94a3b8',
                    fontSize: 'clamp(12px, 1.5vh, 16px)',
                    textAlign: 'center',
                    padding: '0 40px',
                  }}
                >
                  No ads for now, so enjoy{' '}
                  <a
                    href="https://theuselessweb.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#3b82f6', textDecoration: 'underline' }}
                  >
                    this
                  </a>
                </span>
              ) : (
                <ins
                  ref={adInsRef}
                  className="adsbygoogle"
                  style={{
                    display: 'block',
                    width: 728,
                    maxWidth: '100%',
                    height: '100%',
                  }}
                  data-ad-client="ca-pub-2383569184641114"
                  data-ad-slot="2996128451"
                  data-ad-format="horizontal"
                  data-full-width-responsive="false"
                />
              )}
            </div>

            {/* Phase 3: Thank you */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: phase === 'thanks' ? 1 : 0,
                pointerEvents: phase === 'thanks' ? 'auto' : 'none',
                transition: 'opacity 0.3s ease',
              }}
            >
              <span
                style={{
                  color: '#a7f3d0',
                  fontSize: 'clamp(13px, 1.5vh, 16px)',
                  fontWeight: 500,
                  letterSpacing: 0.3,
                  textAlign: 'center',
                  padding: '0 40px',
                }}
              >
                Thank you and happy flying!
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div
            style={{
              height: 3,
              width: '100%',
              backgroundColor: '#334155',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress * 100}%`,
                backgroundColor: phase === 'thanks' ? '#34d399' : '#3b82f6',
                transition: 'background-color 0.4s ease',
              }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
