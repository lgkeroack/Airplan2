import type { Metadata } from 'next'
import React from 'react'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Airplan - Airspace Visualization',
  description: 'Airplan helps pilots visualize airspace data on topographic maps. Explore air columns, plan routes, and understand controlled airspace.',
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
      <body style={{ margin: 0, padding: 0, minHeight: '100vh' }}>
        {children}
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2383569184641114"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <Analytics />
      </body>
    </html>
  )
}

