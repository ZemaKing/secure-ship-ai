ESCALATION_PHRASES = (
    "talk to a human",
    "speak to a human",
    "talk to a person",
    "speak to a person",
    "human agent",
    "real person",
    "talk to someone",
    "speak to someone",
)


def wants_escalation(message: str) -> bool:
    """Plain substring check, evaluated before any Ollama call — escalation intent
    is deterministic, not model-judged, mirroring routes/chat.py's _mentions_shipment().
    """
    lowered = message.lower()
    return any(phrase in lowered for phrase in ESCALATION_PHRASES)
