import { useEffect, useState } from 'react'

// 今の時刻（ミリ秒）。アーカイブの表示（30 日）を、開きっぱなしでも更新するため、1分ごとに読み直す
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}
