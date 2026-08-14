"""Customer CRUD through the real /admin/customers routes.

Uses FastAPI's TestClient against the real main.app (same pattern as test_admin_auth.py).
The `client` fixture (get_current_admin + get_db overrides)
lives in conftest.py — extracted there once test_admin_shipments.py needed the identical thing.
"""
def _customer_payload(**overrides):
    payload = {
        "first_name": "Test",
        "last_name": "Customer",
        "phone_number": "+15551234567",
        "address": "1 Test Way, Testville, TS 00000",
    }
    payload.update(overrides)
    return payload


def test_list_customers_returns_seeded_rows(client, make_customer):
    a = make_customer(first_name="Alice")
    b = make_customer(first_name="Bob")

    response = client.get("/admin/customers")

    assert response.status_code == 200
    ids = {row["id"] for row in response.json()}
    assert {str(a.id), str(b.id)} <= ids


def test_create_customer(client):
    response = client.post("/admin/customers", json=_customer_payload(first_name="Nova"))

    assert response.status_code == 200
    body = response.json()
    assert body["first_name"] == "Nova"
    assert "id" in body


def test_get_customer_404s_for_unknown_id(client):
    response = client.get("/admin/customers/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404


def test_update_customer(client, make_customer):
    customer = make_customer(first_name="Old")

    response = client.patch(
        f"/admin/customers/{customer.id}",
        json=_customer_payload(first_name="New"),
    )

    assert response.status_code == 200
    assert response.json()["first_name"] == "New"


def test_delete_customer_with_no_shipments(client, make_customer):
    customer = make_customer()

    delete_response = client.delete(f"/admin/customers/{customer.id}")
    get_response = client.get(f"/admin/customers/{customer.id}")

    assert delete_response.status_code == 204
    assert get_response.status_code == 404


def test_delete_customer_with_shipments_returns_409_not_500(client, make_customer, make_shipment):
    customer = make_customer()
    make_shipment(customer_id=customer.id)

    delete_response = client.delete(f"/admin/customers/{customer.id}")
    get_response = client.get(f"/admin/customers/{customer.id}")

    assert delete_response.status_code == 409
    # The failed delete must not have partially applied — the customer is still there.
    assert get_response.status_code == 200
