import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from models.shipment import Shipment
from schemas.admin import ShipmentCreate, ShipmentUpdate


def list_shipments(db: Session) -> list[Shipment]:
    return db.query(Shipment).order_by(Shipment.last_update.desc()).all()


def get_shipment(db: Session, shipment_id: uuid.UUID) -> Shipment | None:
    return db.query(Shipment).filter(Shipment.id == shipment_id).first()


def create_shipment(db: Session, data: ShipmentCreate) -> Shipment:
    shipment = Shipment(**data.model_dump(), last_update=datetime.now(timezone.utc))
    db.add(shipment)
    db.commit()
    db.refresh(shipment)
    return shipment


def update_shipment(db: Session, shipment: Shipment, data: ShipmentUpdate) -> Shipment:
    # Partial merge — only fields the caller actually set are touched, so the
    # Shipments table's status-only row action doesn't clobber the rest of the
    # record with stale/default values (unlike admin_customers.update_customer's
    # full-replace shape, which is fine there since Customer edits always resubmit
    # every field from the form).
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(shipment, field, value)
    shipment.last_update = datetime.now(timezone.utc)
    db.commit()
    db.refresh(shipment)
    return shipment


def delete_shipment(db: Session, shipment: Shipment) -> None:
    # Same shape as admin_customers.delete_customer — no try/except here,
    # routes/admin.py is the one place that catches IntegrityError (a Shipment with
    # Package rows) and maps it to a 409.
    db.delete(shipment)
    db.commit()
