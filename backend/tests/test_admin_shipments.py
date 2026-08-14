"""Shipment CRUD through the real /admin/shipments routes, plus
the status-update proof the live demo gesture depends on — that a status
change made through the admin CRUD path is what a verified chat session's real
lookup_shipments() tool call sees on its very next call, since both read/write the
same Postgres rows.
"""
from datetime import date

from models.chat_session import ChatSessionState
from models.shipment import ShipmentStatus
from schemas.admin import ShipmentUpdate
from services import admin_shipments
from tools.lookup_shipments import lookup_shipments


def _shipment_payload(customer_id, **overrides):
    payload = {
        "customer_id": str(customer_id),
        "tracking_number": "1ZTEST0000000001",
        "status": "in_transit",
        "carrier": "Test Carrier",
        "origin": "Testville, TS",
        "destination": "Otherville, OS",
        "estimated_delivery": "2030-01-01",
    }
    payload.update(overrides)
    return payload


def test_list_shipments_includes_customer_name(client, make_customer, make_shipment):
    customer = make_customer(first_name="Nova", last_name="Star")
    shipment = make_shipment(customer_id=customer.id, tracking_number="1ZLIST0000000001")

    response = client.get("/admin/shipments")

    assert response.status_code == 200
    row = next(row for row in response.json() if row["id"] == str(shipment.id))
    assert row["customer_name"] == "Nova Star"
    assert row["customer_id"] == str(customer.id)


def test_create_shipment(client, make_customer):
    customer = make_customer()

    response = client.post("/admin/shipments", json=_shipment_payload(customer.id))

    assert response.status_code == 200
    body = response.json()
    assert body["tracking_number"] == "1ZTEST0000000001"
    assert body["status"] == "in_transit"
    assert "id" in body


def test_get_shipment_404s_for_unknown_id(client):
    response = client.get("/admin/shipments/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404


def test_update_shipment_full(client, make_customer, make_shipment):
    customer = make_customer()
    shipment = make_shipment(customer_id=customer.id)

    response = client.patch(
        f"/admin/shipments/{shipment.id}",
        json=_shipment_payload(customer.id, tracking_number="1ZUPDATED000001", status="delivered"),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tracking_number"] == "1ZUPDATED000001"
    assert body["status"] == "delivered"


def test_update_shipment_status_only_leaves_other_fields_untouched(client, make_customer, make_shipment):
    customer = make_customer()
    shipment = make_shipment(
        customer_id=customer.id,
        tracking_number="1ZSTATUSONLY0001",
        carrier="Original Carrier",
        status=ShipmentStatus.IN_TRANSIT,
    )

    # The exact shape the status-dropdown row action sends — just the one field,
    # not a full re-submission of the record.
    response = client.patch(f"/admin/shipments/{shipment.id}", json={"status": "delivered"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "delivered"
    assert body["tracking_number"] == "1ZSTATUSONLY0001"
    assert body["carrier"] == "Original Carrier"


def test_delete_shipment_with_no_packages(client, make_customer, make_shipment):
    customer = make_customer()
    shipment = make_shipment(customer_id=customer.id)

    delete_response = client.delete(f"/admin/shipments/{shipment.id}")
    get_response = client.get(f"/admin/shipments/{shipment.id}")

    assert delete_response.status_code == 204
    assert get_response.status_code == 404


def test_delete_shipment_with_packages_returns_409_not_500(client, make_customer, make_shipment, make_package):
    customer = make_customer()
    shipment = make_shipment(customer_id=customer.id)
    make_package(shipment_id=shipment.id)

    delete_response = client.delete(f"/admin/shipments/{shipment.id}")
    get_response = client.get(f"/admin/shipments/{shipment.id}")

    assert delete_response.status_code == 409
    # The failed delete must not have partially applied.
    assert get_response.status_code == 200


def test_status_update_via_admin_is_what_lookup_shipments_returns_next(
    db_session, make_customer, make_shipment, make_session
):
    """The actual proof behind the live demo gesture: update a shipment's
    status through the admin CRUD path, then ask the exact same question
    lookup_shipments() answers for a verified chat session — they must agree,
    because both read the same Postgres row, not a cache or a snapshot.
    """
    customer = make_customer()
    shipment = make_shipment(customer_id=customer.id, status=ShipmentStatus.IN_TRANSIT)

    admin_shipments.update_shipment(
        db_session, shipment, ShipmentUpdate(status=ShipmentStatus.DELIVERED)
    )

    verified_session = make_session(state=ChatSessionState.VERIFIED, customer_id=customer.id)
    results = lookup_shipments(db_session, verified_session)

    assert len(results) == 1
    assert results[0].tracking_number == shipment.tracking_number
    assert results[0].status == "delivered"
