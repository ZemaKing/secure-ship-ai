import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useVerifyCode } from '../../api/generated/secure-ship'
import './CodeModal.scss'

const CODE_LENGTH = 6
const GENERIC_ERROR_MESSAGE = 'Something went wrong verifying that code. Please try again.'

interface CodeModalProps {
  open: boolean
  sessionId: string
  onVerified: (message: string) => void
}

function CodeModal({ open, sessionId, onVerified }: CodeModalProps) {
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''))
  const [dismissed, setDismissed] = useState(false)
  const [verified, setVerified] = useState(false)
  const [locked, setLocked] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const verifyMutation = useVerifyCode()

  const visible = open && !dismissed && !verified

  useEffect(() => {
    if (visible) {
      inputRefs.current[0]?.focus()
    }
  }, [visible])

  useEffect(() => {
    if (!visible) return
    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setDismissed(true)
    }
    window.addEventListener('keydown', handleWindowKeyDown)
    return () => window.removeEventListener('keydown', handleWindowKeyDown)
  }, [visible])

  if (!visible) return null

  const code = digits.join('')
  const canSubmit = code.length === CODE_LENGTH && !verifyMutation.isPending && !locked

  function handleDigitChange(index: number, rawValue: string) {
    const value = rawValue.replace(/[^0-9]/g, '').slice(-1)
    setDigits((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
    if (value && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleDigitKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (event.key === 'Enter') {
      handleVerify()
    }
  }

  function handleVerify() {
    if (!canSubmit) return
    verifyMutation.mutate(
      { data: { session_id: sessionId, code } },
      {
        onSuccess: (response) => {
          if (response.status !== 200) {
            setFeedback(GENERIC_ERROR_MESSAGE)
            return
          }
          const data = response.data
          if (data.success) {
            setVerified(true)
            onVerified(data.reply)
            return
          }
          setFeedback(data.reply)
          setAttemptsRemaining(data.attempts_remaining ?? null)
          setDigits(Array(CODE_LENGTH).fill(''))
          if (data.state !== 'awaiting_code') {
            // Locked out or expired — no pending code left to check server-side,
            // so further input is pointless until identity is re-verified.
            setLocked(true)
          } else {
            inputRefs.current[0]?.focus()
          }
        },
        onError: () => setFeedback(GENERIC_ERROR_MESSAGE),
      },
    )
  }

  function handleDismiss() {
    setDismissed(true)
  }

  return (
    <div className="code-modal__overlay" onClick={handleDismiss}>
      <div
        className="code-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="code-modal__close" aria-label="Close" onClick={handleDismiss}>
          ×
        </button>

        <div className="code-modal__icon">
          <img src="/icons/modal-security-lock.svg" alt="" />
        </div>
        <h2 className="code-modal__title" id="code-modal-title">
          Enter Verification Code
        </h2>
        <p className="code-modal__subtitle">We've sent a 6-digit verification code to your phone number.</p>

        <div className="code-modal__digits">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el
              }}
              className="code-modal__digit-input"
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              disabled={locked || verifyMutation.isPending}
              onChange={(event) => handleDigitChange(index, event.target.value)}
              onKeyDown={(event) => handleDigitKeyDown(index, event)}
            />
          ))}
        </div>

        {feedback && (
          <p className="code-modal__feedback">
            {feedback}
            {attemptsRemaining !== null &&
              attemptsRemaining > 0 &&
              ` (${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining)`}
          </p>
        )}

        <div className="code-modal__actions">
          <button type="button" className="code-modal__cancel-button" onClick={handleDismiss}>
            Cancel
          </button>
          <button
            type="button"
            className="code-modal__verify-button"
            onClick={handleVerify}
            disabled={!canSubmit}
          >
            {verifyMutation.isPending ? 'Verifying…' : 'Verify Code'}
          </button>
        </div>

        <p className="code-modal__footer">
          <img className="code-modal__footer-icon" src="/icons/modal-securitycheck.svg" alt="" />
          For your security, this code will expire in 5 minutes.
        </p>
      </div>
    </div>
  )
}

export default CodeModal
