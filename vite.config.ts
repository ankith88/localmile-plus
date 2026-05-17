import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 5000000
      },
      manifest: {
        name: 'LocalMile.Plus',
        short_name: 'LPOPLUS',
        description: 'LPO Courier Logistics Management',
        theme_color: '#095c7b',
        background_color: '#095c7b',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-icon.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
