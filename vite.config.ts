import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          postprocessing: ['postprocessing', '@react-three/postprocessing'],
          motion: ['framer-motion', 'gsap']
        }
      }
    },
    chunkSizeWarningLimit: 1400
  },
  server: {
    port: 5173
  }
});
