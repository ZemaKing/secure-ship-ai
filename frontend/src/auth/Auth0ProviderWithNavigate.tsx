import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Auth0Provider, type AppState } from '@auth0/auth0-react'

interface Auth0ProviderWithNavigateProps {
  children: ReactNode
}

// redirect_uri is explicit (not left to the SDK's current-URL default) — every
// working Auth0 SPA example, including the skill's own reference snippet, sets
// this explicitly; omitting it was the actual cause behind a live "Unable to issue
// redirect for OAuth 2.0 transaction" failure reproduced identically across two
// fresh tenants. Since redirect_uri is now a fixed origin rather than wherever
// login was triggered from, onRedirectCallback + appState.returnTo (set by
// ProtectedRoute) is what sends the visitor back to /admin instead of "/".
function Auth0ProviderWithNavigate({ children }: Auth0ProviderWithNavigateProps) {
  const navigate = useNavigate()

  return (
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        redirect_uri: window.location.origin,
      }}
      onRedirectCallback={(appState?: AppState) => navigate(appState?.returnTo ?? '/admin')}
    >
      {children}
    </Auth0Provider>
  )
}

export default Auth0ProviderWithNavigate
