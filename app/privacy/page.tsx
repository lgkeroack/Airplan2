import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — Airplan',
  description:
    'Privacy policy for Airplan, the interactive airspace visualization tool. Learn how we handle your data, cookies, and third-party services.',
}

export default function PrivacyPage() {
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
            style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14 }}
          >
            About
          </Link>
          <Link
            href="/privacy"
            style={{ color: '#f1f5f9', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}
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
          Privacy Policy
        </h1>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>
          Last updated: February 2026
        </p>

        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            marginTop: 36,
            marginBottom: 12,
            color: '#f8fafc',
          }}
        >
          Overview
        </h2>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 16 }}>
          Airplan is a free, open-source airspace visualization tool. We are
          committed to protecting your privacy. This policy explains what data
          we collect, how we use it, and your rights.
        </p>

        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            marginTop: 36,
            marginBottom: 12,
            color: '#f8fafc',
          }}
        >
          Data We Collect
        </h2>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 12 }}>
          <strong style={{ color: '#f1f5f9' }}>No account required.</strong>{' '}
          Airplan does not require you to sign up or log in. We do not collect
          personal information such as your name, email, or phone number.
        </p>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 12 }}>
          <strong style={{ color: '#f1f5f9' }}>Usage analytics:</strong> We use
          Vercel Analytics to collect anonymous, aggregated usage data (page
          views, browser type, country) to help us understand how the tool is
          used and improve it. This data is not linked to individual users.
        </p>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 16 }}>
          <strong style={{ color: '#f1f5f9' }}>Local storage:</strong> Airplan
          may store small pieces of non-personal data in your browser&apos;s local
          storage (such as whether you have completed the walkthrough). This
          data never leaves your device.
        </p>

        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            marginTop: 36,
            marginBottom: 12,
            color: '#f8fafc',
          }}
        >
          Cookies &amp; Third-Party Services
        </h2>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 12 }}>
          <strong style={{ color: '#f1f5f9' }}>Google AdSense:</strong> Airplan
          uses Google AdSense to display advertisements. Google may use cookies
          to serve ads based on your prior visits to this site or other
          websites. You can opt out of personalized advertising by visiting{' '}
          <a
            href="https://www.google.com/settings/ads"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3b82f6', textDecoration: 'underline' }}
          >
            Google&apos;s Ads Settings
          </a>
          .
        </p>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 12 }}>
          <strong style={{ color: '#f1f5f9' }}>Mapbox:</strong> The interactive
          map is powered by Mapbox. Mapbox may collect anonymized usage data
          as described in their{' '}
          <a
            href="https://www.mapbox.com/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3b82f6', textDecoration: 'underline' }}
          >
            privacy policy
          </a>
          .
        </p>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 16 }}>
          <strong style={{ color: '#f1f5f9' }}>Vercel:</strong> Airplan is hosted
          on Vercel. Vercel may log standard server access information (IP
          addresses, request timestamps) as described in their{' '}
          <a
            href="https://vercel.com/legal/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3b82f6', textDecoration: 'underline' }}
          >
            privacy policy
          </a>
          .
        </p>

        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            marginTop: 36,
            marginBottom: 12,
            color: '#f8fafc',
          }}
        >
          Your Rights
        </h2>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 16 }}>
          Since we do not collect personal data, there is generally nothing to
          delete or export. You can clear your browser&apos;s local storage at any
          time to remove any Airplan preferences. You may also use your
          browser&apos;s built-in controls to block cookies from third-party ad
          services.
        </p>

        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            marginTop: 36,
            marginBottom: 12,
            color: '#f8fafc',
          }}
        >
          Changes to This Policy
        </h2>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 16 }}>
          We may update this privacy policy from time to time. Changes will be
          reflected on this page with an updated revision date.
        </p>

        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            marginTop: 36,
            marginBottom: 12,
            color: '#f8fafc',
          }}
        >
          Contact
        </h2>
        <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 16 }}>
          If you have questions about this privacy policy, please open an issue
          on the Airplan GitHub repository.
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
          <Link href="/about" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
            About
          </Link>
        </div>
      </article>
    </div>
  )
}
