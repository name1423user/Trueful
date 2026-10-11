import { defineConfig } from 'vitest/config'

// 単体・IPC のテスト。E2E（e2e/）は Playwright で動かす
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // CI の Windows は、ファイルの操作が数秒止まることがある（一時フォルダの検査など）。既定の 5 秒では足りない
    testTimeout: 15_000,
    hookTimeout: 15_000
  }
})
