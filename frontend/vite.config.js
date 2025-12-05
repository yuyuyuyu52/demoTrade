import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/accounts': 'http://localhost:8000',
      '/market': 'http://localhost:8000',
      '/orders': 'http://localhost:8000',
      '/positions': 'http://localhost:8000',
    }
  }
})
