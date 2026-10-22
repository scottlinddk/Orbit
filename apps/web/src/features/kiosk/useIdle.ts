import { useEffect, useState } from 'react'

const EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const

/** True after `ms` without a pointer or key event. Used to hide the cursor and the controls. */
export function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), ms)
    const wake = () => {
      clearTimeout(timer)
      setIdle(false)
      timer = setTimeout(() => setIdle(true), ms)
    }
    for (const name of EVENTS) window.addEventListener(name, wake, { passive: true })
    return () => {
      clearTimeout(timer)
      for (const name of EVENTS) window.removeEventListener(name, wake)
    }
  }, [ms])

  return idle
}
