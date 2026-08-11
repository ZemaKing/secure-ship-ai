import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth.dependencies import get_current_admin
from db.session import get_db
from schemas.admin import AdminMeResponse, CustomerCreate, CustomerOut, CustomerUpdate, ErrorDetail
from services import admin_customers

# Epic E3 — a single router-level dependency is the one auditable enforcement point
# for every /admin/* route, mirroring the Epic F3 philosophy already used for
# lookup_shipments: one place to point to, not scattered per-route checks.
router = APIRouter(prefix="/admin", dependencies=[Depends(get_current_admin)])


@router.get("/me", operation_id="adminMe")
def admin_me(claims: dict = Depends(get_current_admin)) -> AdminMeResponse:
    return AdminMeResponse(sub=claims["sub"], email=claims.get("email"))


def _to_customer_out(customer) -> CustomerOut:
    return CustomerOut(
        id=customer.id,
        first_name=customer.first_name,
        last_name=customer.last_name,
        phone_number=customer.phone_number,
        address=customer.address,
    )


def _get_customer_or_404(db: Session, customer_id: uuid.UUID):
    customer = admin_customers.get_customer(db, customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.get("/customers", operation_id="listCustomers")
def list_customers(db: Session = Depends(get_db)) -> list[CustomerOut]:
    return [_to_customer_out(customer) for customer in admin_customers.list_customers(db)]


@router.post("/customers", operation_id="createCustomer")
def create_customer(data: CustomerCreate, db: Session = Depends(get_db)) -> CustomerOut:
    return _to_customer_out(admin_customers.create_customer(db, data))


@router.get("/customers/{customer_id}", operation_id="getCustomer")
def get_customer(customer_id: uuid.UUID, db: Session = Depends(get_db)) -> CustomerOut:
    return _to_customer_out(_get_customer_or_404(db, customer_id))


@router.patch("/customers/{customer_id}", operation_id="updateCustomer")
def update_customer(customer_id: uuid.UUID, data: CustomerUpdate, db: Session = Depends(get_db)) -> CustomerOut:
    customer = _get_customer_or_404(db, customer_id)
    return _to_customer_out(admin_customers.update_customer(db, customer, data))


@router.delete(
    "/customers/{customer_id}",
    operation_id="deleteCustomer",
    status_code=204,
    responses={409: {"model": ErrorDetail, "description": "Customer has existing shipments"}},
)
def delete_customer(customer_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    customer = _get_customer_or_404(db, customer_id)
    try:
        admin_customers.delete_customer(db, customer)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This customer has existing shipments and can't be deleted.",
        )
