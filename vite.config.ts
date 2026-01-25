import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: mode === 'production' ? '/Flow/' : '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'prompt',
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
            cleanupOutdatedCaches: true,
            navigateFallback: '/Flow/index.html'
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
