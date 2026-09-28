import { defineConfig } from '@playwright/test'

// Electron の E2E。先に `electron-vite build` で out/ を作っておく
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  outputDir: 'test-results',
  reporter: process.env.CI ? [['list'], ['github']] : 'list'
})
