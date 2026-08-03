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

LOOKUP_SHIPMENTS_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "lookup_shipments",
        "description": (
            "Look up the verified visitor's own shipments — status, carrier, origin/"
            "destination, estimated delivery, and package contents. Call this whenever "
            "they ask about their order, package, or delivery. There is no way to look up "
            "anyone else's shipments through this tool — it always returns the calling "
            "visitor's own records."
        ),
        # Deliberately no parameters at all (Epic F3): a customer_id or tracking-number
        # argument here would give the model something to smuggle another visitor's
        # identifier through. Scoping is done server-side from session state instead.
        "parameters": {"type": "object", "properties": {}},
    },
}
