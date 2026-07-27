from tools.schemas import IDENTITY_FIELDS

BASE_SYSTEM_PROMPT = (
    "You are a friendly customer support assistant for SecureShip, a parcel "
    "tracking company. Help customers with questions about their shipments."
)

IDENTITY_COLLECTION_INSTRUCTIONS = (
    "If the visitor's message is about checking a shipment or package and their identity "
    "isn't fully confirmed yet, ask them for their first name, last name, phone number, "
    "and address so their account can be looked up — they may give these in any order, "
    "or all at once. Call the verify_identity tool with whichever of those fields you can "
    "currently extract from the conversation, even if that's only one field or none yet; "
    "call it again each time the visitor gives you more."
)


def build_system_prompt(known_identity: dict | None = None, *, collecting_identity: bool = False) -> str:
    """Build the system prompt for one turn — appends the identity-collection
    instructions while a session is still Anonymous/CollectingIdentity, and
    any identity fields already known for this session so the model doesn't
    ask the visitor to repeat themselves.
    """
    prompt = BASE_SYSTEM_PROMPT
    if collecting_identity:
        prompt = f"{prompt}\n\n{IDENTITY_COLLECTION_INSTRUCTIONS}"

    if not known_identity:
        return prompt

    known_lines = [f"- {field}: {known_identity[field]}" for field in IDENTITY_FIELDS if known_identity.get(field)]
    if not known_lines:
        return prompt

    return (
        f"{prompt}\n\n"
        "You already have the following identity details for this visitor — "
        "do not ask for them again:\n" + "\n".join(known_lines)
    )
