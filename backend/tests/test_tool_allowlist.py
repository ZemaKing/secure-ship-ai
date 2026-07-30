"""Epic F2: _dispatch_tool only ever runs a tool this exact session state actually
offers — a hallucinated/prompt-injected tool name is silently dropped, and even a
*real* tool name is rejected once the state stops offering it (the allowlist is
state-scoped, not just name-based).
"""
from llm.ollama_client import ToolCall
from models.chat_session import ChatSessionState
from routes.chat import _dispatch_tool


def test_hallucinated_tool_name_is_rejected(db_session, make_session):
    session = make_session(state=ChatSessionState.COLLECTING_IDENTITY)
    tool_call = ToolCall(name="lookup_shipments", arguments={"customer_id": "anything"})

    outcome = _dispatch_tool(db_session, session, tool_call)

    assert outcome is None


def test_verify_identity_is_allowed_while_collecting_identity(db_session, make_session):
    session = make_session(state=ChatSessionState.COLLECTING_IDENTITY)
    tool_call = ToolCall(name="verify_identity", arguments={"first_name": "Ivana"})

    outcome = _dispatch_tool(db_session, session, tool_call)

    assert outcome is not None
    assert outcome.status.value == "partial"


def test_verify_identity_is_rejected_once_escalated_to_human(db_session, make_session):
    session = make_session(state=ChatSessionState.ESCALATED_TO_HUMAN)
    tool_call = ToolCall(name="verify_identity", arguments={"first_name": "Ivana"})

    outcome = _dispatch_tool(db_session, session, tool_call)

    assert outcome is None
