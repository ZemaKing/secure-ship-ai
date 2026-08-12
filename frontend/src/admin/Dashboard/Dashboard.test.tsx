import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import Dashboard from './Dashboard'

// Same "mock only the true external boundary" principle as the other managers —
// useAuth0() and global.fetch. Dashboard has no mutations, only derived reads, so
// there's nothing else stateful to exercise beyond stat computation + list slicing.
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

const mockedUseAuth0 = vi.mocked(useAuth0)

function shipment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `ship-${Math.random()}`,
    customer_id: 'cust-1',
    customer_name: 'Alice Nguyen',
    tracking_number: '1ZTRACK0000001',
    status: 'in_transit',
    carrier: 'DHL Express',
    origin: 'Mumbai, India',
    destination: 'New York, USA',
    estimated_delivery: '2030-05-16',
    last_update: '2030-05-01T10:00:00Z',
    ...overrides,
  }
}

const SEEDED_SHIPMENTS = [
  shipment({ id: 'ship-1', status: 'in_transit', tracking_number: '1ZONE0000000001' }),
  shipment({ id: 'ship-2', status: 'delivered', tracking_number: '1ZTWO0000000002' }),
  shipment({ id: 'ship-3', status: 'delivered', tracking_number: '1ZTHREE000000003' }),
  shipment({ id: 'ship-4', status: 'exception', tracking_number: '1ZFOUR0000000004' }),
]

function jsonResponse(body: unknown, status = 200) {
  return { status, text: async () => JSON.stringify(body) }
}

function mockFetch(shipments: unknown = SEEDED_SHIPMENTS) {
  const fetchMock = vi.fn(async () => jsonResponse(shipments))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderDashboard() {
  mockedUseAuth0.mockReturnValue({
    getAccessTokenSilently: vi.fn().mockResolvedValue('fake-access-token'),
  } as unknown as ReturnType<typeof useAuth0>)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Dashboard', () => {
  it('computes stat counts from the real (mocked-at-fetch) shipment list', async () => {
    mockFetch()
    renderDashboard()

    expect(await screen.findByText('Total Shipments')).toBeInTheDocument()
    // 4 total, 1 in_transit, 2 delivered, 1 exception.
    const cards = screen.getAllByText(/^\d+$/)
    expect(cards.map((el) => el.textContent)).toEqual(['4', '1', '2', '1'])
  })

  it('renders the recent shipments table from the same list', async () => {
    mockFetch()
    renderDashboard()

    expect(await screen.findByText('1ZONE0000000001')).toBeInTheDocument()
    expect(screen.getByText('1ZFOUR0000000004')).toBeInTheDocument()
  })

  it('shows an empty state when there are no shipments yet', async () => {
    mockFetch([])
    renderDashboard()

    expect(await screen.findByText('No shipments yet.')).toBeInTheDocument()
  })

  it('links each tracking number to Shipments with itself pre-filled as a search', async () => {
    mockFetch()
    renderDashboard()

    const link = await screen.findByRole('link', { name: '1ZONE0000000001' })
    expect(link).toHaveAttribute('href', '/admin/shipments?search=1ZONE0000000001')
  })

  it('links each stat card to Shipments pre-filtered to its own status', async () => {
    mockFetch()
    renderDashboard()

    await screen.findByText('Total Shipments')
    expect(screen.getByRole('link', { name: /total shipments/i })).toHaveAttribute('href', '/admin/shipments')
    expect(screen.getByRole('link', { name: /in transit/i })).toHaveAttribute(
      'href',
      '/admin/shipments?status=in_transit',
    )
    expect(screen.getByRole('link', { name: /^delivered/i })).toHaveAttribute(
      'href',
      '/admin/shipments?status=delivered',
    )
    expect(screen.getByRole('link', { name: /exceptions/i })).toHaveAttribute(
      'href',
      '/admin/shipments?status=exception',
    )
  })
})
