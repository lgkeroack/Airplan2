import type { Metadata } from 'next'
import React from 'react'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Airplan — Interactive Airspace Visualization for Pilots',
    template: '%s — Airplan',
  },
  description:
    'Airplan is a free interactive airspace visualization tool for pilots. Explore FAA airspace classes on a topographic map, view 3D air columns, plan routes with terrain profiles, and understand controlled airspace.',
  keywords: [
    'airspace visualization',
    'pilot tools',
    'FAA airspace',
    'VFR planning',
    'airspace map',
    'Class B airspace',
    'Class C airspace',
    'flight planning',
    'aviation',
    'topographic map',
  ],
  icons: {
    icon: '/airplan-icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head />
      <body style={{ margin: 0, padding: 0, minHeight: '100vh' }}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}

