import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ServiceWorkerRegistrar } from '@/components/service-worker'

export const metadata: Metadata = {
  title: {
    default: 'Lotería Tracatá',
    template: '%s · Lotería Tracatá',
  },
  description:
    'Control de décimos, cajas y Fondo Fiesta de la Lotería de Navidad en varios establecimientos.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Lotería Tracatá',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Lotería',
  },
  icons: {
    icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#b01739',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
