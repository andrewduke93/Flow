import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // Use a relative base so built assets work regardless of whether the
      // site is served from the repo root or under `/Flow/` on GitHub Pages.
      // This prevents absolute-path mismatches and CDN/path-prefix issues.
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          // Auto-update: new SW activates immediately without user prompt
          registerType: 'autoUpdate',
          includeAssets: ['favicon.ico', 'icons/*'],
          manifest: {
            name: 'Flow',
            short_name: 'Flow',
            start_url: '/Flow/',
            display: 'standalone',
            background_color: '#ffffff',
            theme_color: '#111827',
            icons: [
              { src: '/Flow/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
              { src: '/Flow/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }
            ]
          },
          workbox: {
            // Delete old caches on activate
            cleanupOutdatedCaches: true,
            // Skip waiting and claim clients immediately
            skipWaiting: true,
            clientsClaim: true,
            // DON'T cache index.html - always fetch fresh to get new bundle references
            navigateFallback: null,
            // Only precache JS/CSS assets, not HTML
            globPatterns: ['**/*.{js,css,png,svg,ico,woff,woff2}'],
            // Runtime caching for navigation requests (network-first)
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/andrewduke93\.github\.io\/Flow\/$/,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'html-cache',
                  expiration: { maxEntries: 1, maxAgeSeconds: 60 }
                }
              },
              {
                urlPattern: /\/Flow\/index\.html$/,
                handler: 'NetworkFirst', 
                options: {
                  cacheName: 'html-cache',
                  expiration: { maxEntries: 1, maxAgeSeconds: 60 }
                }
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
