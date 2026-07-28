import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.session import get_db
from models.chat_session import ChatSession
from schemas.verify import VerifyCodeRequest, VerifyCodeResponse
from tools.check_verification_code import VerifyStatus, check_verification_code

router = APIRouter()

CODE_MATCH_MESSAGE = "You're verified! How can I help with your shipment?"
CODE_MISMATCH_MESSAGE = "That code doesn't match — please try again."
CODE_EXPIRED_MESSAGE = "That code has expired — let's verify your identity again to get a new one."
CODE_LOCKED_OUT_MESSAGE = "Too many incorrect attempts — let's verify your identity again to get a new code."


def _get_session_or_404(db: Session, session_id: str) -> ChatSession:
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")

    session = db.query(ChatSession).filter(ChatSession.id == session_uuid, ChatSession.ended_at.is_(None)).first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/verify-code", operation_id="verifyCode")
def verify_code(request: VerifyCodeRequest, db: Session = Depends(get_db)) -> VerifyCodeResponse:
    session = _get_session_or_404(db, request.session_id)
    outcome = check_verification_code(db, session, request.code)

    if outcome.status == VerifyStatus.MATCH:
        reply, success, attempts_remaining = CODE_MATCH_MESSAGE, True, None
    elif outcome.status == VerifyStatus.MISMATCH:
        reply, success, attempts_remaining = CODE_MISMATCH_MESSAGE, False, outcome.attempts_remaining
    elif outcome.status == VerifyStatus.LOCKED_OUT:
        reply, success, attempts_remaining = CODE_LOCKED_OUT_MESSAGE, False, 0
    else:
        reply, success, attempts_remaining = CODE_EXPIRED_MESSAGE, False, None

    return VerifyCodeResponse(
        session_id=str(session.id),
        success=success,
        reply=reply,
        state=session.state.value,
        attempts_remaining=attempts_remaining,
    )
