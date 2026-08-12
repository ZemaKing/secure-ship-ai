from pydantic import BaseModel


class VerifyCodeRequest(BaseModel):
    session_id: str
    code: str


class VerifyCodeResponse(BaseModel):
    session_id: str
    success: bool
    reply: str
    state: str
    attempts_remaining: int | None = None
    verified_customer_name: str | None = None  # only set on a real MATCH
