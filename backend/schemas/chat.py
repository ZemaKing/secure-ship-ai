from pydantic import BaseModel


class EscalationPayload(BaseModel):
    human_name: str
    greeting: str | None = None


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    state: str
    event: str | None = None  # e.g. "code_sent", "escalated"
    escalation: EscalationPayload | None = None
