import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isDev = mode === 'development';
    
    return {
      base: '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: {
          // Disable HMR websocket in Codespaces (causes connection errors)
          // Hot reload still works via polling
          clientPort: 443,
          protocol: 'wss',
        },
      },
      build: {
        outDir: 'dist',
        sourcemap: false,
        rollupOptions: {
          output: {
            // split the large reader UI into a separate chunk to improve TTI
            manualChunks: {
              reader: [
                'components/TitanReaderView.tsx',
                'components/ReaderContainer.tsx',
                'components/TitanShelfView.tsx'
              ]
            }
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          // Fix: __dirname is not available in ES modules. Use import.meta.url to derive the path.
          '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.'),
        }
      }
    };
});
