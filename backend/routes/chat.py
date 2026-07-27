import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from llm import ollama_client
from llm.ollama_client import ToolCall
from models.chat_session import ChatSession, ChatSessionState
from schemas.chat import ChatRequest, ChatResponse
from services.prompting import build_system_prompt
from tools.schemas import IDENTITY_FIELDS, VERIFY_IDENTITY_TOOL_SCHEMA
from tools.verify_identity import IdentityOutcome, IdentityStatus, verify_identity

router = APIRouter()

NEUTRAL_IDENTITY_MESSAGE = "We couldn't verify that information — could you double check and try again?"
IDENTITY_MATCHED_MESSAGE = "Thanks, I've found your account — hold on while I verify it's really you."
IDENTITY_COLLECTING_STATES = (ChatSessionState.ANONYMOUS, ChatSessionState.COLLECTING_IDENTITY)
SHIPMENT_KEYWORDS = ("shipment", "package", "parcel", "order", "tracking", "deliver")


def _mentions_shipment(message: str) -> bool:
    """A plain keyword check, not a model call — mirrors the escalation-intent design
    (Chunk E) in keeping a state transition deterministic rather than dependent on
    whether the model happens to call a tool this turn. Only decides whether a session
    leaves Anonymous; the actual identity match is always tool/backend-enforced.
    """
    lowered = message.lower()
    return any(keyword in lowered for keyword in SHIPMENT_KEYWORDS)


def _get_or_create_session(db: Session, session_id: str | None) -> ChatSession:
    """Per-client session lookup — a given session_id only ever sees its own state."""
    if session_id is not None:
        try:
            session_uuid = uuid.UUID(session_id)
        except ValueError:
            session_uuid = None
        if session_uuid is not None:
            session = (
                db.query(ChatSession)
                .filter(ChatSession.id == session_uuid, ChatSession.ended_at.is_(None))
                .first()
            )
            if session is not None:
                return session

    session = ChatSession(
        state=ChatSessionState.ANONYMOUS,
        started_at=datetime.now(timezone.utc),
        transcript=[],
    )
    db.add(session)
    return session


def _tools_for_state(state: ChatSessionState) -> list[dict]:
    if state in IDENTITY_COLLECTING_STATES:
        return [VERIFY_IDENTITY_TOOL_SCHEMA]
    return []


def _dispatch_tool(db: Session, session: ChatSession, tool_call: ToolCall) -> IdentityOutcome | None:
    """Executes a tool call the model made. Only allows tool names that were actually
    offered for this session's current state — rejects anything else, which hardens
    against a prompt-injected/hallucinated tool name (Epic F2).
    """
    allowed_names = {schema["function"]["name"] for schema in _tools_for_state(session.state)}
    if tool_call.name not in allowed_names:
        return None

    if tool_call.name == "verify_identity":
        args = {field: tool_call.arguments.get(field) for field in IDENTITY_FIELDS}
        return verify_identity(db, session, **args)

    return None


@router.post("/chat", operation_id="chat")
def send_chat_message(request: ChatRequest, db: Session = Depends(get_db)) -> ChatResponse:
    session = _get_or_create_session(db, request.session_id)
    transcript = list(session.transcript or [])
    transcript.append(
        {"role": "user", "content": request.message, "timestamp": datetime.now(timezone.utc).isoformat()}
    )

    collecting_identity = session.state in IDENTITY_COLLECTING_STATES
    result = ollama_client.chat(
        [
            {"role": "system", "content": build_system_prompt(session.pending_identity, collecting_identity=collecting_identity)},
            {"role": "user", "content": request.message},
        ],
        tools=_tools_for_state(session.state) or None,
    )

    event = None
    if result.tool_calls:
        outcome = _dispatch_tool(db, session, result.tool_calls[0])
        if outcome is None:
            reply = result.content or "Sorry, I didn't catch that — could you rephrase?"
        else:
            if session.state == ChatSessionState.ANONYMOUS:
                session.state = ChatSessionState.COLLECTING_IDENTITY

            if outcome.status == IdentityStatus.REJECTED:
                reply = NEUTRAL_IDENTITY_MESSAGE
                event = "identity_rejected"
            elif outcome.status == IdentityStatus.MATCHED:
                # Chunk D replaces this placeholder with a real send_verification_code() call.
                reply = IDENTITY_MATCHED_MESSAGE
                event = "identity_matched"
            else:
                followup = ollama_client.chat(
                    [
                        {
                            "role": "system",
                            "content": build_system_prompt(session.pending_identity, collecting_identity=True),
                        },
                        {"role": "user", "content": request.message},
                    ]
                )
                reply = followup.content or "Could you share the rest of your name, phone number, and address?"
    else:
        reply = result.content or ""
        if session.state == ChatSessionState.ANONYMOUS and _mentions_shipment(request.message):
            session.state = ChatSessionState.COLLECTING_IDENTITY

    transcript.append(
        {"role": "assistant", "content": reply, "timestamp": datetime.now(timezone.utc).isoformat()}
    )
    session.transcript = transcript
    db.commit()

    return ChatResponse(session_id=str(session.id), reply=reply, state=session.state.value, event=event)
