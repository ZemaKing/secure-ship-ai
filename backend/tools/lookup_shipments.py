from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from models.chat_session import ChatSession
from models.package import Package
from models.shipment import Shipment


@dataclass
class PackageInfo:
    id: str
    description: str
    weight_kg: Decimal
    declared_value: Decimal


@dataclass
class ShipmentInfo:
    tracking_number: str
    carrier: str
    origin: str
    destination: str
    status: str
    estimated_delivery: date
    last_update: datetime
    packages: list[PackageInfo]


def lookup_shipments(db: Session, session: ChatSession) -> list[ShipmentInfo]:
    """Returns every shipment belonging to the session's own verified customer.

    `session.customer_id` — set only by `check_verification_code` on a successful 2FA
    match — is the sole identifier this query ever scopes by. There is no parameter
    here a model or client could supply to reach another customer's shipments (Epic
    F3's single enforcement point; see also `VERIFY_IDENTITY_TOOL_SCHEMA`'s sibling
    reasoning for why the tool schema itself carries no such argument either).
    """
    # Epic F3 — the single enforcement point: scoped only to this session's own,
    # server-set session.customer_id. Never a tool-call argument or request field —
    # there is none, by design (see LOOKUP_SHIPMENTS_TOOL_SCHEMA's empty parameters).
    shipments = db.query(Shipment).filter(Shipment.customer_id == session.customer_id).all()

    results = []
    for shipment in shipments:
        packages = db.query(Package).filter(Package.shipment_id == shipment.id).all()
        results.append(
            ShipmentInfo(
                tracking_number=shipment.tracking_number,
                carrier=shipment.carrier,
                origin=shipment.origin,
                destination=shipment.destination,
                status=shipment.status.value,
                estimated_delivery=shipment.estimated_delivery,
                last_update=shipment.last_update,
                packages=[
                    PackageInfo(
                        id=str(package.id),
                        description=package.description,
                        weight_kg=package.weight_kg,
                        declared_value=package.declared_value,
                    )
                    for package in packages
                ],
            )
        )
    return results
