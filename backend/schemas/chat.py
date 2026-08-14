from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


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
    # min_length=1 rejects an empty message at the HTTP boundary (422) rather than
    # forwarding it to Ollama — the frontend already guards against this (ChatWindow's
    # handleSubmit trims and no-ops on empty input), but the backend shouldn't rely on
    # that alone, same reasoning as every other gate in this app.
    message: str = Field(min_length=1)
    session_id: str | None = None


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    state: str
    event: str | None = None  # e.g. "code_sent", "escalated"
    escalation: EscalationPayload | None = None
    shipments: list[ShipmentPayload] | None = None  # populated on a real lookup_shipments() result
    verified_customer_name: str | None = None  # only set once session.customer_id is real, i.e. Verified+
