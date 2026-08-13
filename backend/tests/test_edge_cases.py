"""Week 5's deliberate edge-case pass: malformed input, an expired code exercised
through the real HTTP /verify-code endpoint (not just the tool layer, which
test_verification_flow.py already covers), empty-result shipment lookups, and
giving up mid-identity-collection to ask something unrelated. Confirms graceful
handling (no crash, no state corruption, no data leak) rather than re-testing
things already covered elsewhere.
"""
from datetime import datetime, timedelta, timezone

import routes.chat as chat_routes
import tools.check_verification_code as check_verification_code_module
from llm.ollama_client import ChatCompletionResult, ToolCall
from models.chat_session import ChatSessionState
from schemas.chat import ChatRequest
from services.verification_store import CODE_TTL_SECONDS, get_pending
from tools.send_verification_code import send_verification_code


def test_chat_rejects_an_empty_message_at_the_http_boundary(client):
    response = client.post("/chat", json={"message": "", "session_id": None})

    assert response.status_code == 422


def test_chat_rejects_a_missing_message_field_at_the_http_boundary(client):
    response = client.post("/chat", json={"session_id": None})

    assert response.status_code == 422


def test_chat_with_a_malformed_session_id_gracefully_starts_a_fresh_session(client, monkeypatch):
    monkeypatch.setattr(
        chat_routes.ollama_client,
        "chat",
        lambda messages, tools=None: ChatCompletionResult(content="Hi there!", tool_calls=[]),
    )

    response = client.post("/chat", json={"message": "hello", "session_id": "not-a-real-uuid"})

    assert response.status_code == 200
    body = response.json()
    assert body["session_id"] != "not-a-real-uuid"
    assert body["state"] == "anonymous"


def test_verify_code_404s_on_a_malformed_session_id(client):
    response = client.post("/verify-code", json={"session_id": "not-a-real-uuid", "code": "123456"})

    assert response.status_code == 404


def test_verify_code_404s_on_a_well_formed_but_unknown_session_id(client):
    response = client.post(
        "/verify-code",
        json={"session_id": "00000000-0000-0000-0000-000000000000", "code": "123456"},
    )

    assert response.status_code == 404


def test_verify_code_handles_a_malformed_code_as_a_plain_mismatch(client, db_session, make_customer, make_session):
    customer = make_customer()
    session = make_session(pending_customer_id=customer.id, pending_identity={"phone_number": customer.phone_number})
    send_verification_code(db_session, session)
    db_session.commit()

    response = client.post("/verify-code", json={"session_id": str(session.id), "code": "not-six-digits!"})

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is False
    assert body["attempts_remaining"] == 2


def test_verify_code_endpoint_reports_expired_correctly(client, db_session, make_customer, make_session, monkeypatch):
    customer = make_customer()
    session = make_session(pending_customer_id=customer.id, pending_identity={"phone_number": customer.phone_number})
    send_verification_code(db_session, session)
    real_code = get_pending(str(session.id)).code
    db_session.commit()

    real_now = datetime.now(timezone.utc)

    class _FutureDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return real_now + timedelta(seconds=CODE_TTL_SECONDS + 10)

    monkeypatch.setattr(check_verification_code_module, "datetime", _FutureDatetime)

    response = client.post("/verify-code", json={"session_id": str(session.id), "code": real_code})

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is False
    assert body["state"] == "collecting_identity"
    assert "expired" in body["reply"].lower()


def test_lookup_shipments_with_zero_shipments_returns_an_empty_list_not_a_crash(
    db_session, make_customer, make_session, monkeypatch
):
    customer = make_customer()
    session = make_session(state=ChatSessionState.VERIFIED, customer_id=customer.id)

    def fake_chat(messages, tools=None):
        if tools:
            return ChatCompletionResult(content=None, tool_calls=[ToolCall(name="lookup_shipments", arguments={})])
        return ChatCompletionResult(content="You don't have any shipments on file yet.", tool_calls=[])

    monkeypatch.setattr(chat_routes.ollama_client, "chat", fake_chat)

    response = chat_routes.send_chat_message(
        ChatRequest(message="Where is my package?", session_id=str(session.id)), db_session
    )

    assert response.shipments == []
    assert response.reply


def test_giving_up_mid_identity_collection_to_ask_something_unrelated_does_not_crash_or_lose_progress(
    db_session, make_session, monkeypatch
):
    """A visitor who's given only a first name so far asks an unrelated question instead
    of continuing — the model doesn't call verify_identity this turn (nothing new to
    report). Confirms this degrades gracefully: no crash, the already-collected field is
    retained, and the session stays in CollectingIdentity rather than resetting or erroring.
    """
    session = make_session(
        state=ChatSessionState.COLLECTING_IDENTITY,
        pending_identity={"first_name": "Nova"},
    )

    monkeypatch.setattr(
        chat_routes.ollama_client,
        "chat",
        lambda messages, tools=None: ChatCompletionResult(
            content="Sure — we're open Monday to Friday, 9am to 5pm.", tool_calls=[]
        ),
    )

    response = chat_routes.send_chat_message(
        ChatRequest(message="Actually, what are your business hours?", session_id=str(session.id)), db_session
    )

    assert response.state == "collecting_identity"
    assert response.reply == "Sure — we're open Monday to Friday, 9am to 5pm."
    assert session.pending_identity == {"first_name": "Nova"}
