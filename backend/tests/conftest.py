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
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from auth.dependencies import get_current_admin
from db.session import engine, get_db
from main import app
from models.chat_session import ChatSession, ChatSessionState
from models.customer import Customer
from models.package import Package
from models.shipment import Shipment, ShipmentStatus
from services import verification_store


@pytest.fixture()
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    # join_transaction_mode="create_savepoint": SQLAlchemy's documented recipe for
    # joining a Session into an externally-managed transaction (here, the test's
    # own rollback-everything transaction). Without it, code under test calling
    # session.rollback() itself (Week 4, Chunk B's delete-with-children 409 handler
    # is the first path that does) rolls back to the very start of the connection's
    # transaction — wiping out this test's own fixture data, not just the failed
    # operation. With it, commit()/rollback() inside the tested code only
    # ends/restarts a SAVEPOINT, leaving the outer test transaction untouched.
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db_session):
    # Extracted from test_admin_customers.py (Week 4, Chunk B) once
    # test_admin_shipments.py (Chunk C) needed the identical thing — overrides both
    # get_current_admin (bypass real Auth0) and get_db (route the app's own
    # dependency onto this test's transactional db_session, so TestClient requests
    # don't open a second, real, uncontrolled SessionLocal() connection).
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_admin] = lambda: {"sub": "auth0|test-admin", "email": "admin@example.com"}
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_admin, None)


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


@pytest.fixture()
def make_shipment(db_session):
    def _make(**overrides):
        unique_suffix = uuid.uuid4().hex[:14].upper()
        defaults = {
            "tracking_number": f"1Z{unique_suffix}",
            "status": ShipmentStatus.IN_TRANSIT,
            "carrier": "Test Carrier",
            "origin": "Testville, TS",
            "destination": "Otherville, OS",
            "estimated_delivery": date(2030, 1, 1),
            "last_update": datetime.now(timezone.utc),
        }
        defaults.update(overrides)
        shipment = Shipment(**defaults)
        db_session.add(shipment)
        db_session.commit()
        return shipment

    return _make


@pytest.fixture()
def make_package(db_session):
    def _make(**overrides):
        defaults = {
            "description": "Test Item",
            "weight_kg": Decimal("1.00"),
            "declared_value": Decimal("10.00"),
        }
        defaults.update(overrides)
        package = Package(**defaults)
        db_session.add(package)
        db_session.commit()
        return package

    return _make
