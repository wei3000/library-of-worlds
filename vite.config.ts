/**
 * @file vite.config.ts
 * @description Vite configuration for "The Library of Worlds".
 * Configures the frontend dev server and proxies `/api` requests to the local Express backend
 * so the browser never interacts with the Gemini API key directly.
 *
 * Use cases:
 * 1. Local development (`npm run dev`): proxies `/api/*` to `http://localhost:3001`.
 * 2. Production build (`npm run build`): bundles the Three.js + TypeScript client into `dist/`.
 */

import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
