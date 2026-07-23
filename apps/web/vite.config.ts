import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  server: {
    host: 'localhost',
    port: 5556,
    strictPort: true
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Flashcard Platform',
        short_name: 'Flashcard',
        display: 'standalone',
        theme_color: '#F9F4DF',
        background_color: '#F9F4DF',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          offline: ['dexie', 'socket.io-client'],
          scheduling: ['@flashcard/scheduling']
        }
      }
    }
  },
  test: { environment: 'jsdom', exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'] }
});
