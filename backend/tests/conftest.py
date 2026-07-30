"""Shared test fixtures.

Runs against the real dev Postgres (`DATABASE_URL` in `backend/.env`) rather than a
second, SQLite-flavored test database — this project's models lean on Postgres-only
column types (JSONB, native enums), and DEV_PLAN.md's locked decision is Postgres-only,
no second datastore. Each test gets its own connection + transaction that's rolled back
on teardown, so nothing written here ever lands permanently, no separate test DB or
truncate step needed. Requires the dev Postgres to be up and already migrated
(`alembic upgrade head`) — same precondition every other verification step in this
project has always had.
"""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from db.session import engine
from models.chat_session import ChatSession, ChatSessionState
from models.customer import Customer
from services import verification_store


@pytest.fixture()
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture(autouse=True)
def _clear_verification_store():
    # The 2FA code store is a module-level dict (services/verification_store.py) —
    # global, mutable, process-lifetime state that outlives any one test's DB
    # transaction. Cleared on both sides so a failed test never leaks a pending code
    # into the next one.
    verification_store._store.clear()
    yield
    verification_store._store.clear()


@pytest.fixture()
def make_customer(db_session):
    def _make(**overrides):
        unique_suffix = uuid.uuid4().hex[:7]
        defaults = {
            "first_name": "Test",
            "last_name": "Customer",
            "phone_number": f"+1555{unique_suffix}",
            "address": f"1 Test Way #{unique_suffix}, Testville, TS 00000",
        }
        defaults.update(overrides)
        customer = Customer(**defaults)
        db_session.add(customer)
        db_session.commit()
        return customer

    return _make


@pytest.fixture()
def make_session(db_session):
    def _make(**overrides):
        defaults = {
            "state": ChatSessionState.ANONYMOUS,
            "started_at": datetime.now(timezone.utc),
            "transcript": [],
        }
        defaults.update(overrides)
        session = ChatSession(**defaults)
        db_session.add(session)
        db_session.commit()
        return session

    return _make
