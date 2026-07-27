"""Tool-call schemas exposed to the local Ollama model (Ollama's tool-calling
contract mirrors OpenAI's function-calling format). Execution/enforcement of
these tools lives elsewhere in `tools/` — this module only defines what the
model is told it can call.
"""

IDENTITY_FIELDS = ("first_name", "last_name", "phone_number", "address")

VERIFY_IDENTITY_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "verify_identity",
        "description": (
            "Record a visitor's identity details as they're mentioned in the conversation, "
            "so they can be checked against known customer records. Call this whenever the "
            "visitor gives any of first name, last name, phone number, or address — even if "
            "it's only one field, or none yet and you're just starting to ask. Omit any field "
            "you don't have; call it again each time the visitor provides more."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "phone_number": {"type": "string"},
                "address": {"type": "string"},
            },
        },
    },
}
