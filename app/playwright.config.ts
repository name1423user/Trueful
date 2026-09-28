import { defineConfig } from '@playwright/test'

// Electron の E2E。`pnpm test:e2e` は先に `electron-vite build` で out/ を作る
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  outputDir: 'test-results',
  reporter: process.env.CI ? [['list'], ['github']] : 'list'
})
