import { useEffect, useState } from 'react'

const DEFAULT_SPEED_MS = 20

type UseTypewriterOptions = {
  enabled?: boolean
  speedMs?: number
}

/** Reveals `text` a character at a time. `enabled: false` (e.g. for a message that
 * shouldn't animate) returns the full text immediately instead of running a timer.
 */
export function useTypewriter(
  text: string,
  { enabled = true, speedMs = DEFAULT_SPEED_MS }: UseTypewriterOptions = {},
): string {
  const [visibleLength, setVisibleLength] = useState(enabled ? 0 : text.length)

  useEffect(() => {
    if (!enabled || text.length === 0) {
      setVisibleLength(text.length)
      return undefined
    }

    setVisibleLength(0)
    let currentLength = 0
    const intervalId = setInterval(() => {
      currentLength += 1
      setVisibleLength(currentLength)
      if (currentLength >= text.length) {
        clearInterval(intervalId)
      }
    }, speedMs)

    return () => clearInterval(intervalId)
  }, [text, enabled, speedMs])

  return enabled ? text.slice(0, visibleLength) : text
}
