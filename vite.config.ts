import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri 通过 TAURI_DEV_HOST 把移动端/局域网调试的地址传进来。
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()],
  // Tauri CLI 会自己清屏，Vite 再清一次会把错误信息冲掉。
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      // src-tauri 由 cargo 监听，Vite 不用管，否则会触发无意义的重载。
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // Vite 8 的产物转译与压缩由 oxc 承担（内置），不再需要 esbuild。
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
})
