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
    <div
      className={isCollapsed ? 'banner-ad-collapsed' : 'banner-ad-open'}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 1100,
        width: '100%',
        overflow: 'hidden',
        backgroundColor: '#1e293b',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Content area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
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
            zIndex: 1,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#94a3b8')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
        >
          ✕
        </button>

        {/* Phase 1: Hosting message */}
        {phase === 'message' && (
          <span
            style={{
              color: '#94a3b8',
              fontSize: 'clamp(12px, 1.5vh, 16px)',
              textAlign: 'center',
              padding: '0 40px',
              animation: 'bannerFadeIn 0.4s ease-out',
            }}
          >
            These ads help cover server and render costs
          </span>
        )}

        {/* Phase 2: Ad (or fallback if blocked/empty) */}
        {phase === 'ad' && (
          adFailed ? (
            <span
              style={{
                color: '#94a3b8',
                fontSize: 'clamp(12px, 1.5vh, 16px)',
                textAlign: 'center',
                padding: '0 40px',
                animation: 'bannerFadeIn 0.4s ease-out',
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                animation: 'bannerFadeIn 0.4s ease-out',
              }}
            >
              <ins
                ref={adInsRef}
                className="adsbygoogle"
                style={{
                  display: 'block',
                  width: 728,
                  maxWidth: '100%',
                  height: 'calc(var(--banner-h) - 3px)',
                  maxHeight: 'calc(var(--banner-h) - 3px)',
                }}
                data-ad-client="ca-pub-2383569184641114"
                data-ad-slot="2996128451"
                data-ad-format="auto"
                data-full-width-responsive="true"
              />
            </div>
          )
        )}

        {/* Phase 3: Thank you */}
        {phase === 'thanks' && (
          <span
            style={{
              color: '#a7f3d0',
              fontSize: 'clamp(13px, 1.5vh, 16px)',
              fontWeight: 500,
              letterSpacing: 0.3,
              textAlign: 'center',
              padding: '0 40px',
              animation: 'bannerFadeIn 0.4s ease-out',
            }}
          >
            Thank you and happy flying!
          </span>
        )}
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

      <style>{`
        :root {
          --banner-h: 36px;
        }
        @media (max-width: 768px) {
          :root {
            --banner-h: 50px;
          }
        }
        .banner-ad-open {
          height: var(--banner-h) !important;
          min-height: var(--banner-h) !important;
          max-height: var(--banner-h) !important;
          transition: height 0.4s ease-in-out, min-height 0.4s ease-in-out, max-height 0.4s ease-in-out;
        }
        .banner-ad-collapsed {
          height: 0px !important;
          min-height: 0px !important;
          max-height: 0px !important;
          transition: height 0.4s ease-in-out, min-height 0.4s ease-in-out, max-height 0.4s ease-in-out;
        }
        @keyframes bannerFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
