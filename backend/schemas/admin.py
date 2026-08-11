import uuid

from pydantic import BaseModel


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
