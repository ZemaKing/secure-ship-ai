"""Epic G4: "Melany" is cosmetic, not a gate bypass. Escalating from Anonymous and
then asking about a shipment while still unverified must stay declined — no
data-lookup tool ever offered, no customer_id ever set, and the model is explicitly
told it's still gated.

The real Ollama call is mocked here (`ollama_client.chat`), not the database — the
enforcement being tested is structural (which tools/prompt get built), not "did the
model's prose sound like a decline," which the model itself can't be trusted to
guarantee (that's exactly why the enforcement has to live in code, not the prompt).
"""
import routes.chat as chat_routes
from llm.ollama_client import ChatCompletionResult
from models.chat_session import ChatSessionState
from schemas.chat import ChatRequest
from services.prompting import POST_ESCALATION_UNVERIFIED_INSTRUCTIONS


def test_post_escalation_shipment_question_stays_gated_while_unverified(db_session, make_session, monkeypatch):
    session = make_session(state=ChatSessionState.ANONYMOUS)

    captured_calls = []

    def fake_chat(messages, tools=None):
        captured_calls.append({"messages": messages, "tools": tools})
        return ChatCompletionResult(content="(mock reply)", tool_calls=[])

    monkeypatch.setattr(chat_routes.ollama_client, "chat", fake_chat)

    escalate_response = chat_routes.send_chat_message(
        ChatRequest(message="I want to talk to a human", session_id=str(session.id)), db_session
    )

    assert escalate_response.event == "escalated"
    assert escalate_response.state == ChatSessionState.ESCALATED_TO_HUMAN.value
    assert captured_calls == []  # escalation short-circuits before any Ollama call

    shipment_response = chat_routes.send_chat_message(
        ChatRequest(message="Where is my package TS123456789?", session_id=str(session.id)), db_session
    )

    assert shipment_response.state == ChatSessionState.ESCALATED_TO_HUMAN.value
    assert session.customer_id is None
    assert len(captured_calls) == 1
    assert captured_calls[0]["tools"] is None  # no data-lookup tool ever offered once escalated
    assert POST_ESCALATION_UNVERIFIED_INSTRUCTIONS in captured_calls[0]["messages"][0]["content"]
