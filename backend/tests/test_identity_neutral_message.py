"""Epic B3: a mismatched identity always gets the same neutral wording, never a
hint about which field(s) were wrong — that hint is exactly what a user-enumeration
leak would look like.
"""
from routes.chat import NEUTRAL_IDENTITY_MESSAGE
from tools.verify_identity import IdentityStatus, verify_identity


def test_rejection_status_is_identical_regardless_of_which_field_mismatched(
    db_session, make_customer, make_session
):
    customer = make_customer(
        first_name="Ivana",
        last_name="Kovac",
        phone_number="+15551230000",
        address="42 Test Ave, Testville, TS 00000",
    )

    single_field_mismatches = [
        {"first_name": "Wrong", "last_name": customer.last_name, "phone_number": customer.phone_number, "address": customer.address},
        {"first_name": customer.first_name, "last_name": "Wrong", "phone_number": customer.phone_number, "address": customer.address},
        {"first_name": customer.first_name, "last_name": customer.last_name, "phone_number": "+19995550000", "address": customer.address},
        {"first_name": customer.first_name, "last_name": customer.last_name, "phone_number": customer.phone_number, "address": "Somewhere else entirely"},
    ]

    for fields in single_field_mismatches:
        session = make_session()
        outcome = verify_identity(db_session, session, **fields)

        assert outcome.status == IdentityStatus.REJECTED
        assert outcome.customer_id is None

    # routes/chat.py has exactly one constant string for any REJECTED outcome — no
    # per-field branching exists to leak which field(s) were wrong. Pinned here so a
    # future edit can't quietly make the wording conditional.
    assert NEUTRAL_IDENTITY_MESSAGE == "We couldn't verify that information — could you double check and try again?"


def test_matching_all_four_fields_case_insensitively_succeeds(db_session, make_customer, make_session):
    customer = make_customer(
        first_name="Ivana",
        last_name="Kovac",
        phone_number="+15551230000",
        address="42 Test Ave, Testville, TS 00000",
    )
    session = make_session()

    outcome = verify_identity(
        db_session,
        session,
        first_name="IVANA",
        last_name="kovac",
        phone_number=customer.phone_number,
        address=customer.address.upper(),
    )

    assert outcome.status == IdentityStatus.MATCHED
    assert outcome.customer_id == customer.id
