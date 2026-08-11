import uuid

from sqlalchemy.orm import Session

from models.package import Package
from schemas.admin import PackageCreate, PackageUpdate


def list_packages(db: Session) -> list[Package]:
    return db.query(Package).order_by(Package.description).all()


def get_package(db: Session, package_id: uuid.UUID) -> Package | None:
    return db.query(Package).filter(Package.id == package_id).first()


def create_package(db: Session, data: PackageCreate) -> Package:
    package = Package(**data.model_dump())
    db.add(package)
    db.commit()
    db.refresh(package)
    return package


def update_package(db: Session, package: Package, data: PackageUpdate) -> Package:
    for field, value in data.model_dump().items():
        setattr(package, field, value)
    db.commit()
    db.refresh(package)
    return package


def delete_package(db: Session, package: Package) -> None:
    db.delete(package)
    db.commit()
