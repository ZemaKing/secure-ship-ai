import { useEffect, useRef, useState } from 'react'
import type { EscalationPayload } from '../../api/generated/secure-ship'
import './EscalationBanner.scss'

const REVEAL_INTERVAL_MS = 700
// Index into `escalation.lines` where Melany's arrival is announced. Stable because the
// backend always builds this array from ESCALATION_SCRIPT_LINES in a fixed order (see
// backend/routes/chat.py's `_handle_escalation`), with the personalized greeting always last.
const HUMAN_JOINED_LINE_INDEX = 1

type EscalationBannerProps = {
  escalation: EscalationPayload
  onHumanJoined?: () => void
}

function EscalationBanner({ escalation, onHumanJoined }: EscalationBannerProps) {
  const [visibleCount, setVisibleCount] = useState(1)
  const humanJoinedFiredRef = useRef(false)

  useEffect(() => {
    if (visibleCount >= escalation.lines.length) return
    const timer = setTimeout(() => setVisibleCount((count) => count + 1), REVEAL_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [visibleCount, escalation.lines.length])

  useEffect(() => {
    if (!humanJoinedFiredRef.current && visibleCount - 1 >= HUMAN_JOINED_LINE_INDEX) {
      humanJoinedFiredRef.current = true
      onHumanJoined?.()
    }
  }, [visibleCount, onHumanJoined])

  return (
    <div className="escalation-banner">
      <img className="escalation-banner__icon" src="/icons/chat-bot.svg" alt="" />
      <div className="escalation-banner__lines">
        {escalation.lines.slice(0, visibleCount).map((line, index) => (
          <p key={index} className="escalation-banner__line">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

export default EscalationBanner
