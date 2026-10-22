import { useEffect, useState } from 'react'

/**
 * `active`: the screen is being kept awake. The others say why not, so the page can tell the
 * person what to change instead of failing silently.
 */
export type WakeLockState = 'active' | 'unsupported' | 'insecure' | 'failed'

function staticState(): WakeLockState | null {
  // The API does not exist outside a secure context, so check that first to give the right hint.
  if (!window.isSecureContext) return 'insecure'
  if (!('wakeLock' in navigator)) return 'unsupported'
  return null
}

/** Asks the browser to keep the screen on while the component is mounted. */
export function useWakeLock(): WakeLockState {
  const [state, setState] = useState<WakeLockState>(() => staticState() ?? 'active')

  useEffect(() => {
    if (staticState() !== null) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void next.release()
          return
        }
        sentinel = next
        setState('active')
      } catch {
        // For example a low battery or a power saving mode.
        if (!cancelled) setState('failed')
      }
    }
    // The browser drops the lock whenever the page is hidden, so take it again when it returns.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) {
        void acquire()
      }
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release()
    }
  }, [])

  return state
}
