BASE_SYSTEM_PROMPT = (
    "You are a friendly customer support assistant for SecureShip, a parcel "
    "tracking company. Help customers with questions about their shipments."
)

IDENTITY_FIELDS = ("first_name", "last_name", "phone_number", "address")


def build_system_prompt(known_identity: dict | None = None) -> str:
    """Append any identity fields already collected for this session so the
    model doesn't ask the visitor to repeat themselves.
    """
    if not known_identity:
        return BASE_SYSTEM_PROMPT

    known_lines = [f"- {field}: {known_identity[field]}" for field in IDENTITY_FIELDS if known_identity.get(field)]
    if not known_lines:
        return BASE_SYSTEM_PROMPT

    return (
        f"{BASE_SYSTEM_PROMPT}\n\n"
        "You already have the following identity details for this visitor — "
        "do not ask for them again:\n" + "\n".join(known_lines)
    )
