from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class EscalationPayload(BaseModel):
    lines: list[str]
    agent_name: str
    first_name: str | None = None


class ShipmentPackagePayload(BaseModel):
    id: str
    description: str
    weight_kg: Decimal
    declared_value: Decimal


class ShipmentPayload(BaseModel):
    tracking_number: str
    carrier: str
    origin: str
    destination: str
    status: str
    estimated_delivery: date
    last_update: datetime
    packages: list[ShipmentPackagePayload]


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    state: str
    event: str | None = None  # e.g. "code_sent", "escalated"
    escalation: EscalationPayload | None = None
    shipments: list[ShipmentPayload] | None = None  # populated on a real lookup_shipments() result (Week 3, Chunk C)
