from pydantic import BaseModel


class AdminMeResponse(BaseModel):
    sub: str
    email: str | None = None
