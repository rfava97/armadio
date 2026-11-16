import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// Base path configurabile: su GitHub Pages il workflow imposta BASE_PATH=/armadio/
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  // il codec WASM di jsquash va servito così com'è, non pre-bundlato
  optimizeDeps: { exclude: ['@jsquash/webp'] },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Armadio',
        short_name: 'Armadio',
        description: 'Il tuo armadio e i tuoi outfit',
        lang: 'it',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F7F5',
        theme_color: '#F7F7F5',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // librerie pesanti caricate solo quando aggiungi un capo: niente precache
        globIgnores: ['**/ort*', '**/transformers*', '**/webp*', '**/dist-*'],
      },
    }),
  ],
})
