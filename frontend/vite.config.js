import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // FastAPI backend (to be built) will run on :8000
    proxy: { '/api': 'http://localhost:8000' },
  },
})
