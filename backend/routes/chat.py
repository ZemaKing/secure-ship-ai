from fastapi import APIRouter
from pydantic import BaseModel

from llm import ollama_client

router = APIRouter()

SYSTEM_PROMPT = (
    "You are a friendly customer support assistant for SecureShip, a parcel "
    "tracking company. Help customers with questions about their shipments."
)


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat")
def send_chat_message(request: ChatRequest) -> ChatResponse:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": request.message},
    ]
    reply = ollama_client.chat(messages)
    return ChatResponse(reply=reply)
