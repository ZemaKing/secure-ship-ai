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

get_current_admin = auth0.require_auth()
