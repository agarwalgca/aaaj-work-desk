import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Served from the domain root in development and from a repository subpath on
 * GitHub Pages, so the base is a build input rather than a constant. Everything
 * downstream — the router, the manifest, the service worker scope — reads it.
 */
const base = process.env.VITE_BASE ?? '/'

/**
 * GitHub Pages has no server to rewrite unknown paths onto the app, and answers
 * them with 404.html instead. Shipping the shell under that name is what makes a
 * deep link work on a first visit, before the service worker is in place.
 */
function githubPagesSpaFallback() {
  return {
    name: 'gh-pages-spa-fallback',
    closeBundle() {
      const dist = resolve(process.cwd(), 'dist')
      copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'))
    },
  }
}

export default defineConfig({
  base,
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
        // Relative to the manifest, so the app installs correctly whether it sits
        // at the root or under a repository path.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAF8F5',
        theme_color: '#0F1E2E',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: {
        // Off by default: a service worker caching a dev bundle makes every edit
        // a coin toss. Flip it on to work on the worker itself.
        enabled: false,
        type: 'module',
      },
    }),
    githubPagesSpaFallback(),
  ],
  server: { port: 5173 },
})
