import { useEffect, useRef } from 'react'

/**
 * Revalidates server-backed screens after another signed-in user may have changed them.
 * It refreshes on window focus, when a hidden tab becomes visible, and at a low-frequency
 * interval while visible. Overlapping requests are intentionally collapsed.
 */
export function useAutoRefresh(refresh: () => Promise<void>, intervalMs = 30_000): void {
  const refreshRef = useRef(refresh)
  const runningRef = useRef(false)
  const lastRunRef = useRef(0)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    const run = async () => {
      if (runningRef.current || document.visibilityState === 'hidden') return
      const now = Date.now()
      if (now - lastRunRef.current < 1_000) return
      lastRunRef.current = now
      runningRef.current = true
      try {
        await refreshRef.current()
      } finally {
        runningRef.current = false
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void run()
    }

    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVisibilityChange)
    const timer = window.setInterval(() => void run(), intervalMs)

    return () => {
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.clearInterval(timer)
    }
  }, [intervalMs])
}
