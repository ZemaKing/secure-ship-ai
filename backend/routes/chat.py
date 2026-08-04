import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from llm import ollama_client
from llm.ollama_client import ToolCall
from models.chat_session import ChatSession, ChatSessionState
from models.customer import Customer
from schemas.chat import ChatRequest, ChatResponse, EscalationPayload, ShipmentPackagePayload, ShipmentPayload
from services.escalation import wants_escalation
from services.prompting import build_system_prompt
from tools.lookup_shipments import ShipmentInfo, lookup_shipments
from tools.schemas import IDENTITY_FIELDS, LOOKUP_SHIPMENTS_TOOL_SCHEMA, VERIFY_IDENTITY_TOOL_SCHEMA
from tools.send_verification_code import send_verification_code
from tools.verify_identity import IdentityOutcome, IdentityStatus, verify_identity

router = APIRouter()

NEUTRAL_IDENTITY_MESSAGE = "We couldn't verify that information — could you double check and try again?"
CODE_SENT_MESSAGE = (
    "Thanks, I've found your account — I just sent a 6-digit verification code. "
    "Please enter it to confirm it's really you."
)
IDENTITY_COLLECTING_STATES = (ChatSessionState.ANONYMOUS, ChatSessionState.COLLECTING_IDENTITY)
SHIPMENT_KEYWORDS = ("shipment", "package", "parcel", "order", "tracking", "deliver")
AGENT_NAME = "Melany"
# Only the actual scripted *text* (§6.2b's "chat window changes color" step carries no
# text of its own — it's a frontend-only visual cue, Chunk H's concern, not a chat line).
ESCALATION_SCRIPT_LINES = (
    "Thank you for your patience, switching you to a human",
    "Melany has entered the chat",
    "Hello, my name is Melany, let me just read through the chat...",
)


def _mentions_shipment(message: str) -> bool:
    """A plain keyword check, not a model call — mirrors the escalation-intent design
    (Chunk E) in keeping a state transition deterministic rather than dependent on
    whether the model happens to call a tool this turn. Only decides whether a session
    leaves Anonymous; the actual identity match is always tool/backend-enforced.
    """
    lowered = message.lower()
    return any(keyword in lowered for keyword in SHIPMENT_KEYWORDS)


def _get_or_create_session(db: Session, session_id: str | None) -> ChatSession:
    """Per-client session lookup — a given session_id only ever sees its own state."""
    if session_id is not None:
        try:
            session_uuid = uuid.UUID(session_id)
        except ValueError:
            session_uuid = None
        if session_uuid is not None:
            session = (
                db.query(ChatSession)
                .filter(ChatSession.id == session_uuid, ChatSession.ended_at.is_(None))
                .first()
            )
            if session is not None:
                return session

    session = ChatSession(
        state=ChatSessionState.ANONYMOUS,
        started_at=datetime.now(timezone.utc),
        transcript=[],
    )
    db.add(session)
    return session


def _resolve_known_first_name(db: Session, session: ChatSession) -> str | None:
    """Only ever pulled from identity data the gate itself already collected/confirmed —
    a verified Customer row, or fields verify_identity has recorded so far — never from
    the escalation-triggering message itself (Epic G4: no gate bypass via "Melany").
    """
    pending_first_name = (session.pending_identity or {}).get("first_name")
    if pending_first_name:
        return pending_first_name
    if session.customer_id is None:
        return None
    customer = db.query(Customer).filter(Customer.id == session.customer_id).first()
    return customer.first_name if customer is not None else None


def _handle_escalation(db: Session, session: ChatSession, transcript: list) -> ChatResponse:
    first_name = _resolve_known_first_name(db, session)
    greeting = (
        f"Hey {first_name}, I'm up to speed, how can I help?"
        if first_name
        else "Hey, I'm up to speed, how can I help?"
    )
    lines = [*ESCALATION_SCRIPT_LINES, greeting]
    reply = "\n".join(lines)

    session.state = ChatSessionState.ESCALATED_TO_HUMAN
    transcript.append(
        {"role": "assistant", "content": reply, "timestamp": datetime.now(timezone.utc).isoformat()}
    )
    session.transcript = transcript
    db.commit()

    return ChatResponse(
        session_id=str(session.id),
        reply=reply,
        state=session.state.value,
        event="escalated",
        escalation=EscalationPayload(lines=lines, agent_name=AGENT_NAME, first_name=first_name),
    )


def _format_shipments(shipments: list[ShipmentInfo]) -> str:
    """Plain-text rendering of a real lookup_shipments() result, fed into the second
    model call's system prompt so it has something concrete to phrase an answer from.
    """
    if not shipments:
        return "This visitor currently has no shipments on file."

    lines = []
    for shipment in shipments:
        packages = ", ".join(package.description for package in shipment.packages) or "no listed packages"
        lines.append(
            f"- Tracking {shipment.tracking_number} via {shipment.carrier}: {shipment.status}, "
            f"from {shipment.origin} to {shipment.destination}, estimated delivery "
            f"{shipment.estimated_delivery}, last update {shipment.last_update}. Contents: {packages}."
        )
    return "\n".join(lines)


def _to_shipment_payloads(shipments: list[ShipmentInfo]) -> list[ShipmentPayload]:
    """Maps the tool layer's internal ShipmentInfo dataclasses onto the API's own
    Pydantic contract (schemas/chat.py) — keeps tools/ free of any dependency on the
    wire format, same separation `_format_shipments()` keeps for the prompt-text format.
    """
    return [
        ShipmentPayload(
            tracking_number=shipment.tracking_number,
            carrier=shipment.carrier,
            origin=shipment.origin,
            destination=shipment.destination,
            status=shipment.status,
            estimated_delivery=shipment.estimated_delivery,
            last_update=shipment.last_update,
            packages=[
                ShipmentPackagePayload(
                    id=package.id,
                    description=package.description,
                    weight_kg=package.weight_kg,
                    declared_value=package.declared_value,
                )
                for package in shipment.packages
            ],
        )
        for shipment in shipments
    ]


def _tools_for_state(state: ChatSessionState) -> list[dict]:
    if state in IDENTITY_COLLECTING_STATES:
        return [VERIFY_IDENTITY_TOOL_SCHEMA]
    if state == ChatSessionState.VERIFIED:
        return [LOOKUP_SHIPMENTS_TOOL_SCHEMA]
    return []


def _dispatch_tool(
    db: Session, session: ChatSession, tool_call: ToolCall
) -> IdentityOutcome | list[ShipmentInfo] | None:
    """Executes a tool call the model made. Only allows tool names that were actually
    offered for this session's current state — rejects anything else, which hardens
    against a prompt-injected/hallucinated tool name (Epic F2).
    """
    allowed_names = {schema["function"]["name"] for schema in _tools_for_state(session.state)}
    if tool_call.name not in allowed_names:
        return None

    if tool_call.name == "verify_identity":
        args = {field: tool_call.arguments.get(field) for field in IDENTITY_FIELDS}
        return verify_identity(db, session, **args)

    if tool_call.name == "lookup_shipments":
        shipments = lookup_shipments(db, session)
        print(f"[TOOL CALL] lookup_shipments customer_id={session.customer_id} shipment_count={len(shipments)}")
        return shipments

    return None


@router.post("/chat", operation_id="chat")
def send_chat_message(request: ChatRequest, db: Session = Depends(get_db)) -> ChatResponse:
    session = _get_or_create_session(db, request.session_id)
    transcript = list(session.transcript or [])
    transcript.append(
        {"role": "user", "content": request.message, "timestamp": datetime.now(timezone.utc).isoformat()}
    )

    if session.state != ChatSessionState.ESCALATED_TO_HUMAN and wants_escalation(request.message):
        return _handle_escalation(db, session, transcript)

    collecting_identity = session.state in IDENTITY_COLLECTING_STATES
    unverified_escalation = session.state == ChatSessionState.ESCALATED_TO_HUMAN and session.customer_id is None
    result = ollama_client.chat(
        [
            {
                "role": "system",
                "content": build_system_prompt(
                    session.pending_identity,
                    collecting_identity=collecting_identity,
                    unverified_escalation=unverified_escalation,
                ),
            },
            {"role": "user", "content": request.message},
        ],
        tools=_tools_for_state(session.state) or None,
    )

    event = None
    shipments_payload: list[ShipmentPayload] | None = None
    if result.tool_calls:
        tool_call = result.tool_calls[0]
        outcome = _dispatch_tool(db, session, tool_call)
        if outcome is None:
            # Never fall back to result.content here: the model's raw text accompanying
            # a rejected tool call can name the tool itself (e.g. "lookup_shipments") or
            # other implementation detail — a disallowed tool call means its narration
            # is untrusted too, not just the call itself.
            reply = "Sorry, I didn't catch that — could you rephrase?"
        elif tool_call.name == "lookup_shipments":
            # Second, tool-free model call — same shape as the identity PARTIAL
            # follow-up below — phrases an answer from the real data already fetched
            # above. The model never sees a customer_id or re-queries anything itself.
            followup = ollama_client.chat(
                [
                    {
                        "role": "system",
                        "content": build_system_prompt(shipment_data=_format_shipments(outcome)),
                    },
                    {"role": "user", "content": request.message},
                ]
            )
            reply = followup.content or "I found your shipments, but couldn't summarize them just now — could you ask again?"
            # Week 3, Chunk C: the same real result also goes to the frontend as
            # structured data, so ShipmentCard can render it instead of only prose.
            shipments_payload = _to_shipment_payloads(outcome)
        else:
            if session.state == ChatSessionState.ANONYMOUS:
                session.state = ChatSessionState.COLLECTING_IDENTITY

            if outcome.status == IdentityStatus.REJECTED:
                reply = NEUTRAL_IDENTITY_MESSAGE
                event = "identity_rejected"
            elif outcome.status == IdentityStatus.MATCHED:
                send_verification_code(db, session)
                reply = CODE_SENT_MESSAGE
                event = "code_sent"
            else:
                followup = ollama_client.chat(
                    [
                        {
                            "role": "system",
                            "content": build_system_prompt(session.pending_identity, collecting_identity=True),
                        },
                        {"role": "user", "content": request.message},
                    ]
                )
                reply = followup.content or "Could you share the rest of your name, phone number, and address?"
    else:
        reply = result.content or ""
        if session.state == ChatSessionState.ANONYMOUS and _mentions_shipment(request.message):
            session.state = ChatSessionState.COLLECTING_IDENTITY
        elif session.state == ChatSessionState.COLLECTING_IDENTITY and all(
            (session.pending_identity or {}).get(field) for field in IDENTITY_FIELDS
        ):
            # The model saw nothing new to report (every field is already known — e.g. a
            # session that just landed back here after a code lockout/expiry) so it had no
            # reason to re-call verify_identity itself. Re-run it deterministically instead
            # of leaving the visitor stuck despite their fields being "retained" — this can
            # never clobber a live code, since CollectingIdentity only exists here once any
            # previous verification_store entry has already been cleared.
            outcome = verify_identity(db, session)
            if outcome.status == IdentityStatus.REJECTED:
                reply = NEUTRAL_IDENTITY_MESSAGE
                event = "identity_rejected"
            elif outcome.status == IdentityStatus.MATCHED:
                send_verification_code(db, session)
                reply = CODE_SENT_MESSAGE
                event = "code_sent"

    transcript.append(
        {"role": "assistant", "content": reply, "timestamp": datetime.now(timezone.utc).isoformat()}
    )
    session.transcript = transcript
    db.commit()

    return ChatResponse(
        session_id=str(session.id),
        reply=reply,
        state=session.state.value,
        event=event,
        shipments=shipments_payload,
    )
