import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest, not generateSW: the caching rules in src/sw.ts are
      // deliberate enough to be worth writing by hand.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
      },
      manifest: {
        name: 'AAAJ Work Desk',
        short_name: 'Work Desk',
        description: 'Work allocation for A A A J & Associates, Chartered Accountants.',
        lang: 'en-IN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAF8F5',
        theme_color: '#0F1E2E',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        // Off by default: a service worker caching a dev bundle makes every edit
        // a coin toss. Flip it on to work on the worker itself.
        enabled: false,
        type: 'module',
      },
    }),
  ],
  server: { port: 5173 },
})
