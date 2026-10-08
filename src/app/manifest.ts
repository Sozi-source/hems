import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HEMS — Haron Enterprise Management System',
    short_name: 'HEMS',
    description: 'Multi-tenant ERP & Debt Ledger for Haron Fashion and Zenith Plast',
    start_url: '/',
    display: 'standalone',
    background_color: '#080B11',
    theme_color: '#0F1420',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
