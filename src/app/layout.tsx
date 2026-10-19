import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BusinessProvider } from '@/context/business-context';

export const metadata: Metadata = {
  title: 'HEMS — Multi-Tenant Enterprise Ledger',
  description: 'Enterprise Financial & Debt Management System for Haron Fashion & Zenith Plast',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/assets/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/assets/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/assets/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: ['/assets/icons/favicon-32.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'HEMS',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#102719',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-canvas-dark text-slate-100 antialiased selection:bg-[#881337] selection:text-white">
        <BusinessProvider>
          {children}
        </BusinessProvider>
      </body>
    </html>
  );
}
