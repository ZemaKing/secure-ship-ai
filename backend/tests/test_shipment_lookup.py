"""Unit-level check for lookup_shipments — Epic F3's single enforcement point,
independent of any tool-calling/model plumbing. Confirms two things a spec review
alone can't: two different sessions actually get two different, correctly-scoped
result sets, and the function has no argument path a caller could use to ask for
someone else's data.
"""
import inspect

from models.chat_session import ChatSessionState
from tools.lookup_shipments import lookup_shipments


def test_lookup_shipments_has_no_identifier_parameter():
    # The tool schema offered to the model also carries no parameters at all
    # (tools/schemas.py's LOOKUP_SHIPMENTS_TOOL_SCHEMA) — this asserts the same is
    # true of the Python function itself, so the enforcement holds even against a
    # caller that bypassed the schema and invoked lookup_shipments() directly.
    assert list(inspect.signature(lookup_shipments).parameters) == ["db", "session"]


def test_two_sessions_get_two_different_correctly_scoped_result_sets(
    db_session, make_customer, make_session, make_shipment, make_package
):
    customer_a = make_customer(first_name="Alice")
    customer_b = make_customer(first_name="Bob")

    shipment_a = make_shipment(customer_id=customer_a.id, tracking_number="1ZAAA0000000A")
    make_package(shipment_id=shipment_a.id, description="Alice's item")

    shipment_b1 = make_shipment(customer_id=customer_b.id, tracking_number="1ZBBB0000000B")
    shipment_b2 = make_shipment(customer_id=customer_b.id, tracking_number="1ZBBB0000000C")
    make_package(shipment_id=shipment_b1.id, description="Bob's item 1")
    make_package(shipment_id=shipment_b2.id, description="Bob's item 2")

    session_a = make_session(state=ChatSessionState.VERIFIED, customer_id=customer_a.id)
    session_b = make_session(state=ChatSessionState.VERIFIED, customer_id=customer_b.id)

    results_a = lookup_shipments(db_session, session_a)
    results_b = lookup_shipments(db_session, session_b)

    tracking_numbers_a = {shipment.tracking_number for shipment in results_a}
    tracking_numbers_b = {shipment.tracking_number for shipment in results_b}

    assert tracking_numbers_a == {"1ZAAA0000000A"}
    assert tracking_numbers_b == {"1ZBBB0000000B", "1ZBBB0000000C"}
    # Neither session's result set leaks into the other's.
    assert tracking_numbers_a.isdisjoint(tracking_numbers_b)
