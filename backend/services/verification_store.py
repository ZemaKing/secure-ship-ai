"""In-memory 2FA code store — single-process, per DEV_PLAN.md (no Redis/second
datastore for this project). Codes are never written to persistent storage, only
held in this module-level dict for the life of the backend process.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

CODE_TTL_SECONDS = 300  # 5 minutes
MAX_ATTEMPTS = 3  # 3 tries, then lock out — no silent auto-regenerate (see check_verification_code.py)


@dataclass
class PendingVerification:
    code: str
    customer_id: UUID
    expires_at: datetime
    attempts: int = 0


_store: dict[str, PendingVerification] = {}


def set_pending(session_id: str, code: str, customer_id: UUID) -> None:
    _store[session_id] = PendingVerification(
        code=code,
        customer_id=customer_id,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=CODE_TTL_SECONDS),
    )


def get_pending(session_id: str) -> PendingVerification | None:
    return _store.get(session_id)


def increment_attempts(session_id: str) -> int:
    pending = _store.get(session_id)
    if pending is None:
        return 0
    pending.attempts += 1
    return pending.attempts


def clear(session_id: str) -> None:
    _store.pop(session_id, None)
