/**
 * @file vite.config.ts
 * @description Vite configuration for "The Library of Worlds".
 * Configures the frontend dev server, proxies `/api` requests to the local Express backend
 * so the browser never interacts with the Gemini API key directly, and includes a path
 * resolver plugin so Vite handles workspace paths containing `#` (`# Competitions`) seamlessly.
 *
 * Use cases:
 * 1. Local development (`npm run dev`): proxies `/api/*` to `http://localhost:3001`.
 * 2. Production build (`npm run build`): bundles the Three.js + TypeScript client into `dist/`.
 */

import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'hash-path-resolver',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source.startsWith('/src/')) {
          return path.resolve(process.cwd(), source.slice(1));
        }
        if (source.startsWith('./') || source.startsWith('../')) {
          if (importer && !importer.includes('node_modules')) {
            const cleanImporter = importer.split('?')[0];
            const resolved = path.resolve(path.dirname(cleanImporter), source);
            if (!path.extname(resolved)) {
              return `${resolved}.ts`;
            }
            return resolved;
          }
        }
        return null;
      },
    },
  ],
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
