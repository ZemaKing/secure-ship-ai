import { useState } from 'react'
import type { ChatResponse, EscalationPayload } from '../api/generated/secure-ship'

export function useChatSession() {
  const [sessionId, setSessionId] = useState<string>()
  const [state, setState] = useState<string>()
  const [event, setEvent] = useState<string | null>(null)
  const [escalation, setEscalation] = useState<EscalationPayload | null>(null)

  function applyResponse(response: ChatResponse) {
    setSessionId(response.session_id)
    setState(response.state)
    setEvent(response.event ?? null)
    setEscalation(response.escalation ?? null)
  }

  return { sessionId, state, event, escalation, applyResponse }
}
