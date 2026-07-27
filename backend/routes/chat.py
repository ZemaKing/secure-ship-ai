import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from llm import ollama_client
from models.chat_session import ChatSession, ChatSessionState
from schemas.chat import ChatRequest, ChatResponse
from services.prompting import build_system_prompt

router = APIRouter()


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


@router.post("/chat", operation_id="chat")
def send_chat_message(request: ChatRequest, db: Session = Depends(get_db)) -> ChatResponse:
    session = _get_or_create_session(db, request.session_id)
    transcript = list(session.transcript or [])
    transcript.append(
        {"role": "user", "content": request.message, "timestamp": datetime.now(timezone.utc).isoformat()}
    )

    messages = [
        {"role": "system", "content": build_system_prompt(session.pending_identity)},
        {"role": "user", "content": request.message},
    ]
    result = ollama_client.chat(messages)
    reply = result.content

    transcript.append(
        {"role": "assistant", "content": reply, "timestamp": datetime.now(timezone.utc).isoformat()}
    )
    session.transcript = transcript
    db.commit()

    return ChatResponse(session_id=str(session.id), reply=reply, state=session.state.value)
