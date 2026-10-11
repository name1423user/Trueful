// 書体は同梱する（ADR-009）。使う太さ（400・bold）だけを読み込む。等幅は URL の欄だけなので 400 だけ
import '@fontsource/ibm-plex-sans-jp/400.css'
import '@fontsource/ibm-plex-sans-jp/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import './assets/main.css'
import './i18n'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
