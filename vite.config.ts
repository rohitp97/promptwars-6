/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The strict CSP in index.html (no inline styles or workers) is what production ships. Vite's dev
 * server injects styles and an HMR worker inline, so the policy is dropped for `vite dev` only.
 * Production builds and previews keep it.
 */
const devWithoutCsp: Plugin = {
  name: 'dev-without-csp',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/, ''),
}

export default defineConfig({
  plugins: [react(), devWithoutCsp],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/hooks/**'],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@google/genai')) return 'genai'
          if (id.includes('firebase')) return 'firebase'
          if (id.includes('react')) return 'react-vendor'
          return undefined
        },
      },
    },
  },
})
