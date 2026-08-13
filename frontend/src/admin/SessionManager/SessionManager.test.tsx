import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import SessionManager from './SessionManager'

// Same "mock only the true external boundary" principle as the other managers —
// useAuth0() and global.fetch, everything else (React Query, SessionManager's own
// state, SessionTranscriptModal) runs for real.
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

const mockedUseAuth0 = vi.mocked(useAuth0)

const SEEDED_SESSIONS = [
  {
    id: 'session-1',
    visitor_name: 'Nova Star',
    phone_number: '+15559999',
    state: 'verified',
    started_at: '2030-05-01T10:00:00Z',
    message_count: 6,
  },
  {
    id: 'session-2',
    visitor_name: null,
    phone_number: null,
    state: 'anonymous',
    started_at: '2030-05-01T09:00:00Z',
    message_count: 2,
  },
  {
    id: 'session-3',
    visitor_name: 'Marko Stanković',
    phone_number: '+15551234',
    state: 'escalated_to_human',
    started_at: '2030-04-30T18:00:00Z',
    message_count: 9,
  },
]

const SEEDED_TRANSCRIPT = {
  id: 'session-1',
  visitor_name: 'Nova Star',
  phone_number: '+15559999',
  state: 'verified',
  started_at: '2030-05-01T10:00:00Z',
  message_count: 2,
  transcript: [
    { role: 'user', content: 'Where is my package?', timestamp: '2030-05-01T10:00:00Z' },
    { role: 'assistant', content: 'Your shipment is in transit.', timestamp: '2030-05-01T10:00:05Z' },
  ],
}

function jsonResponse(body: unknown, status = 200) {
  return { status, text: async () => JSON.stringify(body) }
}

function mockFetch(sessions: unknown = SEEDED_SESSIONS) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/admin/sessions/session-1')) return jsonResponse(SEEDED_TRANSCRIPT)
    return jsonResponse(sessions)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderManager() {
  mockedUseAuth0.mockReturnValue({
    getAccessTokenSilently: vi.fn().mockResolvedValue('fake-access-token'),
  } as unknown as ReturnType<typeof useAuth0>)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/admin/sessions']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/admin/sessions" element={<SessionManager />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('SessionManager', () => {
  it('renders the table from the real (mocked-at-fetch) list response', async () => {
    mockFetch()
    renderManager()

    expect(await screen.findByText('Nova Star')).toBeInTheDocument()
    expect(screen.getByText('Unverified Visitor')).toBeInTheDocument()
    expect(screen.getByText('Marko Stanković')).toBeInTheDocument()
  })

  it('shows the real ChatSessionState labels as pills, not a fabricated ticket-status vocabulary', async () => {
    mockFetch()
    renderManager()

    await screen.findByText('Nova Star')
    const table = screen.getByRole('table')
    expect(within(table).getByText('Verified')).toBeInTheDocument()
    expect(within(table).getByText('Anonymous')).toBeInTheDocument()
    expect(within(table).getByText('Escalated to Human')).toBeInTheDocument()
  })

  it('shows an empty state when a search matches no sessions', async () => {
    mockFetch()
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Nova Star')

    await user.type(screen.getByPlaceholderText(/search by visitor name/i), 'nobody-matches-this')

    expect(await screen.findByText('No chat sessions found.')).toBeInTheDocument()
  })

  it('filters the table down to only the selected state', async () => {
    mockFetch()
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Nova Star')
    expect(screen.getByText('Marko Stanković')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Filter by state'), 'verified')

    expect(screen.getByText('Nova Star')).toBeInTheDocument()
    expect(screen.queryByText('Marko Stanković')).not.toBeInTheDocument()
  })

  it('sorts by Visitor/Customer, ascending, with unverified visitors always last', async () => {
    mockFetch()
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Nova Star')

    const namesInOrder = () =>
      Array.from(screen.getByRole('table').querySelectorAll('.session-manager__visitor-name')).map(
        (el) => el.textContent,
      )

    await user.click(screen.getByRole('button', { name: /visitor \/ customer/i }))

    expect(namesInOrder()).toEqual(['Marko Stanković', 'Nova Star', 'Unverified Visitor'])
  })

  it('sorts by Started At, defaulting to newest first, and toggles on repeated clicks', async () => {
    mockFetch()
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Nova Star')

    const namesInOrder = () =>
      Array.from(screen.getByRole('table').querySelectorAll('.session-manager__visitor-name')).map(
        (el) => el.textContent,
      )

    // session-1 (10:00) is the newest, session-3 (Apr 30) the oldest — matches the
    // default sortKey='started_at'/direction='desc' state, no click needed yet.
    expect(namesInOrder()).toEqual(['Nova Star', 'Unverified Visitor', 'Marko Stanković'])

    await user.click(screen.getByRole('button', { name: /started at/i }))
    expect(namesInOrder()).toEqual(['Marko Stanković', 'Unverified Visitor', 'Nova Star'])
  })

  it('opens the transcript modal with the real messages on View', async () => {
    mockFetch()
    const user = userEvent.setup()
    renderManager()
    const row = (await screen.findByText('Nova Star')).closest('tr')!

    await user.click(within(row).getByRole('button', { name: /view/i }))

    expect(await screen.findByText('Where is my package?')).toBeInTheDocument()
    expect(screen.getByText('Your shipment is in transit.')).toBeInTheDocument()
  })
})
