"""verified_customer_name (ChatResponse/VerifyCodeResponse) — the real backing data
behind the frontend's "Identity verified · <name>" badge and the one-time "Identity
verified successfully" message. Only ever populated from a real, already-verified
Customer row (session.customer_id), never from pending/unconfirmed identity data.
"""
import routes.chat as chat_routes
from llm.ollama_client import ChatCompletionResult
from models.chat_session import ChatSessionState
from services.verification_store import get_pending
from tools.send_verification_code import send_verification_code


def test_verify_code_match_returns_customer_name(client, db_session, make_customer, make_session):
    customer = make_customer(first_name="Nova", last_name="Star")
    session = make_session(
        pending_customer_id=customer.id,
        pending_identity={"phone_number": customer.phone_number},
    )
    send_verification_code(db_session, session)
    real_code = get_pending(str(session.id)).code

    response = client.post("/verify-code", json={"session_id": str(session.id), "code": real_code})

    assert response.status_code == 200
    assert response.json()["verified_customer_name"] == "Nova Star"


def test_verify_code_mismatch_returns_no_customer_name(client, db_session, make_customer, make_session):
    customer = make_customer()
    session = make_session(
        pending_customer_id=customer.id,
        pending_identity={"phone_number": customer.phone_number},
    )
    send_verification_code(db_session, session)

    response = client.post("/verify-code", json={"session_id": str(session.id), "code": "000000"})

    assert response.status_code == 200
    assert response.json()["verified_customer_name"] is None


def test_chat_carries_verified_customer_name_once_verified(client, make_customer, make_session, monkeypatch):
    customer = make_customer(first_name="Nova", last_name="Star")
    session = make_session(state=ChatSessionState.VERIFIED, customer_id=customer.id)
    monkeypatch.setattr(
        chat_routes.ollama_client, "chat", lambda messages, tools=None: ChatCompletionResult(content="(mock)", tool_calls=[])
    )

    response = client.post("/chat", json={"message": "hello", "session_id": str(session.id)})

    assert response.status_code == 200
    assert response.json()["verified_customer_name"] == "Nova Star"


def test_chat_carries_no_customer_name_while_unverified(client, make_session, monkeypatch):
    session = make_session(state=ChatSessionState.ANONYMOUS)
    monkeypatch.setattr(
        chat_routes.ollama_client, "chat", lambda messages, tools=None: ChatCompletionResult(content="(mock)", tool_calls=[])
    )

    response = client.post("/chat", json={"message": "hello", "session_id": str(session.id)})

    assert response.status_code == 200
    assert response.json()["verified_customer_name"] is None
