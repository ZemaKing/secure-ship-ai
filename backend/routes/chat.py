from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.session import get_db
from llm import ollama_client
from models.chat_session import ChatSession, ChatSessionState

router = APIRouter()

SYSTEM_PROMPT = (
    "You are a friendly customer support assistant for SecureShip, a parcel "
    "tracking company. Help customers with questions about their shipments."
)


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


def _get_or_create_session(db: Session) -> ChatSession:
    """Naive single-session lookup for Week 1 — real state-machine handling is Week 2 scope."""
    session = (
        db.query(ChatSession)
        .filter(ChatSession.ended_at.is_(None))
        .order_by(ChatSession.started_at.desc())
        .first()
    )
    if session is None:
        session = ChatSession(
            state=ChatSessionState.ANONYMOUS,
            started_at=datetime.now(timezone.utc),
            transcript=[],
        )
        db.add(session)
    return session


@router.post("/chat", operation_id="chat")
def send_chat_message(request: ChatRequest, db: Session = Depends(get_db)) -> ChatResponse:
    session = _get_or_create_session(db)
    transcript = list(session.transcript or [])
    transcript.append(
        {"role": "user", "content": request.message, "timestamp": datetime.now(timezone.utc).isoformat()}
    )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": request.message},
    ]
    reply = ollama_client.chat(messages)

    transcript.append(
        {"role": "assistant", "content": reply, "timestamp": datetime.now(timezone.utc).isoformat()}
    )
    session.transcript = transcript
    db.commit()

    return ChatResponse(reply=reply)
