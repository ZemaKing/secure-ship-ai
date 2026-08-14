import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi_plugin import Auth0FastAPI

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Epic E3's enforcement point: JWKS fetch/cache and RS256/aud/iss validation are all
# handled by auth0-fastapi-api itself — no hand-rolled JWT verification here (the
# Auth0 skill explicitly flags python-jose/PyJWT-based manual validation as a mistake
# to avoid; the SDK is the one place that verifies a token).
auth0 = Auth0FastAPI(
    domain=os.environ["AUTH0_DOMAIN"],
    audience=os.environ["AUTH0_AUDIENCE"],
)

# Epic E4 close-out: closes the "anyone who signs up is an admin" gap found live —
# a valid, correctly-signed token is no longer sufficient on its own; it must also
# carry the admin:access permission (RBAC'd on the Auth0 API side,
# assigned to the real admin user in the Dashboard, never granted automatically by
# signup). Every /admin/* route inherits this via the router-level dependency in
# routes/admin.py — one place to update, not one per route.
get_current_admin = auth0.require_auth(scopes="admin:access")
