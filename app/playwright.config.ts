import { defineConfig } from '@playwright/test'

// Electron の E2E。`pnpm test:e2e` は先に `electron-vite build` で out/ を作る
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // Electron は1つずつ動かす。2つ同時だと、ウィンドウの前面・フォーカスの取り合いと負荷で、
  // 表示の遅れ（ready-to-show）やフォーカスの確認が不安定になった（#35・#36 の CI）
  workers: 1,
  outputDir: 'test-results',
  reporter: process.env.CI ? [['list'], ['github']] : 'list'
})
