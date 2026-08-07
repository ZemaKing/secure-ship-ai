import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'

interface ProtectedRouteProps {
  children: ReactNode
}

// loginWithRedirect() is a side effect, so it belongs in an effect, not the render
// body — the skill's own reference snippet calls it directly during render, which
// React (StrictMode's double-render in particular) would trigger more than once.
// The redirectingRef guard prevents that. It turned out NOT to be the cause of a
// live "Unable to issue redirect for OAuth 2.0 transaction" failure hit while
// verifying this chunk (that was Auth0Provider missing an explicit redirect_uri,
// fixed in main.tsx) — kept anyway as still-correct defense against a real
// StrictMode double-invoke, just not the bug that was actually diagnosed.
// appState.returnTo lets main.tsx's onRedirectCallback send the visitor back to
// wherever they actually started, since redirect_uri is now a fixed origin.
function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0()
  const location = useLocation()
  const redirectingRef = useRef(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !redirectingRef.current) {
      redirectingRef.current = true
      loginWithRedirect({ appState: { returnTo: location.pathname } })
    }
  }, [isLoading, isAuthenticated, loginWithRedirect, location.pathname])

  if (isLoading || !isAuthenticated) {
    return null
  }

  return <>{children}</>
}

export default ProtectedRoute
