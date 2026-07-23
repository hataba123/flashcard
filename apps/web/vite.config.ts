import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
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
        icons: []
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ],
  test: { environment: 'jsdom', exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'] }
});
