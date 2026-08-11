import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth.dependencies import get_current_admin
from db.session import get_db
from schemas.admin import (
    AdminMeResponse,
    CustomerCreate,
    CustomerOut,
    CustomerUpdate,
    ErrorDetail,
    PackageCreate,
    PackageOut,
    PackageUpdate,
    ShipmentCreate,
    ShipmentOut,
    ShipmentUpdate,
)
from services import admin_customers, admin_packages, admin_shipments

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


def _to_shipment_out(db: Session, shipment) -> ShipmentOut:
    customer = admin_customers.get_customer(db, shipment.customer_id)
    customer_name = f"{customer.first_name} {customer.last_name}" if customer is not None else "Unknown customer"
    return ShipmentOut(
        id=shipment.id,
        customer_id=shipment.customer_id,
        customer_name=customer_name,
        tracking_number=shipment.tracking_number,
        status=shipment.status,
        carrier=shipment.carrier,
        origin=shipment.origin,
        destination=shipment.destination,
        estimated_delivery=shipment.estimated_delivery,
        last_update=shipment.last_update,
    )


def _get_shipment_or_404(db: Session, shipment_id: uuid.UUID):
    shipment = admin_shipments.get_shipment(db, shipment_id)
    if shipment is None:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return shipment


@router.get("/shipments", operation_id="listShipments")
def list_shipments(db: Session = Depends(get_db)) -> list[ShipmentOut]:
    return [_to_shipment_out(db, shipment) for shipment in admin_shipments.list_shipments(db)]


@router.post("/shipments", operation_id="createShipment")
def create_shipment(data: ShipmentCreate, db: Session = Depends(get_db)) -> ShipmentOut:
    return _to_shipment_out(db, admin_shipments.create_shipment(db, data))


@router.get("/shipments/{shipment_id}", operation_id="getShipment")
def get_shipment(shipment_id: uuid.UUID, db: Session = Depends(get_db)) -> ShipmentOut:
    return _to_shipment_out(db, _get_shipment_or_404(db, shipment_id))


@router.patch("/shipments/{shipment_id}", operation_id="updateShipment")
def update_shipment(shipment_id: uuid.UUID, data: ShipmentUpdate, db: Session = Depends(get_db)) -> ShipmentOut:
    shipment = _get_shipment_or_404(db, shipment_id)
    return _to_shipment_out(db, admin_shipments.update_shipment(db, shipment, data))


@router.delete(
    "/shipments/{shipment_id}",
    operation_id="deleteShipment",
    status_code=204,
    responses={409: {"model": ErrorDetail, "description": "Shipment has existing packages"}},
)
def delete_shipment(shipment_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    shipment = _get_shipment_or_404(db, shipment_id)
    try:
        admin_shipments.delete_shipment(db, shipment)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This shipment has existing packages and can't be deleted.",
        )


def _to_package_out(db: Session, package) -> PackageOut:
    shipment = admin_shipments.get_shipment(db, package.shipment_id)
    tracking_number = shipment.tracking_number if shipment is not None else "Unknown shipment"
    return PackageOut(
        id=package.id,
        shipment_id=package.shipment_id,
        tracking_number=tracking_number,
        description=package.description,
        weight_kg=package.weight_kg,
        declared_value=package.declared_value,
    )


def _get_package_or_404(db: Session, package_id: uuid.UUID):
    package = admin_packages.get_package(db, package_id)
    if package is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return package


@router.get("/packages", operation_id="listPackages")
def list_packages(db: Session = Depends(get_db)) -> list[PackageOut]:
    return [_to_package_out(db, package) for package in admin_packages.list_packages(db)]


@router.post("/packages", operation_id="createPackage")
def create_package(data: PackageCreate, db: Session = Depends(get_db)) -> PackageOut:
    return _to_package_out(db, admin_packages.create_package(db, data))


@router.get("/packages/{package_id}", operation_id="getPackage")
def get_package(package_id: uuid.UUID, db: Session = Depends(get_db)) -> PackageOut:
    return _to_package_out(db, _get_package_or_404(db, package_id))


@router.patch("/packages/{package_id}", operation_id="updatePackage")
def update_package(package_id: uuid.UUID, data: PackageUpdate, db: Session = Depends(get_db)) -> PackageOut:
    package = _get_package_or_404(db, package_id)
    return _to_package_out(db, admin_packages.update_package(db, package, data))


@router.delete("/packages/{package_id}", operation_id="deletePackage", status_code=204)
def delete_package(package_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    package = _get_package_or_404(db, package_id)
    admin_packages.delete_package(db, package)
