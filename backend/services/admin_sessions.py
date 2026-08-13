import uuid

from sqlalchemy.orm import Session

from models.chat_session import ChatSession
from models.customer import Customer


def list_sessions(db: Session) -> list[ChatSession]:
    return db.query(ChatSession).order_by(ChatSession.started_at.desc()).all()


def get_session(db: Session, session_id: uuid.UUID) -> ChatSession | None:
    return db.query(ChatSession).filter(ChatSession.id == session_id).first()


def resolve_visitor_name(db: Session, session: ChatSession) -> str | None:
    """A real Customer row (once Verified) takes priority over pending_identity —
    the same "confirmed data over unconfirmed, visitor-claimed data" rule
    routes/chat.py's _verified_customer_name() already follows.
    """
    if session.customer_id is not None:
        customer = db.query(Customer).filter(Customer.id == session.customer_id).first()
        if customer is not None:
            return f"{customer.first_name} {customer.last_name}"

    pending = session.pending_identity or {}
    first_name, last_name = pending.get("first_name"), pending.get("last_name")
    if first_name or last_name:
        return " ".join(part for part in (first_name, last_name) if part)
    return None


def resolve_phone_number(db: Session, session: ChatSession) -> str | None:
    if session.customer_id is not None:
        customer = db.query(Customer).filter(Customer.id == session.customer_id).first()
        if customer is not None:
            return customer.phone_number
    return (session.pending_identity or {}).get("phone_number")
