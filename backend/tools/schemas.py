"""Tool-call schemas exposed to the local Ollama model (Ollama's tool-calling
contract mirrors OpenAI's function-calling format). Execution/enforcement of
these tools lives elsewhere in `tools/` — this module only defines what the
model is told it can call.
"""

VERIFY_IDENTITY_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "verify_identity",
        "description": (
            "Check a visitor's stated identity (first name, last name, phone number, "
            "address) against known customer records. Call this once all four fields "
            "have been collected from the conversation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "phone_number": {"type": "string"},
                "address": {"type": "string"},
            },
            "required": ["first_name", "last_name", "phone_number", "address"],
        },
    },
}
