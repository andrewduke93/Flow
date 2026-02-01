import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isDev = mode === 'development';
    
    return {
      base: '/Flow/',
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: isDev ? {
          clientPort: 443,
          protocol: 'wss',
        } : false,
      },
      build: {
        outDir: 'dist',
        sourcemap: false,
        // Enable minification and tree-shaking
        minify: 'esbuild',
        target: 'es2020',
        // Code-splitting for better caching and faster loads
        rollupOptions: {
          output: {
            manualChunks: {
              // Core React vendor chunk (rarely changes)
              'vendor-react': ['react', 'react-dom'],
              // RSVP feature chunk (loaded on demand)
              'rsvp': [
                './services/rsvpConductor',
                './services/rsvpHeartbeat', 
                './services/rsvpProcessor',
                './services/rsvpGrammarEngine',
                './services/rsvpHaptics'
              ],
              // Cloud/sync feature chunk
              'cloud': [
                './services/cloudService',
                './services/googleDriveService',
                './services/syncManager'
              ],
              // Animation library (only if needed)
              'animations': ['framer-motion'],
              // Icons library
              'icons': ['lucide-react']
            },
            // Better chunk naming for caching
            chunkFileNames: 'assets/[name]-[hash].js',
            entryFileNames: 'assets/[name]-[hash].js',
            assetFileNames: 'assets/[name]-[hash].[ext]'
          }
        },
        // Report compressed size
        reportCompressedSize: true,
        // Chunk size warning threshold (500kb)
        chunkSizeWarningLimit: 500
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.'),
        }
      },
      // Optimize dependencies
      optimizeDeps: {
        include: ['react', 'react-dom', 'jszip'],
        exclude: ['framer-motion'] // Tree-shake unused parts
      }
    };
});
