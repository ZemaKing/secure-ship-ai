"""The PII/logging audit (docs/PII_AUDIT.md) — the automated backstop for its
central claim: the mock 2FA code, generated fresh per session and printed only to the
console (tools/send_verification_code.py), never also lands in ChatSession.transcript,
the one place this app persists conversational content to Postgres.
"""
import routes.chat as chat_routes
from llm.ollama_client import ChatCompletionResult, ToolCall
from schemas.chat import ChatRequest
from services.verification_store import get_pending


def test_the_2fa_code_never_lands_in_the_persisted_transcript(db_session, make_customer, make_session, monkeypatch):
    customer = make_customer(first_name="Nova", last_name="Star", phone_number="+15559999")
    session = make_session()

    def fake_chat(messages, tools=None):
        if tools:
            return ChatCompletionResult(
                content=None,
                tool_calls=[
                    ToolCall(
                        name="verify_identity",
                        arguments={
                            "first_name": customer.first_name,
                            "last_name": customer.last_name,
                            "phone_number": customer.phone_number,
                            "address": customer.address,
                        },
                    )
                ],
            )
        return ChatCompletionResult(content="(unused)", tool_calls=[])

    monkeypatch.setattr(chat_routes.ollama_client, "chat", fake_chat)

    response = chat_routes.send_chat_message(
        ChatRequest(message="Where is my package?", session_id=str(session.id)), db_session
    )

    assert response.event == "code_sent"
    code = get_pending(str(session.id)).code
    assert code is not None

    transcript_text = " ".join(entry["content"] for entry in session.transcript)
    assert code not in transcript_text
    assert customer.phone_number not in transcript_text
