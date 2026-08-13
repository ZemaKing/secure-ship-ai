"""Week 5 stretch: the admin chat session viewer, through the real /admin/sessions
routes. Read-only — no create/update/delete route exists at all, unlike every other
admin entity (see test_admin_chat_separation.py's test_admin_sessions_is_read_only for
the structural proof of that). Covers the two things unique to this entity: resolving
a visitor's display name/phone from either a verified Customer or pending_identity
(never a raw customer_id), and the transcript-detail view.
"""


def test_list_sessions_resolves_a_verified_customers_name_and_phone(client, make_customer, make_session):
    from models.chat_session import ChatSessionState

    customer = make_customer(first_name="Nova", last_name="Star", phone_number="+15559999")
    session = make_session(state=ChatSessionState.VERIFIED, customer_id=customer.id)

    response = client.get("/admin/sessions")

    assert response.status_code == 200
    row = next(row for row in response.json() if row["id"] == str(session.id))
    assert row["visitor_name"] == "Nova Star"
    assert row["phone_number"] == "+15559999"
    assert row["state"] == "verified"


def test_list_sessions_resolves_a_partial_visitor_from_pending_identity(client, make_session):
    session = make_session(pending_identity={"first_name": "Nova", "phone_number": "+15559999"})

    response = client.get("/admin/sessions")

    row = next(row for row in response.json() if row["id"] == str(session.id))
    assert row["visitor_name"] == "Nova"
    assert row["phone_number"] == "+15559999"


def test_list_sessions_shows_no_name_for_a_fully_anonymous_session(client, make_session):
    session = make_session()

    response = client.get("/admin/sessions")

    row = next(row for row in response.json() if row["id"] == str(session.id))
    assert row["visitor_name"] is None
    assert row["phone_number"] is None


def test_list_sessions_includes_a_message_count(client, make_session):
    session = make_session(
        transcript=[
            {"role": "user", "content": "hi", "timestamp": "2030-01-01T00:00:00Z"},
            {"role": "assistant", "content": "hello", "timestamp": "2030-01-01T00:00:01Z"},
        ]
    )

    response = client.get("/admin/sessions")

    row = next(row for row in response.json() if row["id"] == str(session.id))
    assert row["message_count"] == 2


def test_get_session_detail_includes_the_full_transcript(client, make_session):
    session = make_session(
        transcript=[{"role": "user", "content": "Where is my package?", "timestamp": "2030-01-01T00:00:00Z"}]
    )

    response = client.get(f"/admin/sessions/{session.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["transcript"] == [
        {"role": "user", "content": "Where is my package?", "timestamp": "2030-01-01T00:00:00Z"}
    ]


def test_get_session_404s_for_unknown_id(client):
    response = client.get("/admin/sessions/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404


def test_sessions_route_has_no_write_verbs(client, make_session):
    session = make_session()

    assert client.post("/admin/sessions", json={}).status_code == 405
    assert client.patch(f"/admin/sessions/{session.id}", json={}).status_code == 405
    assert client.delete(f"/admin/sessions/{session.id}").status_code == 405
