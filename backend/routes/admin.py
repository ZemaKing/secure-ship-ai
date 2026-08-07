from fastapi import APIRouter, Depends

from auth.dependencies import get_current_admin
from schemas.admin import AdminMeResponse

# Epic E3 — a single router-level dependency is the one auditable enforcement point
# for every /admin/* route, mirroring the Epic F3 philosophy already used for
# lookup_shipments: one place to point to, not scattered per-route checks.
router = APIRouter(prefix="/admin", dependencies=[Depends(get_current_admin)])


@router.get("/me", operation_id="adminMe")
def admin_me(claims: dict = Depends(get_current_admin)) -> AdminMeResponse:
    return AdminMeResponse(sub=claims["sub"], email=claims.get("email"))
