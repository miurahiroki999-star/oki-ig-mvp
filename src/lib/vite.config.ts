import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // netlify dev がローカルで functions を 8888 番で提供する想定
      '/.netlify/functions': 'http://localhost:8888'
    }
  }
})
