import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import ShipmentManager from './ShipmentManager'

// Same "mock only the true external boundary" principle as CustomerManager.test.tsx
// — useAuth0() and global.fetch, everything else (React Query, ShipmentManager's
// own state, ShipmentFormModal/ConfirmDialog) runs for real.
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

const mockedUseAuth0 = vi.mocked(useAuth0)

const SEEDED_CUSTOMERS = [{ id: 'cust-1', first_name: 'Alice', last_name: 'Nguyen', phone_number: '+15550001', address: '1 Elm St' }]

const SEEDED_SHIPMENTS = [
  {
    id: 'ship-1',
    customer_id: 'cust-1',
    customer_name: 'Alice Nguyen',
    tracking_number: '1ZTRACK0000001',
    status: 'in_transit',
    carrier: 'DHL Express',
    origin: 'Mumbai, India',
    destination: 'New York, USA',
    estimated_delivery: '2030-05-16',
    last_update: '2030-05-01T10:00:00Z',
  },
  {
    id: 'ship-2',
    customer_id: 'cust-2',
    customer_name: 'Bob Diallo',
    tracking_number: '1ZDELIVERED0002',
    status: 'delivered',
    carrier: 'FedEx',
    origin: 'Berlin, Germany',
    destination: 'Paris, France',
    estimated_delivery: '2030-05-10',
    last_update: '2030-04-28T10:00:00Z',
  },
]

function jsonResponse(body: unknown, status = 200) {
  return { status, text: async () => JSON.stringify(body) }
}

function mockFetch(handlers: { shipments?: unknown; create?: unknown; update?: unknown; delete?: unknown }) {
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    if (method === 'GET' && url.includes('/admin/shipments')) return jsonResponse(handlers.shipments ?? SEEDED_SHIPMENTS)
    if (method === 'GET' && url.includes('/admin/customers')) return jsonResponse(SEEDED_CUSTOMERS)
    if (method === 'POST') return jsonResponse(handlers.create ?? { id: 'ship-new', ...JSON.parse(options!.body as string) })
    if (method === 'PATCH') return jsonResponse(handlers.update ?? { id: 'ship-1', ...JSON.parse(options!.body as string) })
    if (method === 'DELETE') {
      const result = handlers.delete ?? { status: 204 }
      return jsonResponse(
        (result as { status: number }).status === 204 ? undefined : (result as { body: unknown }).body,
        (result as { status: number }).status,
      )
    }
    throw new Error(`Unexpected method ${method} for ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// Renders whatever route was actually navigated to, so tests can assert on
// where a click landed without mocking useNavigate() itself.
function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderManager() {
  mockedUseAuth0.mockReturnValue({
    getAccessTokenSilently: vi.fn().mockResolvedValue('fake-access-token'),
  } as unknown as ReturnType<typeof useAuth0>)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/admin/shipments']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/admin/shipments" element={<ShipmentManager />} />
          <Route path="*" element={<LocationDisplay />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('ShipmentManager', () => {
  it('renders the table from the real (mocked-at-fetch) list response', async () => {
    mockFetch({})
    renderManager()

    expect(await screen.findByText('1ZTRACK0000001')).toBeInTheDocument()
    expect(screen.getByText('Alice Nguyen')).toBeInTheDocument()
    expect(screen.getByText('DHL Express')).toBeInTheDocument()
  })

  it('changing the status dropdown sends only {status} to the right shipment', async () => {
    const fetchMock = mockFetch({})
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('1ZTRACK0000001')

    const statusSelect = screen.getByDisplayValue('In Transit')
    await user.selectOptions(statusSelect, 'Delivered')

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      const [url, options] = patchCall!
      expect(url).toContain('/admin/shipments/ship-1')
      expect(JSON.parse(options!.body as string)).toEqual({ status: 'delivered' })
    })
  })

  it('submits the expected payload when creating a shipment', async () => {
    const fetchMock = mockFetch({})
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('1ZTRACK0000001')

    await user.click(screen.getByRole('button', { name: /add shipment/i }))
    await user.selectOptions(screen.getByLabelText('Customer'), 'cust-1')
    await user.type(screen.getByLabelText('Tracking Number'), '1ZNEW00000001')
    await user.type(screen.getByLabelText('Carrier'), 'FedEx')
    await user.type(screen.getByLabelText('Origin'), 'Berlin, Germany')
    await user.type(screen.getByLabelText('Destination'), 'Paris, France')
    await user.type(screen.getByLabelText('Estimated Delivery'), '2030-06-01')
    await user.click(screen.getByRole('button', { name: /save shipment/i }))

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
      expect(postCall).toBeDefined()
      const body = JSON.parse(postCall![1]!.body as string)
      expect(body).toEqual({
        customer_id: 'cust-1',
        tracking_number: '1ZNEW00000001',
        status: 'label_created',
        carrier: 'FedEx',
        origin: 'Berlin, Germany',
        destination: 'Paris, France',
        estimated_delivery: '2030-06-01',
      })
    })
  })

  it('deletes a shipment after confirming, and shows the backend message on a 409 conflict', async () => {
    const fetchMock = mockFetch({
      delete: { status: 409, body: { detail: 'This shipment has existing packages and can’t be deleted.' } },
    })
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('1ZTRACK0000001')

    const row = screen.getByText('1ZTRACK0000001').closest('tr')!
    await user.click(within(row).getByRole('button', { name: /delete/i }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/existing packages/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(true)
  })

  it('clicking the customer name navigates to Customers with the name pre-filled as a search', async () => {
    mockFetch({})
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('1ZTRACK0000001')

    await user.click(screen.getByRole('button', { name: 'Alice Nguyen' }))

    expect(await screen.findByTestId('location')).toHaveTextContent('/admin/customers?search=Alice%20Nguyen')
  })

  it('clicking the tracking number navigates to Packages with it pre-filled as a search', async () => {
    mockFetch({})
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('1ZTRACK0000001')

    await user.click(screen.getByRole('button', { name: '1ZTRACK0000001' }))

    expect(await screen.findByTestId('location')).toHaveTextContent('/admin/packages?search=1ZTRACK0000001')
  })

  it('filters the table down to only the selected status', async () => {
    mockFetch({})
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('1ZTRACK0000001')
    expect(screen.getByText('1ZDELIVERED0002')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'delivered')

    expect(screen.queryByText('1ZTRACK0000001')).not.toBeInTheDocument()
    expect(screen.getByText('1ZDELIVERED0002')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'all')
    expect(screen.getByText('1ZTRACK0000001')).toBeInTheDocument()
  })
})
