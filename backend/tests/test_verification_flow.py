"""Chunk D's 2FA store: 3 wrong attempts locks out, a correct code verifies, and an
expired code is rejected even if it's otherwise correct — no silent auto-regenerate
on any of the three exit paths (DEV_PLAN.md's explicit ask: pick and document the
numbers, which live in services/verification_store.py as CODE_TTL_SECONDS/MAX_ATTEMPTS).
"""
from datetime import datetime, timedelta, timezone

import tools.check_verification_code as check_verification_code_module
from models.chat_session import ChatSessionState
from services.verification_store import CODE_TTL_SECONDS, get_pending
from tools.check_verification_code import VerifyStatus, check_verification_code
from tools.send_verification_code import send_verification_code


def _start_awaiting_code(make_customer, make_session):
    customer = make_customer()
    session = make_session(
        pending_customer_id=customer.id,
        pending_identity={"phone_number": customer.phone_number},
    )
    return customer, session


def test_three_wrong_attempts_locks_out(db_session, make_customer, make_session):
    customer, session = _start_awaiting_code(make_customer, make_session)
    send_verification_code(db_session, session)
    real_code = get_pending(str(session.id)).code
    wrong_code = "000000" if real_code != "000000" else "111111"

    first = check_verification_code(db_session, session, wrong_code)
    assert first.status == VerifyStatus.MISMATCH
    assert first.attempts_remaining == 2

    second = check_verification_code(db_session, session, wrong_code)
    assert second.status == VerifyStatus.MISMATCH
    assert second.attempts_remaining == 1

    third = check_verification_code(db_session, session, wrong_code)
    assert third.status == VerifyStatus.LOCKED_OUT
    assert session.state == ChatSessionState.COLLECTING_IDENTITY
    assert get_pending(str(session.id)) is None


def test_correct_code_verifies_the_session(db_session, make_customer, make_session):
    customer, session = _start_awaiting_code(make_customer, make_session)
    send_verification_code(db_session, session)
    real_code = get_pending(str(session.id)).code

    outcome = check_verification_code(db_session, session, real_code)

    assert outcome.status == VerifyStatus.MATCH
    assert session.customer_id == customer.id
    assert session.state == ChatSessionState.VERIFIED
    assert session.pending_customer_id is None
    assert session.pending_identity is None
    assert get_pending(str(session.id)) is None


def test_expired_code_is_rejected_even_if_correct(db_session, make_customer, make_session, monkeypatch):
    customer, session = _start_awaiting_code(make_customer, make_session)
    send_verification_code(db_session, session)
    real_code = get_pending(str(session.id)).code
    real_now = datetime.now(timezone.utc)

    class _FutureDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return real_now + timedelta(seconds=CODE_TTL_SECONDS + 10)

    monkeypatch.setattr(check_verification_code_module, "datetime", _FutureDatetime)

    outcome = check_verification_code(db_session, session, real_code)

    assert outcome.status == VerifyStatus.EXPIRED
    assert session.state == ChatSessionState.COLLECTING_IDENTITY
    assert get_pending(str(session.id)) is None
