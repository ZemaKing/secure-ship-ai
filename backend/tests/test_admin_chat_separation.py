"""Week 4, Chunk E: Epic E4's structural-separation proof — admin auth (Auth0) and
the chat's conversational identity gate are two genuinely independent systems, not
just two code paths that happen not to collide yet. Five falsifiable assertions,
each targeting a concrete way the two could actually leak into each other:

1. No token at all is rejected, on every /admin/* route, not just /admin/me.
2. A present-but-invalid token is rejected too, same routes, no dependency override
   (a real, if locally-forgeable, negative case — see that test's own docstring for
   why a real wrong-audience/expired *signed* token isn't reproduced here).
3. Source inspection: no *write-capable* admin route/service file (Customer/Shipment/
   Package CRUD) ever references ChatSession at all — the code-level analog of
   lookup_shipments having no identifier parameter. `admin_sessions.py` (Week 5's
   read-only chat session viewer) is deliberately excluded from this check — see its
   own docstring below for why that's still consistent with Epic E4, not a violation
   of it: the real invariant was always "no identity crossover," never "admin code
   may never read a ChatSession row" for audit/support purposes.
4. The chat/verify routes have no auth dependency whatsoever, so a stray admin
   bearer token attached to either call is provably inert, not just untested.
5. An admin-driven Customer edit never mutates an unrelated ChatSession row.
6. The one admin module that does read ChatSession (admin_sessions.py) has no
   write surface at all — no POST/PATCH/DELETE route exists for /admin/sessions.
"""
import glob
import os

from fastapi.testclient import TestClient

import routes.chat as chat_routes
from llm.ollama_client import ChatCompletionResult
from main import app
from models.chat_session import ChatSessionState
from schemas.admin import CustomerUpdate
from services import admin_customers

client = TestClient(app)

ADMIN_ROUTES = ["/admin/me", "/admin/customers", "/admin/shipments", "/admin/packages", "/admin/sessions"]


def test_admin_routes_require_auth():
    for path in ADMIN_ROUTES:
        response = client.get(path)
        assert response.status_code == 400, f"{path} should reject a missing Authorization header"


def test_admin_routes_reject_invalid_token():
    # A malformed token fails locally (it doesn't even base64-decode as a JWT
    # header), so this needs no live Auth0/JWKS round trip and no dependency
    # override — the real router-level auth0.require_auth() dependency runs for
    # real here. A validly-*signed*-but-wrong-audience/expired token would need a
    # real Auth0-issued JWT to forge convincingly (this project has no local
    # signing key), so that case is instead covered by the live Chunk A/E dry runs,
    # not reproduced as a unit test.
    headers = {"Authorization": "Bearer garbage.invalid.token"}
    for path in ADMIN_ROUTES:
        response = client.get(path, headers=headers)
        assert response.status_code == 401, f"{path} should reject a malformed token"


def test_write_capable_admin_modules_never_touch_chat_session():
    # The code-level analog of lookup_shipments' "no identifier parameter exists to
    # misuse" proof (Week 3, Chunk D) — here, "no reference to ChatSession exists to
    # misuse", scoped to the admin modules that can actually mutate data (Customer/
    # Shipment/Package). Reads the actual source files on disk rather than importing
    # and inspecting objects, so it catches a reference in a comment or an unused
    # import too, not just live code paths. admin_sessions.py is deliberately excluded
    # — see test_admin_sessions_is_read_only below for its own, narrower proof.
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    write_capable_service_files = [
        path
        for path in glob.glob(os.path.join(backend_dir, "services", "admin_*.py"))
        if os.path.basename(path) != "admin_sessions.py"
    ]
    assert len(write_capable_service_files) >= 3, "expected admin_customers/shipments/packages.py at least"

    for path in write_capable_service_files:
        with open(path, encoding="utf-8") as f:
            contents = f.read()
        assert "ChatSession" not in contents, f"{path} must never reference ChatSession"


def test_admin_sessions_is_read_only():
    # admin_sessions.py (Week 5's chat session viewer) is the one deliberate exception
    # to the rule above — it exists specifically to read ChatSession rows for admin
    # audit/support visibility. What actually preserves Epic E4's real invariant (no
    # identity crossover, not "admin code may never read a ChatSession row") is that
    # this module has no write surface at all: no create/update/delete function here,
    # and no POST/PATCH/DELETE route for /admin/sessions in routes/admin.py.
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(backend_dir, "services", "admin_sessions.py"), encoding="utf-8") as f:
        service_contents = f.read()
    assert "ChatSession" in service_contents, "admin_sessions.py should be the one module reading ChatSession"
    for verb in ("db.add(", "db.delete(", "db.commit()"):
        assert verb not in service_contents, f"admin_sessions.py must never mutate the database ({verb} found)"

    session_response = client.get("/admin/sessions")
    assert session_response.status_code == 400  # missing auth header — route exists, same as every other /admin/* route
    with open(os.path.join(backend_dir, "routes", "admin.py"), encoding="utf-8") as f:
        routes_contents = f.read()
    sessions_section = routes_contents[routes_contents.index("# Week 5 stretch"):]
    for method in ("@router.post(\"/sessions", "@router.patch(\"/sessions", "@router.delete(\"/sessions"):
        assert method not in sessions_section, f"/admin/sessions must stay read-only ({method} found)"


def test_chat_routes_ignore_admin_bearer_token(client, monkeypatch):
    # Uses the shared `client` fixture (conftest.py) — not the plain module-level
    # TestClient above — because this test, unlike the auth-rejection ones, actually
    # reaches get_db: /chat and /verify-code succeed and write real rows, so get_db
    # needs to be routed onto the test's own rolled-back transaction, same reasoning
    # as every admin CRUD test in this suite.
    #
    # /chat and /verify-code have no auth dependency at all (see routes/chat.py and
    # routes/verify.py) — so a bogus or even realistic-looking admin bearer token
    # attached to either call is never read, never validated, and can't widen or
    # narrow what either route does. Proven here by literally comparing the two
    # response bodies through the real HTTP layer (headers only exist as a concept
    # there), not by inspecting source for the absence of Depends(). The real Ollama
    # call is mocked to a fixed reply — same technique test_escalation_no_leak.py
    # uses — so this test asserts on the admin header's (lack of) effect, not on
    # whether the real model happens to phrase two replies identically.
    def fake_chat(messages, tools=None):
        return ChatCompletionResult(content="(mock reply)", tool_calls=[])

    monkeypatch.setattr(chat_routes.ollama_client, "chat", fake_chat)

    chat_payload = {"message": "hello", "session_id": None}
    bogus_admin_header = {"Authorization": "Bearer not-a-real-admin-token"}

    no_header_response = client.post("/chat", json=chat_payload)
    with_header_response = client.post("/chat", json=chat_payload, headers=bogus_admin_header)
    assert no_header_response.status_code == with_header_response.status_code == 200
    # session_id differs (each call creates its own fresh session) — compare
    # everything else, which is what actually reflects the admin header's (lack of)
    # influence on the turn.
    no_header_body = no_header_response.json()
    with_header_body = with_header_response.json()
    for key in ("reply", "state", "event", "escalation", "shipments"):
        assert no_header_body.get(key) == with_header_body.get(key)

    verify_payload = {"session_id": "00000000-0000-0000-0000-000000000000", "code": "000000"}
    no_header_verify = client.post("/verify-code", json=verify_payload)
    with_header_verify = client.post("/verify-code", json=verify_payload, headers=bogus_admin_header)
    assert no_header_verify.status_code == with_header_verify.status_code == 404
    assert no_header_verify.json() == with_header_verify.json()


def test_admin_customer_edit_does_not_mutate_chat_sessions(db_session, make_customer, make_session):
    customer = make_customer(first_name="Nova", last_name="Star")
    session = make_session(
        state=ChatSessionState.VERIFIED,
        customer_id=customer.id,
        pending_identity={"first_name": "Nova"},
    )
    session_snapshot = {
        "state": session.state,
        "customer_id": session.customer_id,
        "pending_customer_id": session.pending_customer_id,
        "pending_identity": session.pending_identity,
        "transcript": session.transcript,
    }

    admin_customers.update_customer(
        db_session,
        customer,
        CustomerUpdate(first_name="Nova", last_name="Starlight", phone_number=customer.phone_number, address=customer.address),
    )

    db_session.refresh(session)
    assert session.state == session_snapshot["state"]
    assert session.customer_id == session_snapshot["customer_id"]
    assert session.pending_customer_id == session_snapshot["pending_customer_id"]
    assert session.pending_identity == session_snapshot["pending_identity"]
    assert session.transcript == session_snapshot["transcript"]
