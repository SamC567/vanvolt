/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Local-only by default; run `npm run dev -- --host` to expose on the network deliberately.
  server: {
    port: 5173,
    fs: { deny: ['.env', '.env.*', '*.{pem,crt,key}', '.npmrc', '.claude/**'] },
  },
  preview: { port: 4173 },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          flow: ['@xyflow/react'],
          pdf: ['jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
