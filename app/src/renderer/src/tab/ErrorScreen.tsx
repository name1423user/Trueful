import { useTranslation } from 'react-i18next'
import type { PageState } from './useTabs'

// 読み込みに失敗したときの画面（F16）。ページの実体は Main が隠していて、同じ場所（Web ページ表示領域）に出る。
// 原因と、次の操作（再読み込み・戻る）を書く。証明書のエラーは、先に進む道を作らない
export function ErrorScreen(props: {
  error: NonNullable<PageState['error']>
  canGoBack: boolean
  onReload: () => void
  onBack: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { kind, url, description } = props.error
  return (
    <section className="error-screen" role="alert" aria-labelledby="error-screen-title">
      <h1 id="error-screen-title">{t(`errorPage.${kind}.title`)}</h1>
      <p>{t(`errorPage.${kind}.cause`)}</p>
      <p>{t(`errorPage.${kind}.next`)}</p>
      <p className="error-screen-detail">
        <span>{url}</span>
        <span>{description}</span>
      </p>
      <div className="error-screen-actions">
        <button type="button" onClick={props.onReload}>
          {t('errorPage.reload')}
        </button>
        <button type="button" disabled={!props.canGoBack} onClick={props.onBack}>
          {t('errorPage.back')}
        </button>
      </div>
    </section>
  )
}
