import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import ProtectedRoute from './ProtectedRoute'

// The real Auth0Provider needs a live tenant to do anything, so only the useAuth0()
// hook itself is mocked here — same "mock only the true external boundary" principle
// CodeModal.test.tsx already follows for global.fetch. MemoryRouter is needed since
// ProtectedRoute reads useLocation() to build appState.returnTo for the post-login
// redirect back to wherever the visitor actually started.
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

const mockedUseAuth0 = vi.mocked(useAuth0)

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <ProtectedRoute>
        <div>secret content</div>
      </ProtectedRoute>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('ProtectedRoute', () => {
  it('renders children once authenticated', () => {
    mockedUseAuth0.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      loginWithRedirect: vi.fn(),
    } as unknown as ReturnType<typeof useAuth0>)

    renderProtectedRoute()

    expect(screen.getByText('secret content')).toBeInTheDocument()
  })

  it('renders nothing and does not redirect while still loading', () => {
    const loginWithRedirect = vi.fn()
    mockedUseAuth0.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      loginWithRedirect,
    } as unknown as ReturnType<typeof useAuth0>)

    renderProtectedRoute()

    expect(screen.queryByText('secret content')).not.toBeInTheDocument()
    expect(loginWithRedirect).not.toHaveBeenCalled()
  })

  it('redirects to login with the current path as returnTo once loading finishes unauthenticated', () => {
    const loginWithRedirect = vi.fn()
    mockedUseAuth0.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      loginWithRedirect,
    } as unknown as ReturnType<typeof useAuth0>)

    renderProtectedRoute()

    expect(loginWithRedirect).toHaveBeenCalledTimes(1)
    expect(loginWithRedirect).toHaveBeenCalledWith({ appState: { returnTo: '/admin' } })
    expect(screen.queryByText('secret content')).not.toBeInTheDocument()
  })
})
