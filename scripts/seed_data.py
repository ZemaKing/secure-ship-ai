"""Seed Postgres with mock customers, shipments, and packages for local dev/demo use."""

import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from db.session import SessionLocal  # noqa: E402
from models import Customer, Package, Shipment  # noqa: E402
from models.shipment import ShipmentStatus  # noqa: E402

# Mixed English/US, Serbian, and Russian names — a nod to a realistically international customer base.
FIRST_NAMES = [
    # English/US
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
    "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    # Serbian
    "Milos", "Ana", "Nikola", "Jovana", "Stefan", "Marija", "Aleksandar", "Milica",
    "Petar", "Jelena", "Nemanja", "Ivana", "Dusan", "Tamara", "Vladimir", "Sofija",
    # Russian
    "Ivan", "Olga", "Dmitri", "Ekaterina", "Sergei", "Natalia", "Alexei", "Svetlana",
    "Nikolai", "Anastasia", "Mikhail", "Tatiana", "Andrei", "Irina", "Viktor", "Yulia",
]

LAST_NAMES = [
    # English/US
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Wilson", "Anderson", "Taylor", "Moore", "Jackson",
    # Serbian
    "Jovanovic", "Petrovic", "Nikolic", "Markovic", "Djordjevic", "Stojanovic",
    "Ilic", "Stankovic", "Pavlovic", "Milosevic", "Popovic", "Simic",
    # Russian
    "Ivanov", "Petrov", "Smirnov", "Kuznetsov", "Volkov", "Sokolov",
    "Popov", "Fedorov", "Morozov", "Novikov", "Egorov", "Orlov",
]

STREET_NAMES = [
    "Main St", "Oak Ave", "Maple Dr", "Cedar Ln", "Elm St", "Park Ave", "Pine St",
    "Washington Blvd", "Lake Shore Dr", "River Rd", "Hillcrest Ave", "Sunset Blvd",
]

CITIES = [
    ("Chicago", "IL"), ("Austin", "TX"), ("Denver", "CO"), ("Seattle", "WA"),
    ("Boston", "MA"), ("Atlanta", "GA"), ("Phoenix", "AZ"), ("Portland", "OR"),
    ("Miami", "FL"), ("Nashville", "TN"),
]

CARRIERS = ["UPS", "FedEx", "USPS", "DHL"]

PACKAGE_DESCRIPTIONS = [
    "Running shoes", "Wireless headphones", "Coffee maker", "Laptop bag",
    "Desk lamp", "Board game", "Yoga mat", "Kitchen knife set",
    "Bluetooth speaker", "Winter jacket", "Phone case", "Backpack",
]

# Mostly in_transit/delivered, a few exception, per the seed spec.
STATUS_WEIGHTS = [
    (ShipmentStatus.DELIVERED, 40),
    (ShipmentStatus.IN_TRANSIT, 30),
    (ShipmentStatus.OUT_FOR_DELIVERY, 15),
    (ShipmentStatus.LABEL_CREATED, 10),
    (ShipmentStatus.EXCEPTION, 5),
]


def random_phone_number() -> str:
    return f"+1{random.randint(2000000000, 9999999999)}"


def random_address() -> str:
    city, state = random.choice(CITIES)
    return f"{random.randint(100, 9999)} {random.choice(STREET_NAMES)}, {city}, {state} {random.randint(10000, 99999)}"


def random_status() -> ShipmentStatus:
    statuses, weights = zip(*STATUS_WEIGHTS)
    return random.choices(statuses, weights=weights, k=1)[0]


def random_tracking_number() -> str:
    return f"1Z{uuid.uuid4().hex[:14].upper()}"


def build_customers(count: int) -> list[Customer]:
    return [
        Customer(
            first_name=random.choice(FIRST_NAMES),
            last_name=random.choice(LAST_NAMES),
            phone_number=random_phone_number(),
            address=random_address(),
        )
        for _ in range(count)
    ]


def build_shipment(customer: Customer) -> Shipment:
    status = random_status()
    last_update = datetime.now(timezone.utc) - timedelta(days=random.randint(0, 10))
    estimated_delivery = (last_update + timedelta(days=random.randint(1, 7))).date()
    origin_city, origin_state = random.choice(CITIES)
    dest_city, dest_state = random.choice(CITIES)
    return Shipment(
        customer_id=customer.id,
        tracking_number=random_tracking_number(),
        status=status,
        carrier=random.choice(CARRIERS),
        origin=f"{origin_city}, {origin_state}",
        destination=f"{dest_city}, {dest_state}",
        estimated_delivery=estimated_delivery,
        last_update=last_update,
    )


def build_packages(shipment: Shipment) -> list[Package]:
    return [
        Package(
            shipment_id=shipment.id,
            description=random.choice(PACKAGE_DESCRIPTIONS),
            weight_kg=Decimal(str(round(random.uniform(0.2, 15.0), 2))),
            declared_value=Decimal(str(round(random.uniform(10.0, 500.0), 2))),
        )
        for _ in range(random.randint(1, 3))
    ]


def seed() -> None:
    customer_count = random.randint(25, 30)
    shipment_count = random.randint(40, 60)

    db = SessionLocal()
    try:
        customers = build_customers(customer_count)
        db.add_all(customers)
        db.flush()  # assigns customer IDs without committing yet

        shipments = [build_shipment(random.choice(customers)) for _ in range(shipment_count)]
        db.add_all(shipments)
        db.flush()  # assigns shipment IDs

        packages = [package for shipment in shipments for package in build_packages(shipment)]
        db.add_all(packages)

        db.commit()

        print(f"Seeded {len(customers)} customers, {len(shipments)} shipments, {len(packages)} packages.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
