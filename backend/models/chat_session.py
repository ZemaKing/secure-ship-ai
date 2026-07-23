import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class ChatSessionState(str, enum.Enum):
    ANONYMOUS = "anonymous"
    COLLECTING_IDENTITY = "collecting_identity"
    CODE_SENT = "code_sent"
    AWAITING_CODE = "awaiting_code"
    VERIFIED = "verified"
    ESCALATED_TO_HUMAN = "escalated_to_human"


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id"), nullable=True
    )
    state: Mapped[ChatSessionState] = mapped_column(
        Enum(
            ChatSessionState,
            name="chat_session_state",
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        )
    )
    started_at: Mapped[datetime] = mapped_column(DateTime)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    transcript: Mapped[list] = mapped_column(JSONB, default=list)
