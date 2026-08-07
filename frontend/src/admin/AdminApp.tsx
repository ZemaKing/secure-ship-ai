import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useAdminMe } from '../api/generated/secure-ship'
import './AdminApp.scss'

// Minimal shell for Chunk A: just proves the route + renders /admin/me's real
// decoded claims. Fetching the access token here and passing it manually into one
// call is fine for a single endpoint — once Chunks B-D add several admin endpoints
// all needing the same Authorization header, that's the point to extract a shared
// mechanism (a small hook, or a custom Orval fetch mutator), not before.
function AdminApp() {
  const { user, logout, getAccessTokenSilently } = useAuth0()
  const [accessToken, setAccessToken] = useState<string | null>(null)

  useEffect(() => {
    getAccessTokenSilently().then(setAccessToken)
  }, [getAccessTokenSilently])

  const { data, isLoading, error } = useAdminMe({
    query: { enabled: !!accessToken },
    fetch: { headers: { Authorization: `Bearer ${accessToken}` } },
  })

  return (
    <div className="admin-app">
      <div className="admin-app__header">
        <h1 className="admin-app__title">Admin Access Panel</h1>
        <button
          className="admin-app__logout"
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
        >
          Log out {user?.name ?? ''}
        </button>
      </div>

      {isLoading || !accessToken ? (
        <p className="admin-app__status">Loading…</p>
      ) : error ? (
        <p className="admin-app__status admin-app__status--error">Couldn't reach the admin API.</p>
      ) : (
        <p className="admin-app__status">
          Signed in as <strong>{data?.data.email ?? data?.data.sub}</strong>
        </p>
      )}
    </div>
  )
}

export default AdminApp
