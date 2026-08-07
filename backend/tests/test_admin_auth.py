"""Epic E1/E3: /admin/* is protected by a single router-level dependency —
auth0-fastapi-api's Auth0FastAPI.require_auth() — that rejects an
unauthenticated/invalid request before any admin route logic runs. This is the
first test file in the suite to exercise real HTTP request/response behavior
(header parsing, status codes) rather than calling a route function directly, since
that's exactly what's under test here — a missing/malformed Authorization header
only exists as a concept at the HTTP layer.

The 400-vs-401 split below is the SDK's actual, observed behavior (confirmed live
against the real dev Auth0 tenant before writing this test), not an assumption:
a missing/malformed header is a client request problem (400 invalid_request); a
present-but-invalid token is 401 invalid_token. No live Auth0/JWKS call is needed
for either case here — both fail before any network round trip (missing header is
checked locally; "garbage.invalid.token" fails to base64-decode as a JWT header,
also entirely local).
"""
from fastapi.testclient import TestClient

from auth.dependencies import get_current_admin
from main import app

client = TestClient(app)


def test_admin_me_rejects_missing_auth_header():
    response = client.get("/admin/me")

    assert response.status_code == 400


def test_admin_me_rejects_malformed_token():
    response = client.get("/admin/me", headers={"Authorization": "Bearer garbage.invalid.token"})

    assert response.status_code == 401


def test_admin_me_returns_claims_for_an_authenticated_request():
    # Bypasses the real SDK validation (already covered by the two tests above and
    # the live Universal Login round trip) to prove the route itself — reading
    # sub/email off whatever claims the dependency returns — works correctly,
    # via FastAPI's own dependency_overrides mechanism rather than a real token.
    app.dependency_overrides[get_current_admin] = lambda: {"sub": "auth0|test123", "email": "admin@example.com"}
    try:
        response = client.get("/admin/me")
    finally:
        del app.dependency_overrides[get_current_admin]

    assert response.status_code == 200
    assert response.json() == {"sub": "auth0|test123", "email": "admin@example.com"}
