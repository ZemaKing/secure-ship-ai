import secrets

from sqlalchemy.orm import Session

from models.chat_session import ChatSession, ChatSessionState
from services.verification_store import set_pending


def send_verification_code(db: Session, session: ChatSession) -> None:
    """Generates a mock 6-digit code for the identity `verify_identity` just matched,
    "sends" it, and moves the session into the 2FA-pending state.

    The code is only ever printed to the console (the mock "SMS" channel) — it never
    appears in a `ChatResponse`/transcript, and never touches a persistent log file
    (Epic C1 / no-PII-in-logs rule covers files on disk, not dev console output).
    """
    code = f"{secrets.randbelow(1_000_000):06d}"
    phone_number = (session.pending_identity or {}).get("phone_number", "unknown number")
    print(f"[MOCK SMS] To {phone_number}: your SecureShip verification code is {code}")

    set_pending(str(session.id), code, session.pending_customer_id)

    # Conceptually the session passes through CodeSent before settling on AwaitingCode
    # (Section 6.2) — collapsed into one call since there's no separate "show modal"
    # round-trip yet; the per-turn `event="code_sent"` (set by routes/chat.py) is what
    # tells the frontend to react, not this persisted state.
    session.state = ChatSessionState.AWAITING_CODE
    db.commit()
