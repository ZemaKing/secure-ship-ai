import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import PackageManager from './PackageManager'

// Same "mock only the true external boundary" principle as CustomerManager.test.tsx/
// ShipmentManager.test.tsx — useAuth0() and global.fetch, everything else (React
// Query, PackageManager's own state, PackageFormModal/ConfirmDialog) runs for real.
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

const mockedUseAuth0 = vi.mocked(useAuth0)

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
]

const SEEDED_PACKAGES = [
  {
    id: 'pkg-1',
    shipment_id: 'ship-1',
    tracking_number: '1ZTRACK0000001',
    description: 'Desk Lamp',
    weight_kg: '2.50',
    declared_value: '45.00',
  },
]

function jsonResponse(body: unknown, status = 200) {
  return { status, text: async () => JSON.stringify(body) }
}

function mockFetch(handlers: { packages?: unknown; create?: unknown; update?: unknown; delete?: unknown }) {
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    if (method === 'GET' && url.includes('/admin/packages')) return jsonResponse(handlers.packages ?? SEEDED_PACKAGES)
    if (method === 'GET' && url.includes('/admin/shipments')) return jsonResponse(SEEDED_SHIPMENTS)
    if (method === 'POST') return jsonResponse(handlers.create ?? { id: 'pkg-new', ...JSON.parse(options!.body as string) })
    if (method === 'PATCH') return jsonResponse(handlers.update ?? { id: 'pkg-1', ...JSON.parse(options!.body as string) })
    if (method === 'DELETE') {
      const result = handlers.delete ?? { status: 204 }
      return jsonResponse(undefined, (result as { status: number }).status)
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

function renderManager(initialEntries: string[] = ['/admin/packages']) {
  mockedUseAuth0.mockReturnValue({
    getAccessTokenSilently: vi.fn().mockResolvedValue('fake-access-token'),
  } as unknown as ReturnType<typeof useAuth0>)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/admin/packages" element={<PackageManager />} />
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

describe('PackageManager', () => {
  it('renders the table from the real (mocked-at-fetch) list response', async () => {
    mockFetch({})
    renderManager()

    expect(await screen.findByText('Desk Lamp')).toBeInTheDocument()
    expect(screen.getAllByText('1ZTRACK0000001').length).toBeGreaterThan(0)
  })

  it('submits the expected payload when creating a package', async () => {
    const fetchMock = mockFetch({})
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Desk Lamp')

    await user.click(screen.getByRole('button', { name: /add package/i }))
    await user.selectOptions(screen.getByLabelText('Shipment'), 'ship-1')
    await user.type(screen.getByLabelText('Description'), 'Coffee Mug')
    await user.type(screen.getByLabelText('Weight (kg)'), '0.75')
    await user.type(screen.getByLabelText('Declared Value'), '15.5')
    await user.click(screen.getByRole('button', { name: /save package/i }))

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
      expect(postCall).toBeDefined()
      const body = JSON.parse(postCall![1]!.body as string)
      expect(body).toEqual({
        shipment_id: 'ship-1',
        description: 'Coffee Mug',
        weight_kg: '0.75',
        declared_value: '15.5',
      })
    })
  })

  it('submits the expected payload when editing a package, targeting the right id', async () => {
    const fetchMock = mockFetch({})
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Desk Lamp')

    const row = screen.getByText('Desk Lamp').closest('tr')!
    await user.click(within(row).getByRole('button', { name: /edit/i }))

    const descriptionInput = screen.getByLabelText('Description')
    await user.clear(descriptionInput)
    await user.type(descriptionInput, 'Desk Lamp (Updated)')
    await user.click(screen.getByRole('button', { name: /save package/i }))

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      const [url, options] = patchCall!
      expect(url).toContain('/admin/packages/pkg-1')
      expect(JSON.parse(options!.body as string)).toEqual({
        shipment_id: 'ship-1',
        description: 'Desk Lamp (Updated)',
        weight_kg: '2.50',
        declared_value: '45.00',
      })
    })
  })

  it('deletes a package after confirming', async () => {
    const fetchMock = mockFetch({})
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Desk Lamp')

    const row = screen.getByText('Desk Lamp').closest('tr')!
    await user.click(within(row).getByRole('button', { name: /delete/i }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(true)
    })
  })

  it('pre-fills and applies the search field from a ?search= URL param (e.g. arriving from Shipments)', async () => {
    mockFetch({
      packages: [
        ...SEEDED_PACKAGES,
        { id: 'pkg-2', shipment_id: 'ship-2', tracking_number: 'OTHER00000002', description: 'Second Package', weight_kg: '1.00', declared_value: '10.00' },
      ],
    })
    renderManager(['/admin/packages?search=1ZTRACK0000001'])

    await screen.findByText('Desk Lamp')
    expect(screen.getByPlaceholderText(/search by tracking number/i)).toHaveValue('1ZTRACK0000001')
    expect(screen.queryByText('Second Package')).not.toBeInTheDocument()
  })

  it('clicking the tracking number navigates to Shipments with it pre-filled as a search', async () => {
    mockFetch({})
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Desk Lamp')

    await user.click(screen.getByRole('button', { name: '1ZTRACK0000001' }))

    expect(await screen.findByTestId('location')).toHaveTextContent('/admin/shipments?search=1ZTRACK0000001')
  })
})
