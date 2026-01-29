import type { Metadata } from 'next'
import React from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Airplan - Airspace Visualization',
  description: 'Airplan helps pilots visualize airspace data on topographic maps. Explore air columns, plan routes, and understand controlled airspace.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, minHeight: '100vh' }}>{children}</body>
    </html>
  )
}

