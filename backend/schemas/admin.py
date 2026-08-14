import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from models.shipment import ShipmentStatus




class AdminMeResponse(BaseModel):
    sub: str
    email: str | None = None


class ErrorDetail(BaseModel):
    """Shared shape for documented non-2xx admin responses (e.g. a 409 on a
    delete-with-children conflict) — reused across Customer/Shipment/Package CRUD
    so Orval generates one typed error shape, not three near-identical ones."""

    detail: str


class CustomerCreate(BaseModel):
    first_name: str
    last_name: str
    phone_number: str
    address: str


class CustomerUpdate(BaseModel):
    first_name: str
    last_name: str
    phone_number: str
    address: str


class CustomerOut(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    phone_number: str
    address: str


class ShipmentCreate(BaseModel):
    customer_id: uuid.UUID
    tracking_number: str
    status: ShipmentStatus
    carrier: str
    origin: str
    destination: str
    estimated_delivery: date


class ShipmentUpdate(BaseModel):
    # All fields optional — a partial update, unlike CustomerUpdate's full-replace
    # shape. Needed for real: the Shipments table's status-dropdown row action
    # sends only {"status": ...}, not a full re-submission of every field, so the
    # backend must only touch what's actually provided — see
    # services/admin_shipments.py's model_dump(exclude_unset=True) merge.
    customer_id: uuid.UUID | None = None
    tracking_number: str | None = None
    status: ShipmentStatus | None = None
    carrier: str | None = None
    origin: str | None = None
    destination: str | None = None
    estimated_delivery: date | None = None


class ShipmentOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: str
    tracking_number: str
    status: ShipmentStatus
    carrier: str
    origin: str
    destination: str
    estimated_delivery: date
    last_update: datetime


class PackageCreate(BaseModel):
    shipment_id: uuid.UUID
    description: str
    weight_kg: Decimal
    declared_value: Decimal


class PackageUpdate(BaseModel):
    # No children hang off a Package (no FKs point at packages.id), so unlike
    # ShipmentUpdate there's no row-action needing a partial merge — full-replace,
    # same shape as CustomerUpdate.
    shipment_id: uuid.UUID
    description: str
    weight_kg: Decimal
    declared_value: Decimal


class PackageOut(BaseModel):
    id: uuid.UUID
    shipment_id: uuid.UUID
    tracking_number: str
    description: str
    weight_kg: Decimal
    declared_value: Decimal


class ChatSessionOut(BaseModel):
    """The admin chat session viewer (read-only). visitor_name/
    phone_number are resolved server-side (services/admin_sessions.py) from either a
    real Customer row (once Verified) or pending_identity (before that) — never a raw
    customer_id exposed for the admin to correlate against Customer records directly,
    same denormalization pattern ShipmentOut/PackageOut already use for their parents.
    """

    id: uuid.UUID
    visitor_name: str | None = None
    phone_number: str | None = None
    state: str
    started_at: datetime
    message_count: int


class ChatTranscriptEntry(BaseModel):
    role: str
    content: str
    timestamp: str


class ChatSessionDetailOut(ChatSessionOut):
    transcript: list[ChatTranscriptEntry]
