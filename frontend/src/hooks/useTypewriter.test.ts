import { act, renderHook } from '@testing-library/react'
import { useTypewriter } from './useTypewriter'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useTypewriter', () => {
  it('reveals one character per tick until the full text is shown', () => {
    const { result } = renderHook(() => useTypewriter('Hi!', { speedMs: 10 }))

    expect(result.current).toBe('')

    act(() => {
      vi.advanceTimersByTime(10)
    })
    expect(result.current).toBe('H')

    act(() => {
      vi.advanceTimersByTime(20)
    })
    expect(result.current).toBe('Hi!')

    // Nothing further to reveal — later ticks are a no-op, not an out-of-range slice.
    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(result.current).toBe('Hi!')
  })

  it('returns the full text immediately when disabled, without starting a timer', () => {
    const { result } = renderHook(() => useTypewriter('Already verified.', { enabled: false }))

    expect(result.current).toBe('Already verified.')

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBe('Already verified.')
  })

  it('handles empty text without error', () => {
    const { result } = renderHook(() => useTypewriter(''))

    expect(result.current).toBe('')
  })

  it('restarts from empty when the text prop changes', () => {
    const { result, rerender } = renderHook(({ text }) => useTypewriter(text, { speedMs: 10 }), {
      initialProps: { text: 'First' },
    })

    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(result.current).toBe('First')

    rerender({ text: 'Second' })
    expect(result.current).toBe('')

    act(() => {
      vi.advanceTimersByTime(60)
    })
    expect(result.current).toBe('Second')
  })
})
