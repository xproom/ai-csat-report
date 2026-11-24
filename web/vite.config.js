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
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // 자주 바뀌지 않는 라이브러리는 따로 묶어, 새 버전을 배포해도 다시 받지 않게 함
        manualChunks(id) {
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (/node_modules[\\/]@supabase[\\/]/.test(id)) return 'supabase'
          // 그래프 도구는 서로 물려 있어 한 묶음으로 (공용 도우미는 react 묶음에 두어 첫 화면이 그래프를 받지 않게 함)
          if (id.includes('node_modules/recharts/')) return 'charts'
          if (/commonjsHelpers|preload-helper/.test(id)) return 'react'
          return undefined
        }
      }
    }
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } }
})
