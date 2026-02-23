import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About Airplan — Airspace Visualization for Pilots',
  description:
    'Learn about Airplan, a free interactive tool that helps pilots visualize airspace classifications, plan routes, and understand the national airspace system on a topographic map.',
}

export default function AboutPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#111827',
        color: '#f1f5f9',
        fontFamily: "'Futura', 'Trebuchet MS', Arial, sans-serif",
      }}
    >
      {/* Navigation */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: '#3b82f6',
            textDecoration: 'none',
          }}
        >
          Airplan
        </Link>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link
            href="/"
            style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14 }}
          >
            Map
          </Link>
          <Link
            href="/about"
            style={{ color: '#f1f5f9', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}
          >
            About
          </Link>
          <Link
            href="/privacy"
            style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14 }}
          >
            Privacy
          </Link>
        </div>
      </nav>

      {/* Content */}
      <article
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '48px 24px 80px',
          lineHeight: 1.7,
        }}
      >
        <h1
          style={{
            fontSize: 36,
            fontWeight: 700,
            marginBottom: 24,
            color: '#f8fafc',
          }}
        >
          About Airplan
        </h1>

        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 24 }}>
          Airplan is a free, interactive airspace visualization tool designed for
          pilots, student pilots, flight instructors, and aviation enthusiasts.
          It renders FAA airspace data on a topographic map so you can explore
          the vertical structure of the national airspace system at any point in
          the continental United States.
        </p>

        <h2
          style={{
            fontSize: 24,
            fontWeight: 600,
            marginTop: 40,
            marginBottom: 16,
            color: '#f8fafc',
          }}
        >
          Why Airplan Exists
        </h2>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 16 }}>
          Understanding airspace is one of the most challenging parts of flight
          training. Sectional charts encode airspace boundaries with symbols
          and colors, but they can be difficult to interpret — especially when
          multiple layers overlap. Airplan solves this by turning those flat
          symbols into an interactive, three-dimensional air-column view that
          shows exactly what airspace exists above any point.
        </p>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 24 }}>
          Instead of cross-referencing chart supplements and memorizing magenta
          vs. blue dashed lines, you can simply click on the map and see every
          airspace layer from the surface up to FL600.
        </p>

        <h2
          style={{
            fontSize: 24,
            fontWeight: 600,
            marginTop: 40,
            marginBottom: 16,
            color: '#f8fafc',
          }}
        >
          Key Features
        </h2>
        <ul
          style={{
            fontSize: 16,
            color: '#cbd5e1',
            paddingLeft: 20,
            marginBottom: 24,
          }}
        >
          <li style={{ marginBottom: 10 }}>
            <strong style={{ color: '#f1f5f9' }}>Click-to-query airspace:</strong>{' '}
            Tap any location to retrieve the full vertical air column, including
            Class B, C, D, E surface, E to 14,500, and restricted/prohibited
            areas.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong style={{ color: '#f1f5f9' }}>3D cylinder rendering:</strong>{' '}
            Airspace boundaries are drawn as color-coded cylinders on the map,
            giving you an instant sense of shape, size, and vertical extent.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong style={{ color: '#f1f5f9' }}>Route planning:</strong>{' '}
            Build a point-to-point route and see a terrain elevation profile
            with airspace intersection warnings along the way.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong style={{ color: '#f1f5f9' }}>Topographic base map:</strong>{' '}
            The underlying map shows terrain contours and elevation, so you can
            correlate airspace floors with ground level.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong style={{ color: '#f1f5f9' }}>Thermal data overlay:</strong>{' '}
            Glider pilots can view estimated thermal conditions based on
            terrain and atmospheric data.
          </li>
        </ul>

        <h2
          style={{
            fontSize: 24,
            fontWeight: 600,
            marginTop: 40,
            marginBottom: 16,
            color: '#f8fafc',
          }}
        >
          How It Works
        </h2>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 16 }}>
          Airplan parses official FAA airspace definition files (sourced from
          publicly available government data) and converts them into geographic
          polygons. When you click on the map, the application performs a
          point-in-polygon query against every airspace boundary to determine
          which layers exist above that location.
        </p>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 24 }}>
          The results are displayed as a side-panel air column — a vertical bar
          chart where each colored segment represents an airspace class, labeled
          with its floor and ceiling altitudes. Click any segment to highlight
          its boundary on the map.
        </p>

        <h2
          style={{
            fontSize: 24,
            fontWeight: 600,
            marginTop: 40,
            marginBottom: 16,
            color: '#f8fafc',
          }}
        >
          Who Is Airplan For?
        </h2>
        <ul
          style={{
            fontSize: 16,
            color: '#cbd5e1',
            paddingLeft: 20,
            marginBottom: 24,
          }}
        >
          <li style={{ marginBottom: 10 }}>
            <strong style={{ color: '#f1f5f9' }}>Student pilots</strong> learning
            airspace classifications during ground school.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong style={{ color: '#f1f5f9' }}>VFR pilots</strong> planning
            cross-country flights and wanting to visualize airspace along a
            route.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong style={{ color: '#f1f5f9' }}>Instrument pilots</strong>{' '}
            reviewing approach corridors and transition areas.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong style={{ color: '#f1f5f9' }}>Drone operators</strong>{' '}
            checking controlled airspace and restricted zones before flights.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong style={{ color: '#f1f5f9' }}>Flight instructors</strong>{' '}
            using the tool as a teaching aid to explain airspace structure
            visually.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong style={{ color: '#f1f5f9' }}>Glider pilots</strong>{' '}
            planning soaring flights with thermal data overlays and terrain
            awareness.
          </li>
        </ul>

        <h2
          style={{
            fontSize: 24,
            fontWeight: 600,
            marginTop: 40,
            marginBottom: 16,
            color: '#f8fafc',
          }}
        >
          Data Sources &amp; Accuracy
        </h2>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 16 }}>
          Airspace boundaries are derived from publicly available FAA data. While
          every effort is made to keep the data current, Airplan is provided for
          educational and planning purposes only. Always cross-reference with
          current sectional charts, NOTAMs, and official FAA resources before
          flying. Airplan is not a substitute for official flight planning tools.
        </p>

        <h2
          style={{
            fontSize: 24,
            fontWeight: 600,
            marginTop: 40,
            marginBottom: 16,
            color: '#f8fafc',
          }}
        >
          Open Source
        </h2>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 24 }}>
          Airplan is an open-source project. Contributions, bug reports, and
          feature requests are welcome on GitHub. The codebase is built with
          Next.js, Leaflet, and Three.js for 3D rendering.
        </p>

        <div
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: '1px solid #1e293b',
            fontSize: 13,
            color: '#64748b',
            textAlign: 'center',
          }}
        >
          <Link href="/" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
            Open the map
          </Link>
          {' | '}
          <Link href="/privacy" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
            Privacy Policy
          </Link>
        </div>
      </article>
    </div>
  )
}
