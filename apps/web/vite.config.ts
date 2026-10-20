import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the SPA runs on :5173 and forwards /api to the API on :3000.
// The API only accepts writes whose Origin equals ORBIT_PUBLIC_URL, so start it with
// ORBIT_PUBLIC_URL=http://localhost:5173 (see apps/web/README.md).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3000' } },
  build: { outDir: 'dist' },
})
