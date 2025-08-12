import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    // For development: proxy API calls to Hypercorn server
    proxy: {
      '/videos': 'http://localhost:8000',
      '/music': 'http://localhost:8000',
      '/api': 'http://localhost:8000'
    }
  },
  build: {
    outDir: 'dist',
    // Optimize for static serving by Hypercorn
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom']
        }
      }
    }
  }
});
