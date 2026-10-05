import { useTranslation } from 'react-i18next'
import type { PermissionAnswer, PermissionPrompt } from './usePermissionPrompts'

// 権限の確認（F16、T3-7b）。アドレスバーの下（ページの領域の上端）に細い帯として出す。
// ページ（WebContentsView）は UI の上に重なるので、帯の分だけページの領域を下げて、隠れないようにする。
// 「今は決めない」は拒否するが、記憶しない（次に求められたら、また確認する）
export function PermissionBar(props: {
  prompt: PermissionPrompt
  onAnswer: (id: number, answer: PermissionAnswer) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { id, origin, permission } = props.prompt
  return (
    <section className="permission-bar" aria-label={t('permission.barLabel')}>
      {/* 出たことを読み上げる（ボタンは読み上げの領域の外） */}
      <p role="status">
        {t('permission.ask', { origin, permission: t(`permission.name.${permission}`) })}
      </p>
      <div className="permission-actions">
        <button type="button" onClick={() => props.onAnswer(id, 'allow')}>
          {t('permission.allow')}
        </button>
        <button type="button" onClick={() => props.onAnswer(id, 'deny')}>
          {t('permission.deny')}
        </button>
        <button type="button" onClick={() => props.onAnswer(id, 'dismissed')}>
          {t('permission.later')}
        </button>
      </div>
    </section>
  )
}
