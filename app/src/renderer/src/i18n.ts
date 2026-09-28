import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import ja from './locales/ja.json'

// UI の文字列は辞書（locales/*.json）から出す（ADR-009、CLAUDE.md）。
// MVP は日本語だけ。英語と OS の言語の検出は、MVP の後で足す
void i18next.use(initReactI18next).init({
  lng: 'ja',
  fallbackLng: 'ja',
  resources: { ja: { translation: ja } },
  interpolation: { escapeValue: false } // React が値をエスケープする
})

export default i18next
