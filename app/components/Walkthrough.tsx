'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'airplan-walkthrough-seen'

interface Step {
  title: string
  body: string
  icon: string
  spotlight?: 'map' | 'sidepanel'
}

const steps: Step[] = [
  {
    title: 'Welcome to Airplan',
    body: 'Airplan helps pilots visualize airspace on topographic maps. Let\u2019s take a quick look at how it works.',
    icon: '\u2708\uFE0F',
  },
  {
    title: 'Click anywhere on the map',
    body: 'Tap or click any point on the map to open a context menu. Choose "Retrieve Airspace Here" to see what airspace exists above that location.',
    icon: '\uD83D\uDCCD',
    spotlight: 'map',
  },
  {
    title: 'Explore the Air Column',
    body: 'The side panel will open showing the vertical air column\u2014each colored bar represents an airspace layer from floor to ceiling. You can click any bar to highlight it on the map.',
    icon: '\uD83D\uDDFC',
    spotlight: 'sidepanel',
  },
  {
    title: 'You\u2019re all set!',
    body: 'Use the Layers tab to switch basemaps and filter airspace classes, or the Search tab to jump to any location. Happy flying!',
    icon: '\uD83D\uDE80',
  },
]

export default function Walkthrough() {
  const [visible, setVisible] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const seen = localStorage.getItem(STORAGE_KEY)
    if (!seen) {
      // Small delay so the map has time to render before we overlay
      const timer = setTimeout(() => setVisible(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [])

  const dismiss = useCallback(() => {
    setVisible(false)
    localStorage.setItem(STORAGE_KEY, 'true')
  }, [])

  const next = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1)
    } else {
      dismiss()
    }
  }, [currentStep, dismiss])

  const prev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1)
    }
  }, [currentStep])

  if (!visible) return null

  const step = steps[currentStep]
  const isLast = currentStep === steps.length - 1
  const isFirst = currentStep === 0

  // Spotlight positions (approximate regions)
  const spotlightStyle: React.CSSProperties | undefined =
    step.spotlight === 'map'
      ? {
          position: 'absolute',
          top: '25%',
          left: '10%',
          width: '50%',
          height: '50%',
          borderRadius: 16,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
        }
      : step.spotlight === 'sidepanel'
        ? {
            position: 'absolute',
            top: '10%',
            right: 0,
            width: 464,
            height: '80%',
            borderRadius: '16px 0 0 16px',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
            pointerEvents: 'none',
          }
        : undefined

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: spotlightStyle ? 'transparent' : 'rgba(0,0,0,0.6)',
      }}
    >
      {/* Spotlight cutout */}
      {spotlightStyle && <div style={spotlightStyle} />}

      {/* Dialog card */}
      <div
        style={{
          position: 'relative',
          zIndex: 10001,
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 12,
          padding: '32px 28px 24px',
          maxWidth: 420,
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          animation: 'walkthroughFadeIn 0.3s ease-out',
        }}
      >
        {/* Step icon */}
        <div
          style={{
            fontSize: 36,
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          {step.icon}
        </div>

        {/* Title */}
        <h2
          style={{
            color: '#f1f5f9',
            fontSize: 20,
            fontWeight: 600,
            textAlign: 'center',
            margin: '0 0 8px',
          }}
        >
          {step.title}
        </h2>

        {/* Body */}
        <p
          style={{
            color: '#94a3b8',
            fontSize: 14,
            lineHeight: 1.6,
            textAlign: 'center',
            margin: '0 0 24px',
          }}
        >
          {step.body}
        </p>

        {/* Progress dots */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 20,
          }}
        >
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: i === currentStep ? '#3b82f6' : '#475569',
                transition: 'background-color 0.2s',
              }}
            />
          ))}
        </div>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            onClick={dismiss}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: 13,
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: 6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#94a3b8')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            Skip
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {!isFirst && (
              <button
                onClick={prev}
                style={{
                  backgroundColor: '#334155',
                  border: 'none',
                  color: '#e2e8f0',
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: '8px 16px',
                  borderRadius: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#475569')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              style={{
                backgroundColor: '#3b82f6',
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                padding: '8px 20px',
                borderRadius: 6,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
            >
              {isLast ? 'Get Started' : 'Next'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes walkthroughFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
