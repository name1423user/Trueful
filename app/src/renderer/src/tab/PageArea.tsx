import { useEffect, useRef } from 'react'

// ページ（WebContentsView）を置く場所。Renderer はページを描かず、この空の div の位置と大きさを
// Main に報告するだけ（ADR-008）。消えるとき（作成画面を出すときなど）は大きさ 0 を報告して隠す
export function PageArea(): React.JSX.Element {
  const area = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = area.current
    if (!element) return
    const report = (): void => {
      const r = element.getBoundingClientRect()
      void window.trueful.view.setBounds({
        x: Math.max(0, Math.round(r.left)),
        y: Math.max(0, Math.round(r.top)),
        width: Math.max(0, Math.round(r.width)),
        height: Math.max(0, Math.round(r.height))
      })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
      void window.trueful.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
  }, [])

  return <div ref={area} className="page-area" data-testid="page-area" />
}
