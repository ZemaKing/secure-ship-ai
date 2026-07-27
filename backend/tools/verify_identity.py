import enum
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.chat_session import ChatSession
from models.customer import Customer
from tools.schemas import IDENTITY_FIELDS


class IdentityStatus(str, enum.Enum):
    PARTIAL = "partial"
    REJECTED = "rejected"
    MATCHED = "matched"


@dataclass
class IdentityOutcome:
    status: IdentityStatus
    customer_id: UUID | None = None


def verify_identity(
    db: Session,
    session: ChatSession,
    first_name: str | None = None,
    last_name: str | None = None,
    phone_number: str | None = None,
    address: str | None = None,
) -> IdentityOutcome:
    """Merge whatever identity fields were just given into `session.pending_identity`,
    then attempt a `Customer` match only once all four fields are present.

    This is the single place that writes `pending_identity` or reads `Customer` —
    the model only ever supplies these four fields, never a `customer_id` directly
    (the same enforcement shape Week 3's `lookup_shipments` tool will rely on).
    """
    given = {"first_name": first_name, "last_name": last_name, "phone_number": phone_number, "address": address}
    pending = dict(session.pending_identity or {})
    pending.update({field: value for field, value in given.items() if value})
    session.pending_identity = pending
    db.commit()

    if not all(pending.get(field) for field in IDENTITY_FIELDS):
        return IdentityOutcome(status=IdentityStatus.PARTIAL)

    customer = (
        db.query(Customer)
        .filter(
            func.lower(Customer.first_name) == pending["first_name"].lower(),
            func.lower(Customer.last_name) == pending["last_name"].lower(),
            func.lower(Customer.phone_number) == pending["phone_number"].lower(),
            func.lower(Customer.address) == pending["address"].lower(),
        )
        .first()
    )
    if customer is None:
        return IdentityOutcome(status=IdentityStatus.REJECTED)

    session.pending_customer_id = customer.id
    db.commit()
    return IdentityOutcome(status=IdentityStatus.MATCHED, customer_id=customer.id)
