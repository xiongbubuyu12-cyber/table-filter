import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' 便于 GitHub Pages / 任意子路径静态托管
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, port: 5021, strictPort: true },
  preview: { port: 5021, strictPort: true },
})
