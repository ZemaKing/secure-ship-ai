import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import CustomerManager from './CustomerManager'

// Only the two true external boundaries are mocked — useAuth0() (for the access
// token) and global.fetch (what the generated hooks call under the hood) — same
// "mock only the true external boundary" principle as CodeModal.test.tsx and
// ProtectedRoute.test.tsx. React Query, CustomerManager's own state, and the real
// CustomerFormModal/ConfirmDialog components all run for real.
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

const mockedUseAuth0 = vi.mocked(useAuth0)

const SEEDED_CUSTOMERS = [
  { id: 'cust-1', first_name: 'Alice', last_name: 'Nguyen', phone_number: '+15550001', address: '1 Elm St' },
  { id: 'cust-2', first_name: 'Bob', last_name: 'Diallo', phone_number: '+15550002', address: '2 Oak St' },
]

function jsonResponse(body: unknown, status = 200) {
  return { status, text: async () => JSON.stringify(body) }
}

function mockFetch(handlers: { list?: unknown; create?: unknown; update?: unknown; delete?: unknown }) {
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    if (method === 'GET') return jsonResponse(handlers.list ?? SEEDED_CUSTOMERS)
    if (method === 'POST') return jsonResponse(handlers.create ?? { id: 'cust-new', ...JSON.parse(options!.body as string) })
    if (method === 'PATCH') return jsonResponse(handlers.update ?? { id: 'cust-1', ...JSON.parse(options!.body as string) })
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
    <MemoryRouter initialEntries={['/admin/customers']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/admin/customers" element={<CustomerManager />} />
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

describe('CustomerManager', () => {
  it('renders the table from the real (mocked-at-fetch) list response', async () => {
    mockFetch({})
    renderManager()

    expect(await screen.findByText('Alice Nguyen')).toBeInTheDocument()
    expect(screen.getByText('Bob Diallo')).toBeInTheDocument()
    expect(screen.getByText('+15550001')).toBeInTheDocument()
  })

  it('submits the expected payload when creating a customer', async () => {
    const fetchMock = mockFetch({})
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Alice Nguyen')

    await user.click(screen.getByRole('button', { name: /add customer/i }))
    await user.type(screen.getByLabelText('First Name'), 'Nova')
    await user.type(screen.getByLabelText('Last Name'), 'Star')
    await user.type(screen.getByLabelText('Phone Number'), '+15559999')
    await user.type(screen.getByLabelText('Address'), '9 Nova Ave')
    await user.click(screen.getByRole('button', { name: /save customer/i }))

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
      expect(postCall).toBeDefined()
      const body = JSON.parse(postCall![1]!.body as string)
      expect(body).toEqual({
        first_name: 'Nova',
        last_name: 'Star',
        phone_number: '+15559999',
        address: '9 Nova Ave',
      })
    })
  })

  it('submits the expected payload when editing a customer, targeting the right id', async () => {
    const fetchMock = mockFetch({})
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Alice Nguyen')

    const aliceRow = screen.getByText('Alice Nguyen').closest('tr')!
    await user.click(within(aliceRow).getByRole('button', { name: /edit/i }))

    const lastNameInput = screen.getByLabelText('Last Name')
    await user.clear(lastNameInput)
    await user.type(lastNameInput, 'Nguyen-Smith')
    await user.click(screen.getByRole('button', { name: /save customer/i }))

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      const [url, options] = patchCall!
      expect(url).toContain('/admin/customers/cust-1')
      expect(JSON.parse(options!.body as string)).toEqual({
        first_name: 'Alice',
        last_name: 'Nguyen-Smith',
        phone_number: '+15550001',
        address: '1 Elm St',
      })
    })
  })

  it('copies the customer data to the clipboard as a labeled text block', async () => {
    mockFetch({})
    // jsdom 30 ships a real Clipboard stub at navigator.clipboard (not present in
    // older jsdom versions this project's other tests were written against), so
    // spying on its writeText method works — replacing the whole object via
    // defineProperty does not, since jsdom's own property isn't overridable that way.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Alice Nguyen')

    const aliceRow = screen.getByText('Alice Nguyen').closest('tr')!
    await user.click(within(aliceRow).getByRole('button', { name: /copy to clipboard/i }))

    expect(writeText).toHaveBeenCalledWith(
      'First Name: Alice\nLast Name: Nguyen\nPhone Number: +15550001\nAddress: 1 Elm St',
    )
    expect(await within(aliceRow).findByTitle('Copied!')).toBeInTheDocument()
  })

  it('deletes a customer after confirming, and shows the backend message on a 409 conflict', async () => {
    const fetchMock = mockFetch({ delete: { status: 409, body: { detail: 'This customer has existing shipments and can’t be deleted.' } } })
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Bob Diallo')

    const bobRow = screen.getByText('Bob Diallo').closest('tr')!
    await user.click(within(bobRow).getByRole('button', { name: /delete/i }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/existing shipments/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(true)
  })

  it('clicking a customer name navigates to Shipments with the name pre-filled as a search', async () => {
    mockFetch({})
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Alice Nguyen')

    await user.click(screen.getByRole('button', { name: 'Alice Nguyen' }))

    expect(await screen.findByTestId('location')).toHaveTextContent('/admin/shipments?search=Alice%20Nguyen')
  })
})
