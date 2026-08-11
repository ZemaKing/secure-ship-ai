import uuid

from sqlalchemy.orm import Session

from models.customer import Customer
from schemas.admin import CustomerCreate, CustomerUpdate


def list_customers(db: Session) -> list[Customer]:
    return db.query(Customer).order_by(Customer.last_name, Customer.first_name).all()


def get_customer(db: Session, customer_id: uuid.UUID) -> Customer | None:
    return db.query(Customer).filter(Customer.id == customer_id).first()


def create_customer(db: Session, data: CustomerCreate) -> Customer:
    customer = Customer(**data.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


def update_customer(db: Session, customer: Customer, data: CustomerUpdate) -> Customer:
    for field, value in data.model_dump().items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)
    return customer


def delete_customer(db: Session, customer: Customer) -> None:
    # Deliberately no try/except here — a Customer with existing Shipment rows
    # raises IntegrityError on commit (FK constraint), and routes/admin.py is the
    # one place that catches it and maps it to a 409, same "let the route layer own
    # the HTTP-status decision" shape as routes/verify.py's 404 handling.
    db.delete(customer)
    db.commit()
