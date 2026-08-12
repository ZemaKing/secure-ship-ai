import re

# (a|an) is optional so phrasing like "talk to human" (article dropped) still matches.
ESCALATION_PATTERNS = tuple(
    re.compile(pattern)
    for pattern in (
        r"\btalk to (?:a |an )?human\b",
        r"\bspeak to (?:a |an )?human\b",
        r"\btalk to (?:a |an )?person\b",
        r"\bspeak to (?:a |an )?person\b",
        r"\bhuman agent\b",
        r"\breal person\b",
        r"\btalk to someone\b",
        r"\bspeak to someone\b",
    )
)


def wants_escalation(message: str) -> bool:
    """Plain regex check, evaluated before any Ollama call — escalation intent
    is deterministic, not model-judged, mirroring routes/chat.py's _mentions_shipment().
    """
    lowered = message.lower()
    return any(pattern.search(lowered) for pattern in ESCALATION_PATTERNS)
