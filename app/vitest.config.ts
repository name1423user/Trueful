import { defineConfig } from 'vitest/config'

// 単体・IPC のテスト。E2E（e2e/）は Playwright で動かす
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
