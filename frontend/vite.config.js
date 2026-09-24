import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import path from 'path'

// Frappe site the dev server talks to. Override with e.g.
//   FRAPPE_SITE=mysite FRAPPE_PORT=8001 npm run dev
const FRAPPE_SITE = process.env.FRAPPE_SITE || 'smartprint'
const FRAPPE_PORT = process.env.FRAPPE_PORT || 8000

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    // Forward API calls to the bench web server during `npm run dev`.
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${FRAPPE_PORT}`,
        // Tells Frappe which site to serve, whatever host the page runs on.
        headers: { 'X-Frappe-Site-Name': FRAPPE_SITE },
      },
    },
  },
})
