import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BusinessProvider } from '@/context/business-context';

export const metadata: Metadata = {
  title: 'HEMS — Multi-Tenant Enterprise Ledger',
  description: 'Enterprise Financial & Debt Management System for Haron Fashion & Zenith Plast',
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
  themeColor: '#080B11',
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
