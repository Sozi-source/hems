HEMS PWA ICON ASSETS

Files:
- icon-192.png: standard PWA icon (192x192)
- icon-512.png: standard PWA icon (512x512)
- icon-maskable-192.png: maskable PWA icon (192x192)
- icon-maskable-512.png: maskable PWA icon (512x512)
- apple-touch-icon.png: iOS home-screen icon (180x180)
- favicon-32.png / favicon-16.png: browser favicons
- hems-icon-concept-sheet.png: visual concept sheet

Suggested manifest.webmanifest entries:
{
  "name": "HEMS",
  "short_name": "HEMS",
  "icons": [
    {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
    {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
    {"src": "/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable"},
    {"src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
  ]
}

Copy the PNGs to your app's public/ directory (or equivalent static asset directory).
The maskable files include an inset background and keep the artwork within a central safe area.
