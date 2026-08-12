import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CodeModal from './CodeModal'

// Only the network boundary (global fetch, which the generated useVerifyCode()
// mutation calls under the hood) is mocked — React Query and CodeModal's own state
// machine run for real, same principle as the backend suite mocking only
// ollama_client.chat and keeping the DB real (backend/tests/test_escalation_no_leak.py).
function mockVerifyResponse(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    status,
    text: async () => JSON.stringify(body),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderModal(onVerified: (message: string) => void = vi.fn(), onClose?: () => void) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CodeModal open sessionId="session-1" onVerified={onVerified} onClose={onClose} />
    </QueryClientProvider>,
  )
}

async function typeCode(user: ReturnType<typeof userEvent.setup>, inputs: HTMLElement[], code: string) {
  for (const [index, digit] of code.split('').entries()) {
    await user.type(inputs[index], digit)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CodeModal', () => {
  it('auto-advances focus to the next box as digits are entered', async () => {
    const user = userEvent.setup()
    renderModal()
    const inputs = screen.getAllByRole('textbox')

    await user.type(inputs[0], '1')
    expect(inputs[1]).toHaveFocus()

    await user.type(inputs[1], '2')
    expect(inputs[2]).toHaveFocus()
  })

  it('keeps Verify disabled until all six digits are filled', async () => {
    const user = userEvent.setup()
    renderModal()
    const inputs = screen.getAllByRole('textbox')
    const verifyButton = screen.getByRole('button', { name: /verify code/i })

    expect(verifyButton).toBeDisabled()

    await typeCode(user, inputs, '123456')

    expect(verifyButton).toBeEnabled()
  })

  it('on a wrong code, shows the backend\'s own feedback + attempts remaining, then clears and refocuses', async () => {
    mockVerifyResponse({
      session_id: 'session-1',
      success: false,
      reply: "That code doesn't match — please try again.",
      state: 'awaiting_code',
      attempts_remaining: 2,
    })
    const user = userEvent.setup()
    renderModal()
    const inputs = screen.getAllByRole('textbox')
    await typeCode(user, inputs, '999999')
    await user.click(screen.getByRole('button', { name: /verify code/i }))

    await screen.findByText(/that code doesn't match/i)
    expect(screen.getByText(/2 attempts remaining/i)).toBeInTheDocument()
    expect(inputs.map((input) => (input as HTMLInputElement).value)).toEqual(['', '', '', '', '', ''])
    expect(inputs[0]).toHaveFocus()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(inputs[0]).toBeEnabled()
  })

  it('disables every digit input once the backend reports a non-awaiting_code state (locked out or expired)', async () => {
    mockVerifyResponse({
      session_id: 'session-1',
      success: false,
      reply: "Too many incorrect attempts — let's verify your identity again to get a new code.",
      state: 'collecting_identity',
      attempts_remaining: 0,
    })
    const user = userEvent.setup()
    renderModal()
    const inputs = screen.getAllByRole('textbox')
    await typeCode(user, inputs, '999999')
    await user.click(screen.getByRole('button', { name: /verify code/i }))

    await screen.findByText(/too many incorrect attempts/i)
    for (const input of inputs) {
      expect(input).toBeDisabled()
    }
    expect(screen.getByRole('button', { name: /verify code/i })).toBeDisabled()
  })

  it('on a correct code, calls onVerified with the reply and customer name, and hides the modal', async () => {
    mockVerifyResponse({
      session_id: 'session-1',
      success: true,
      reply: "You're verified! How can I help with your shipment?",
      state: 'verified',
      attempts_remaining: null,
      verified_customer_name: 'Nova Star',
    })
    const user = userEvent.setup()
    const onVerified = vi.fn()
    renderModal(onVerified)
    const inputs = screen.getAllByRole('textbox')
    await typeCode(user, inputs, '123456')
    await user.click(screen.getByRole('button', { name: /verify code/i }))

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalledWith("You're verified! How can I help with your shipment?", 'Nova Star')
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Escape dismisses the modal without making any network call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderModal()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls onClose when dismissed, so a parent can offer a way to reopen it', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderModal(vi.fn(), onClose)

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
