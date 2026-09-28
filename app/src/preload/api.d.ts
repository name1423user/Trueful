import type { TruefulApi } from './index'

// Renderer から見える window.trueful の型
declare global {
  interface Window {
    trueful: TruefulApi
  }
}
