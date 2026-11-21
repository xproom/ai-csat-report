import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import process from 'process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * @brief Vite 설정
 * - VITE_BASE: 배포 하위 경로 (GitHub Pages는 /<저장소명>/)
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE || '/',
  build: { outDir: 'dist', emptyOutDir: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } }
})
