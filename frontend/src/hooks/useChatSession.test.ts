import { act, renderHook } from '@testing-library/react'
import type { ChatResponse } from '../api/generated/secure-ship'
import { useChatSession } from './useChatSession'

function makeResponse(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    session_id: 'session-1',
    reply: 'hello',
    state: 'anonymous',
    event: null,
    escalation: null,
    ...overrides,
  }
}

describe('useChatSession', () => {
  it('starts with everything unset', () => {
    const { result } = renderHook(() => useChatSession())

    expect(result.current.sessionId).toBeUndefined()
    expect(result.current.state).toBeUndefined()
    expect(result.current.event).toBeNull()
    expect(result.current.escalation).toBeNull()
    expect(result.current.verifiedCustomerName).toBeNull()
  })

  it('applyResponse copies all fields from a real response', () => {
    const { result } = renderHook(() => useChatSession())

    act(() => {
      result.current.applyResponse(
        makeResponse({
          session_id: 'abc-123',
          state: 'collecting_identity',
          event: 'code_sent',
          verified_customer_name: 'Nova Star',
        }),
      )
    })

    expect(result.current.sessionId).toBe('abc-123')
    expect(result.current.state).toBe('collecting_identity')
    expect(result.current.event).toBe('code_sent')
    expect(result.current.escalation).toBeNull()
    expect(result.current.verifiedCustomerName).toBe('Nova Star')
  })

  it('setVerifiedCustomerName lets the verify-code flow set it directly, outside applyResponse', () => {
    const { result } = renderHook(() => useChatSession())

    act(() => {
      result.current.setVerifiedCustomerName('Nova Star')
    })

    expect(result.current.verifiedCustomerName).toBe('Nova Star')
  })

  it('a later response clears out a previous turn\'s escalation once it is no longer current', () => {
    const { result } = renderHook(() => useChatSession())

    act(() => {
      result.current.applyResponse(
        makeResponse({
          event: 'escalated',
          escalation: { lines: ['hi'], agent_name: 'Melany', first_name: null },
        }),
      )
    })
    expect(result.current.escalation).not.toBeNull()

    act(() => {
      result.current.applyResponse(makeResponse({ event: null, escalation: null }))
    })

    expect(result.current.event).toBeNull()
    expect(result.current.escalation).toBeNull()
  })

  it('normalizes a missing event/escalation to null, not undefined', () => {
    const { result } = renderHook(() => useChatSession())

    act(() => {
      // Mimics a real fetch response where the optional fields are simply absent,
      // rather than explicitly null (both are legal per the generated ChatResponse type).
      result.current.applyResponse({ session_id: 'x', reply: 'hi', state: 'anonymous' } as ChatResponse)
    })

    expect(result.current.event).toBeNull()
    expect(result.current.escalation).toBeNull()
    expect(result.current.verifiedCustomerName).toBeNull()
  })
})
