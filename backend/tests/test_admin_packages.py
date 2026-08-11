"""Week 4, Chunk D1: Package CRUD through the real /admin/packages routes.

No delete-with-children 409 case here — nothing has a foreign key pointing at
packages.id, so a Package delete can never hit an IntegrityError the way Customer
and Shipment deletes can.
"""


def _package_payload(shipment_id, **overrides):
    payload = {
        "shipment_id": str(shipment_id),
        "description": "Test Item",
        "weight_kg": "1.50",
        "declared_value": "25.00",
    }
    payload.update(overrides)
    return payload


def test_list_packages_includes_tracking_number(client, make_customer, make_shipment, make_package):
    customer = make_customer()
    shipment = make_shipment(customer_id=customer.id, tracking_number="1ZLISTPKG000001")
    package = make_package(shipment_id=shipment.id)

    response = client.get("/admin/packages")

    assert response.status_code == 200
    row = next(row for row in response.json() if row["id"] == str(package.id))
    assert row["tracking_number"] == "1ZLISTPKG000001"
    assert row["shipment_id"] == str(shipment.id)


def test_create_package(client, make_customer, make_shipment):
    customer = make_customer()
    shipment = make_shipment(customer_id=customer.id)

    response = client.post("/admin/packages", json=_package_payload(shipment.id))

    assert response.status_code == 200
    body = response.json()
    assert body["description"] == "Test Item"
    assert body["weight_kg"] == "1.50"
    assert body["declared_value"] == "25.00"
    assert "id" in body


def test_get_package_404s_for_unknown_id(client):
    response = client.get("/admin/packages/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404


def test_update_package(client, make_customer, make_shipment, make_package):
    customer = make_customer()
    shipment = make_shipment(customer_id=customer.id)
    package = make_package(shipment_id=shipment.id)

    response = client.patch(
        f"/admin/packages/{package.id}",
        json=_package_payload(shipment.id, description="Updated Item", weight_kg="3.25"),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["description"] == "Updated Item"
    assert body["weight_kg"] == "3.25"


def test_delete_package(client, make_customer, make_shipment, make_package):
    customer = make_customer()
    shipment = make_shipment(customer_id=customer.id)
    package = make_package(shipment_id=shipment.id)

    delete_response = client.delete(f"/admin/packages/{package.id}")
    get_response = client.get(f"/admin/packages/{package.id}")

    assert delete_response.status_code == 204
    assert get_response.status_code == 404
