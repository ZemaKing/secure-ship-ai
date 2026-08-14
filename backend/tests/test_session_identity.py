"""The actual point: chat sessions are per-client, not a shared singleton."""
from routes.chat import _get_or_create_session


def test_two_sessions_without_an_id_are_distinct(db_session):
    first = _get_or_create_session(db_session, None)
    db_session.commit()
    second = _get_or_create_session(db_session, None)
    db_session.commit()

    assert first.id != second.id


def test_an_existing_session_id_resumes_that_exact_row(db_session, make_session):
    original = make_session()

    resumed = _get_or_create_session(db_session, str(original.id))

    assert resumed.id == original.id


def test_pending_identity_never_bleeds_between_sessions(db_session):
    session_a = _get_or_create_session(db_session, None)
    session_a.pending_identity = {"first_name": "Alice"}
    db_session.commit()

    session_b = _get_or_create_session(db_session, None)
    session_b.pending_identity = {"first_name": "Bob"}
    db_session.commit()

    resumed_a = _get_or_create_session(db_session, str(session_a.id))
    resumed_b = _get_or_create_session(db_session, str(session_b.id))

    assert resumed_a.pending_identity == {"first_name": "Alice"}
    assert resumed_b.pending_identity == {"first_name": "Bob"}
