import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  // preload は sandbox で動くので、electron 以外を require できない。依存は外に出さずに束ねる
  preload: { build: { externalizeDeps: false } },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    // 小さい書体ファイルも data: にせず、別ファイルで出す。CSP（default-src 'self'）は data: の書体を止めるため
    build: { assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined) }
  }
})
