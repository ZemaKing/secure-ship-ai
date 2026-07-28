import enum
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from models.chat_session import ChatSession, ChatSessionState
from services.verification_store import MAX_ATTEMPTS, clear, get_pending, increment_attempts


class VerifyStatus(str, enum.Enum):
    MATCH = "match"
    MISMATCH = "mismatch"
    EXPIRED = "expired"
    LOCKED_OUT = "locked_out"


@dataclass
class VerifyOutcome:
    status: VerifyStatus
    attempts_remaining: int | None = None


def check_verification_code(db: Session, session: ChatSession, submitted_code: str) -> VerifyOutcome:
    session_id = str(session.id)
    pending = get_pending(session_id)

    if pending is None or datetime.now(timezone.utc) >= pending.expires_at:
        # No auto-regenerate on expiry either — same reasoning as the lockout branch
        # below: reverting to CollectingIdentity (fields retained) naturally produces a
        # fresh code the next time verify_identity re-matches, rather than this endpoint
        # silently minting one itself.
        clear(session_id)
        if session.state == ChatSessionState.AWAITING_CODE:
            session.state = ChatSessionState.COLLECTING_IDENTITY
            db.commit()
        return VerifyOutcome(status=VerifyStatus.EXPIRED)

    if submitted_code == pending.code:
        session.customer_id = pending.customer_id
        session.pending_customer_id = None
        session.pending_identity = None
        session.state = ChatSessionState.VERIFIED
        db.commit()
        clear(session_id)
        return VerifyOutcome(status=VerifyStatus.MATCH)

    attempts = increment_attempts(session_id)
    if attempts >= MAX_ATTEMPTS:
        # Deliberate lockout, no silent auto-regenerate (DEV_PLAN.md's explicit ask for a
        # documented number): 3 wrong tries discards the code and sends the visitor back
        # to CollectingIdentity rather than granting an unlimited guessing window on one
        # live code. Already-collected identity fields (pending_identity) are kept, so
        # re-verifying doesn't require retyping everything.
        clear(session_id)
        session.state = ChatSessionState.COLLECTING_IDENTITY
        db.commit()
        return VerifyOutcome(status=VerifyStatus.LOCKED_OUT)

    return VerifyOutcome(status=VerifyStatus.MISMATCH, attempts_remaining=MAX_ATTEMPTS - attempts)
