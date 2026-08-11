import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

// Extracted once AdminLayout (useAdminMe) and CustomerManager (customer CRUD) both
// needed the same "fetch a token, attach it as a Bearer header" dance — per the
// project's "wait for a second real use case" convention, not built speculatively
// back in Chunk A when AdminApp was the only consumer.
export function useAdminAccessToken(): string | null {
  const { getAccessTokenSilently } = useAuth0()
  const [accessToken, setAccessToken] = useState<string | null>(null)

  useEffect(() => {
    getAccessTokenSilently().then(setAccessToken)
  }, [getAccessTokenSilently])

  return accessToken
}

export function authHeaders(accessToken: string | null): RequestInit {
  return { headers: { Authorization: `Bearer ${accessToken}` } }
}
