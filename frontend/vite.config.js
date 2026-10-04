import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import path from 'path'

// Site the dev server proxies to: FRAPPE_SITE=mysite FRAPPE_PORT=8001 npm run dev
const FRAPPE_SITE = process.env.FRAPPE_SITE || 'smartprint'
const FRAPPE_PORT = process.env.FRAPPE_PORT || 8000

const proxy = {
  target: `http://127.0.0.1:${FRAPPE_PORT}`,
  headers: { 'X-Frappe-Site-Name': FRAPPE_SITE },
}

export default defineConfig(({ command }) => ({
  plugins: [vue()],
  // Built files are served by Frappe from smart_print_format/public/frontend.
  base: command === 'build' ? '/assets/smart_print_format/frontend/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    outDir: '../smart_print_format/public/frontend',
    emptyOutDir: true,
    // www/smart_print.py reads the manifest to find the hashed files.
    manifest: true,
  },
  server: {
    proxy: { '/api': proxy, '/assets': proxy },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
}))
