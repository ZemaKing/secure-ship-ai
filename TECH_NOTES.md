# Tech Notes

A technical reference log, organized by file/module rather than by date. Where `CHANGE_LOG.md` is the conversational "what happened, in demo-friendly language" record, this file is the "what does this piece of code actually do, and why" record — meant to be a living document that gets a new section every time a new file/module is added, and gets corrected/updated if that file changes meaningfully later.

Written with JS/Node/TypeScript analogies throughout, since that's the background this project is being learned from. Code isn't reproduced here — each section references the real file, which is the source of truth; only the constructs worth explaining are broken out below.

---

## Backend

### `backend/main.py`

| Line | What it does | JS/Node analogy |
|---|---|---|
| `from fastapi import FastAPI` | Imports the FastAPI web framework | `import express from 'express'` |
| `from routes.chat import router as chat_router` / `from routes.verify import router as verify_router` | Imports the `APIRouter`s defined in `routes/chat.py` and (as of Chunk D) `routes/verify.py` | `import chatRouter from './routes/chat'; import verifyRouter from './routes/verify'` |
| `app = FastAPI(title="SecureShip Backend")` | Creates the application instance everything else attaches routes to. `title` only labels the app in the auto-generated docs. | `const app = express()` |
| `app.include_router(chat_router)` / `app.include_router(verify_router)` | Mounts every route defined on each router onto the main app | `app.use('/', chatRouter); app.use('/', verifyRouter)` |
| `app.add_middleware(CORSMiddleware, allow_origins=[os.environ.get("FRONTEND_ORIGIN", ...)], ...)` | Allows the browser (a different origin — `localhost:5173` vs. `localhost:8000`) to actually read the response. Without this, the browser's own CORS check blocks the fetch client-side before the request even reaches a route — the request still hits the server (visible in `uvicorn`'s access log), but the response is thrown away by the browser. `FRONTEND_ORIGIN` is `.env`-driven (defaults to `http://localhost:5173`) rather than hardcoded, per the "configuration in environment variables" guideline | `app.use(cors({ origin: process.env.FRONTEND_ORIGIN }))` |
| `@app.get("/health")` | A *decorator* — registers the function directly below it as the handler for `GET /health`. Python has no direct syntax equivalent to this, but it does the same job as chaining a route + handler. | `app.get('/health', (req, res) => {...})` |
| `def health() -> dict[str, str]:` | A plain function. The `-> dict[str, str]` is a *type hint*: "returns an object with string keys and string values." Python doesn't enforce this by itself at runtime, but FastAPI reads it to validate the response shape and build the OpenAPI schema. | A TypeScript return type annotation |
| `return {"status": "ok"}` | FastAPI serializes this dict to JSON automatically and sets the right headers. | `res.json({ status: 'ok' })` |

**Why it exists:** the smallest possible slice of a working server — one endpoint, no logic — to prove the process boots and answers over the network before anything else (DB, Ollama, chat routes) gets layered on top of the same `app` object. Now also the composition point where feature routers (starting with `routes/chat.py`) get wired in, keeping route logic out of this file as more get added.

**Free perk worth knowing:** FastAPI generates `/docs` (interactive Swagger UI) and `/openapi.json` (machine-readable schema of every endpoint) automatically from route definitions + type hints, no extra code required. `/openapi.json` is what Orval will later read to generate React Query hooks and TS types for the frontend — this is *why* the project can enforce "no hand-written fetch calls."

**Verified:** `uvicorn main:app --reload` starts clean; `GET /health` → `200 {"status": "ok"}`; `POST /chat` → `200 {"reply": "..."}`; `/docs` loads in browser and both routes are listed there.

---

### `backend/requirements.txt`

Python's equivalent of a locked `package.json` — every installed package pinned to an exact version, generated automatically via `pip freeze` after installing into the project's virtual environment (`backend/.venv/`, the Python equivalent of `node_modules/`, gitignored). Anyone (or Docker) recreates the same environment with `pip install -r requirements.txt`.

Only six packages were installed directly (per `DEV_PLAN.md`'s locked stack); everything else below is a transitive dependency `pip freeze` captured automatically — same as how `npm install` pulls in a deep tree for one direct dependency.

| Package(s) | Role | Notes |
|---|---|---|
| `fastapi` | The web framework itself | Direct dependency |
| `starlette` | Lower-level ASGI toolkit FastAPI is built on | Like Express sitting on Node's `http` module |
| `pydantic`, `pydantic_core`, `typing_extensions`, `typing-inspection`, `annotated-doc`, `annotated-types` | Data validation — turns type hints into runtime validation + JSON schema | Doing double duty as both a shape-checker (like `zod`) and the OpenAPI schema generator |
| `uvicorn`, `h11`, `httptools`, `websockets`, `watchfiles`, `colorama` | Uvicorn is the ASGI server process that actually runs the app and listens on a port | Python needs a separate server process to run an app, unlike Node running Express directly. The rest are uvicorn's internals (HTTP parsing, `--reload` file-watcher, colored terminal output) | Direct dependency: `uvicorn[standard]` |
| `anyio`, `idna`, `click` | Supporting libs uvicorn/starlette use internally | Async I/O abstraction, domain-name handling, CLI arg parsing |
| `sqlalchemy`, `greenlet` | ORM — defines `Customer`/`Shipment`/`Package`/`ChatSession` as Python classes instead of raw SQL | Like Prisma/TypeORM. `greenlet` is a low-level dep SQLAlchemy needs for async support | Direct dependency: `sqlalchemy` |
| `alembic`, `Mako`, `MarkupSafe` | Migrations tool — tracks schema changes over time | Like Prisma Migrate / `knex migrate`. `Mako`/`MarkupSafe` are templating libs Alembic uses to generate migration file boilerplate | Direct dependency: `alembic` |
| `python-dotenv` | Loads `.env` files into environment variables | Same job as the `dotenv` npm package |
| `PyYAML` | YAML parsing | Transitive dependency pulled in by one of the above |
| `requests`, `urllib3`, `certifi`, `charset-normalizer` | Synchronous HTTP client — used by `llm/ollama_client.py` to call Ollama's local API | Like `axios`. `urllib3`/`certifi`/`charset-normalizer` are its internals (connection pooling, SSL certs, encoding detection) | Direct dependency: `requests` |
| `psycopg2-binary` | The actual database driver SQLAlchemy uses under the hood to talk to Postgres over the wire | Like `pg` (the driver npm package `Prisma`/`Knex` sit on top of) — SQLAlchemy is the ORM layer, this is the low-level connector it delegates to | Direct dependency |

---

## Infrastructure

### `docker-compose.yml`

| Line | What it does | JS/Node analogy |
|---|---|---|
| `postgres: image: postgres:16` | Runs the official Postgres 16 image as a container instead of installing Postgres directly on the machine | Same idea as any `docker-compose.yml` service block |
| `environment: POSTGRES_DB/USER/PASSWORD` | The Postgres image's own bootstrap variables — on first container start, it creates a database named `secureship` owned by user `user`/`pass` | Env vars an init script reads on first boot |
| `ports: ["5432:5432"]` | Publishes the container's Postgres port to the host's `localhost:5432`, so the host-run backend can connect to it directly | Same `-p` flag as `docker run` |
| `volumes: ["pgdata:/var/lib/postgresql/data"]` | Persists the actual database files in a named Docker volume, so data survives `docker compose down`/container recreation (only gone if the volume itself is deleted) | Like a mounted volume for a database container in any stack |
| `backend: build: ./backend` | Builds and runs `backend/Dockerfile` as a service instead of pulling a prebuilt image, since this is the project's own code | `build: .` pointing at a local `Dockerfile` |
| `backend.environment: DATABASE_URL=...@postgres:5432/...` | Overrides the value `.env` has for host-native dev (`@localhost:5432`) — inside the container, `localhost` means "this container," so the backend has to reach Postgres via the Docker Compose network's service name (`postgres`) instead | Same idea as a container-specific `DATABASE_URL` in any Dockerized Node app talking to a sibling DB container |
| `backend.environment: OLLAMA_HOST=http://host.docker.internal:11434` | Same problem, different fix — Ollama runs on the *host* machine, not in a container, so `host.docker.internal` (Docker Desktop's special DNS name for "the machine running Docker") is used instead of a service name | No real Node equivalent — this is Docker Desktop-specific plumbing |
| `frontend: build: ./frontend` | Same pattern as `backend` — builds `frontend/Dockerfile` | — |
| `depends_on: [postgres]` / `[backend]` | Controls container *start order* only (not readiness) — `backend` starts after `postgres`'s container process exists, not after Postgres is actually accepting connections. Good enough here since nothing auto-migrates on startup yet (see below) | `depends_on` in Compose has this same "started, not ready" caveat generally |

**Why it exists:** started with just `postgres` per REQUIREMENTS.md §4.7, extended (not replaced) on Day 2 once `backend`/`frontend` had working Dockerfiles. Ollama stays on the host per the locked architecture decision, so it's never in this file — the containerized backend reaches it via `host.docker.internal` instead.

**Not yet done:** no `alembic upgrade head` step runs automatically on container start, so a genuinely clean clone's Postgres container would come up with no tables. Today's verification reused the existing `postgres` container/volume (already migrated, already seeded) rather than proving the from-scratch path — that's the next thing to validate.

**Verified:** `docker compose build backend frontend` succeeds; `docker compose up -d backend frontend` (with the pre-existing `postgres` container/volume already running) brings all three up; a `curl` `POST /chat` through the containerized backend got a real Ollama reply and the turn was confirmed landed in `chat_sessions.transcript` via `psql` inside the `postgres` container; a headless-browser script against `http://localhost:5173` (served from the `frontend` container) confirmed the full round-trip with zero console errors.

---

### `backend/llm/ollama_client.py`

| Line | What it does | JS/Node analogy |
|---|---|---|
| `import requests` | A synchronous HTTP client library — not part of FastAPI/Starlette, added just for this script | `import axios from 'axios'` |
| `OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")` | Env-driven base URL, defaulting to the same value it was hardcoded to before — host-native dev is unaffected. The containerized backend overrides this to `http://host.docker.internal:11434` via `docker-compose.yml`, since `localhost` inside a container refers to the container itself, not the host running Ollama | `const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434'` |
| `OLLAMA_URL = f"{OLLAMA_HOST}/api/chat"`, `MODEL` | Module-level constants | `const OLLAMA_URL = ...` |
| `@dataclass class ToolCall: name: str; arguments: dict` | **Added in Chunk C** (correcting Chunk B's original shape, which used raw `dict`s) — a small typed container per tool call, so callers write `tool_call.name`/`tool_call.arguments` instead of `tool_call["function"]["name"]` | A small `interface ToolCall { name: string; arguments: Record<string, unknown> }`, parsed once instead of every caller re-parsing raw JSON |
| `@dataclass class ChatCompletionResult: content: str \| None; tool_calls: list[ToolCall]` | The return shape as of Week 2 — a plain data container (`@dataclass`, no validation, unlike the Pydantic models in `schemas/`) holding both the model's prose reply *and* a list of typed tool calls it asked to make. `content` is nullable (Ollama sometimes returns an empty string when the model's whole turn is a tool call) and `tool_calls` is always a list (empty when there are none), never `None` — no caller needs an extra null-check before iterating it | A small `interface ChatCompletionResult { content: string \| null; toolCalls: ToolCall[] }` returned instead of a raw string |
| `def chat(messages, tools=None) -> ChatCompletionResult:` | The reusable function `routes/chat.py` imports and calls | `export async function chat(messages, tools): Promise<ChatCompletionResult> {...}` |
| `tools: list[dict] \| None = None` | An optional parameter — `\|` here is a *union type*, "either a list of dicts or `None`." Genuinely wired since Chunk C: `routes/chat.py` passes `[VERIFY_IDENTITY_TOOL_SCHEMA]` whenever a session is `Anonymous`/`CollectingIdentity` | `tools?: Record<string, unknown>[]` in a TS function signature |
| `if tools is not None: payload["tools"] = tools` | Only adds the `tools` key to the request body when the caller actually passes some — Ollama's `/api/chat` accepts an optional `tools` field for function-calling | Conditionally spreading an optional key into a request body |
| `requests.post(OLLAMA_URL, json=payload)` | POSTs a JSON body, auto-sets `Content-Type: application/json` | `axios.post(url, body)` |
| `"messages": [{"role": "user", "content": ...}]` | Ollama's chat API shape — a list of turns, each with a `role` (`user`/`assistant`/`system`) and `content`. This is the same shape OpenAI's chat API popularized. | Same as the `messages` array in an OpenAI SDK call |
| `"stream": False` | Ask Ollama to return one complete JSON response instead of a stream of partial chunks | `stream: false` in most LLM SDKs |
| `response.raise_for_status()` | Throws if the HTTP status is 4xx/5xx, instead of silently returning a bad response | `axios` does this automatically; here it's opt-in |
| `message = response.json()["message"]` | Ollama's non-streaming reply shape is `{"message": {"role": "assistant", "content": "...", "tool_calls": [{"function": {"name": "...", "arguments": {...}}}]}, ...}` | `const { content, tool_calls } = response.data.message` |
| `[ToolCall(name=call["function"]["name"], arguments=call["function"].get("arguments") or {}) for call in message.get("tool_calls") or []]` | Parses Ollama's raw tool-call dicts into typed `ToolCall`s once, here, so nothing downstream deals with the raw nested shape | `(message.tool_calls ?? []).map(c => ({ name: c.function.name, arguments: c.function.arguments ?? {} }))` |
| `ChatCompletionResult(content=message.get("content") or None, ...)` | `or None` turns Ollama's empty-string content (the common case when the whole turn is a tool call) into an actual `None`, matching the `str \| None` type honestly instead of leaving callers to treat `""` as "no content" themselves | `content: data.content || null` |
| `def main() -> None:` | A thin wrapper calling `chat()` with one hardcoded message, printing `result.content` — kept so the file is still runnable standalone as a connectivity check | Same idea, just delegating to the shared function instead of duplicating the request |
| `if __name__ == "__main__":` | Only runs `main()` when the file is executed directly (`python ollama_client.py`), not when it's imported elsewhere | Roughly like checking `require.main === module` in Node |

**Why it exists:** proves the Ollama HTTP contract (URL, model name, request/response shape) works in isolation, before any FastAPI route depends on it. `chat()` is the shared entry point both the standalone script and `routes/chat.py` call. It returns a `ChatCompletionResult` instead of a bare string specifically so a caller can check `result.tool_calls` and act on them — Chunk C is the first real caller that does.

**Verified:** `python llm/ollama_client.py` (CPU-only) returned a real, coherent `qwen3:8b` reply in a few seconds, routed through `chat()`. The `ToolCall`/`tool_calls` parsing was verified live through `routes/chat.py`'s real multi-turn identity-collection conversation (see that section below) — confirmed populated `ToolCall` instances with correctly-parsed `.name`/`.arguments` when the model called `verify_identity`, and an empty list on ordinary prose-only turns.

---

### `backend/tools/schemas.py`

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `IDENTITY_FIELDS = ("first_name", "last_name", "phone_number", "address")` | **Week 2, Chunk C:** moved here (from `services/prompting.py`, which now imports it from here) since this is the module that actually owns the field list the tool schema exposes — one source of truth instead of two modules independently agreeing on the same four names | A shared `const` exported from the module that owns the canonical shape |
| `VERIFY_IDENTITY_TOOL_SCHEMA` | A plain dict describing one callable tool, in the OpenAI/Ollama function-calling schema shape: `{"type": "function", "function": {"name", "description", "parameters": {JSON Schema}}}` | The same shape passed as the `tools` array to any OpenAI-compatible chat completions call |
| `"parameters": {"type": "object", "properties": {...}}` — no `"required"` list | **Corrected in Chunk C:** Chunk B originally marked all four fields `"required"` in the JSON Schema, which would have blocked the model from calling the tool at all until it had every field — directly contradicting Epic B2's "extract partial answers, don't demand one-at-a-time." Removing `required` lets the model call `verify_identity` with just whichever fields it's extracted so far (even zero) | Making every field on a Zod/JSON-Schema object optional so partial payloads validate |
| `"description": "Record a visitor's identity details as they're mentioned..."` | Also reworded in Chunk C to explicitly tell the model to call the tool incrementally ("even if it's only one field, or none yet... call it again each time the visitor provides more") — the original wording ("call this once all four fields have been collected") was actively wrong for the intended multi-turn slot-filling behavior | Docstring/description text on a function schema, read by the model the same way a human reads a docstring before calling a function |
| `LOOKUP_SHIPMENTS_TOOL_SCHEMA` (**Week 3, Chunk A**) | Same function-calling dict shape, but `"parameters": {"type": "object", "properties": {}}` — deliberately empty, not just "no `required` list" like `verify_identity` above. There is no `customer_id`/tracking-number field for the model to fill in at all, so there's nothing here to prompt-inject or hallucinate a value into (Epic F3) | A tool/function schema with zero parameters — the callee always operates on ambient/session context, never caller-supplied arguments |

**Why it exists:** this is what the model is *told* it can call — not the enforcement logic itself. `backend/tools/` is documented in `REQUIREMENTS.md` §6.6 as "the enforcement layer, called by the model via tool-calling"; the actual DB lookup + enforcement now lives in `verify_identity.py`/`lookup_shipments.py` (below).

**Verified:** live against the real running `qwen3:8b` via `routes/chat.py`'s orchestration (see that section) — the model reliably calls `verify_identity` with partial arguments across multiple turns once the `required` list was removed and the description reworded; before that fix, a quick manual check confirmed the model would not call the tool at all without every field present. `LOOKUP_SHIPMENTS_TOOL_SCHEMA` itself only unit-verified so far (see `lookup_shipments.py` below) — live model tool-calling for it is Chunk B.

---

### `backend/services/prompting.py`

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `from tools.schemas import IDENTITY_FIELDS` | Imports the shared field-name tuple rather than redefining it (Chunk C cleanup — see `tools/schemas.py` above) | `import { IDENTITY_FIELDS } from '../tools/schemas'` |
| `BASE_SYSTEM_PROMPT` | The same persona string that used to live as a constant in `routes/chat.py` — moved here so prompt-building logic has one home instead of living inline in a route handler | Extracting an inline template literal into its own module |
| `IDENTITY_COLLECTION_INSTRUCTIONS` | **New in Chunk C:** a constant block telling the model when/how to engage the identity flow — ask for the four fields when a shipment question comes up and identity isn't confirmed, extract whatever's given in any order, and call `verify_identity` incrementally as fields arrive | A second template string, only appended to the prompt when relevant |
| `def build_system_prompt(known_identity=None, *, collecting_identity: bool = False) -> str:` | Grew a keyword-only `collecting_identity` flag — when `True`, `IDENTITY_COLLECTION_INSTRUCTIONS` is prepended before the known-fields block. `routes/chat.py` passes `True` whenever `session.state` is `Anonymous`/`CollectingIdentity`, and always passes `True` again for the dedicated "ask for the missing fields" follow-up call regardless of state, since that call only ever happens mid-collection | `buildSystemPrompt(knownIdentity?, { collectingIdentity = false })` — an options-object-style optional flag |
| `[f"- {field}: {known_identity[field]}" for field in IDENTITY_FIELDS if known_identity.get(field)]` | A list comprehension — Python's inline `.filter().map()` — walks the fixed field order, skips any field not yet known, and formats the rest as a bullet line | `IDENTITY_FIELDS.filter(f => knownIdentity[f]).map(f => \`- ${f}: ${knownIdentity[f]}\`)` |
| `POST_ESCALATION_UNVERIFIED_INSTRUCTIONS` + `unverified_escalation: bool = False` param | **New in Chunk E**, found live: with no tool offered to the model once a session is `EscalatedToHuman`, an unverified visitor's shipment question couldn't leak real data, but the model still *sounded* like it had access — cheerfully asking for a tracking number instead of declining. `routes/chat.py` now passes `unverified_escalation=True` whenever `state == EscalatedToHuman` and `customer_id is None`, appending an explicit "you still aren't verified even though a human joined" instruction | A second conditional template block, same pattern as `collecting_identity`, added once live testing showed the base prompt alone didn't cover this state |

**Why it exists:** the model shouldn't ask a visitor for a name/address/phone it already has, and needs explicit instructions to actually start (and continue) the identity-collection tool-calling loop rather than just chatting in prose — and, as of Chunk E, needs an equally explicit instruction that the escalation theater doesn't quietly waive that requirement. `routes/chat.py` now calls `build_system_prompt(session.pending_identity, collecting_identity=..., unverified_escalation=...)` every turn — `pending_identity` is genuinely populated once `verify_identity` starts merging fields into it (Chunk C), so this is no longer a no-op the way it was right after Chunk B.

**Verified:** checked directly in a Python shell against `None`/`{}`/populated-dict cases for the known-identity block (unchanged from Chunk B); the `collecting_identity` flag's effect was verified live — the real model's follow-up questions correctly referenced fields already given (e.g. addressing the visitor by name once it had been provided) and asked only for the remaining ones, across a real multi-turn conversation (see `routes/chat.py`'s entry below). The `unverified_escalation` flag was verified live too (Chunk E) — before it existed, a post-escalation shipment question got "sure, give me your tracking number and I'll check right away"; after adding it, the same message got an explicit "I'll need to verify your identity first" instead.

---

### `backend/schemas/chat.py` + `backend/schemas/verify.py`

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `class EscalationPayload(BaseModel): lines: list[str]; agent_name: str; first_name: str \| None = None` | **Real as of Chunk E** (replacing Chunk A's placeholder `human_name`/`greeting` shape once the actual escalation logic existed to populate it): `lines` is the full ordered list of scripted text the frontend should render as they arrive (Chunk H), `agent_name` is always `"Melany"` today but kept as a field rather than a hardcoded frontend string, `first_name` is `None` whenever the visitor hasn't given/confirmed a name yet | A TS interface whose shape was finalized once the feature landed, not guessed upfront |
| `class ChatRequest(BaseModel): message: str; session_id: str \| None = None` | Moved verbatim out of `routes/chat.py`, plus the new `session_id` field (nullable — absent on a visitor's first message, present on every turn after) | Same shape, just relocated out of the route file into its own schema module |
| `class ChatResponse(BaseModel): session_id: str; reply: str; state: str; event: str \| None = None; escalation: EscalationPayload \| None = None` | `session_id` and `state` are new — every response now tells the caller which session it's talking to and what state that session is in (`"anonymous"` today; real transitions come with the gate). `event`/`escalation` are reserved for later chunks (e.g. `"code_sent"`, `"escalated"`) — always `None` right now since nothing sets them | Extending a response DTO with fields a later feature will populate, without waiting for that feature to exist |
| `class VerifyCodeRequest(BaseModel): session_id: str; code: str` / `class VerifyCodeResponse(BaseModel): session_id: str; success: bool; reply: str; state: str; attempts_remaining: int \| None = None` | Shapes for `POST /verify-code` (2FA code check) — drafted in Chunk A, actually wired to a real endpoint in Chunk D (`routes/verify.py`, below) | The response DTO, now backed by a real controller |

**Why they exist:** `routes/chat.py` used to define `ChatRequest`/`ChatResponse` inline as the only two request/response shapes in the app. Pulling them into `schemas/` (following the same "schemas separate from routes" convention the project guidelines call for) makes room for `verify.py` to exist alongside without another route file growing its own inline models, and keeps FastAPI/Orval's source-of-truth (these classes) in one predictable place as more endpoints are added through Week 2.

**Verified:** `routes/chat.py` imports and uses `ChatRequest`/`ChatResponse` from here with no circular-import issues; `/openapi.json` reflects the new `session_id`/`state`/`event`/`escalation` fields correctly (confirmed via the regenerated Orval output in `frontend/src/api/generated/secure-ship.ts`). `schemas/verify.py`'s models are now live behind `POST /verify-code` (Chunk D) — Orval regenerated again, `useVerifyCode()` confirmed present in `src/api/generated/secure-ship.ts`, `npm run build` clean. `EscalationPayload`'s real shape (Chunk E) confirmed live in a real `POST /chat` response — `lines`/`agent_name`/`first_name` all populate correctly on an actual escalation.

---

### `backend/tools/verify_identity.py`

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `class IdentityStatus(str, enum.Enum): PARTIAL / REJECTED / MATCHED` | The three outcomes identity checking can produce — same `(str, enum.Enum)` pattern as `ChatSessionState`/`ShipmentStatus`, so comparisons and serialization behave the same way project-wide | A TS string-literal union `"partial" \| "rejected" \| "matched"` |
| `@dataclass class IdentityOutcome: status: IdentityStatus; customer_id: UUID \| None = None` | A small typed result — `customer_id` is only ever set on `MATCHED` | `interface IdentityOutcome { status: IdentityStatus; customerId?: string }` |
| `def verify_identity(db, session, first_name=None, last_name=None, phone_number=None, address=None) -> IdentityOutcome:` | All four parameters are individually optional — a single call can supply just one field | A function whose params are all optional, called incrementally as data arrives |
| `pending = dict(session.pending_identity or {}); pending.update({...})` | Merges only the *non-empty* fields just given on top of whatever was already known — copies to a new dict first (same "reassign, don't mutate in place" rule as `session.transcript`, since `pending_identity` is also a plain JSONB column) | `const pending = { ...session.pendingIdentity, ...Object.fromEntries(Object.entries(given).filter(([,v]) => v)) }` |
| `session.pending_identity = pending; db.commit()` | Persists progress immediately, every call — so a visitor can walk away mid-conversation and their partial identity survives (backed by real Postgres, not in-memory state) | Saving a partial form's progress to the DB after every field, not just at submit |
| `if not all(pending.get(field) for field in IDENTITY_FIELDS): return IdentityOutcome(status=PARTIAL)` | Only attempts a DB match once all four fields are present — calling with 1–3 fields always short-circuits to `PARTIAL`, regardless of what was already known from earlier turns | An early-return guard clause before the "real" lookup logic runs |
| `func.lower(Customer.first_name) == pending["first_name"].lower()` (×4, `.filter(...)`) | A case-insensitive exact match on all four fields — deliberately not case-*sensitive*, since a visitor mistyping capitalization is far more likely than genuinely holding the wrong data, and not fuzzy/partial either, since this is a security-relevant match, not a search | `WHERE LOWER(first_name) = LOWER($1) AND ...` — same idea as a case-insensitive collation on a login lookup |
| `if customer is None: return IdentityOutcome(status=REJECTED)` | No match on all four fields (even case-insensitively) → rejected. The caller (`routes/chat.py`) is responsible for turning this into the neutral message — this function never returns or logs *why* it didn't match, by design (Epic B3 — nothing here could leak "which field was wrong") | Returning a boolean-ish "not found" from a repository method, with no detail about which comparison failed |
| `session.pending_customer_id = customer.id; db.commit(); return IdentityOutcome(status=MATCHED, customer_id=customer.id)` | Records the match server-side and returns it — the model itself never receives or handles a `customer_id`, only ever the four identity strings it originally supplied | The single place a "user record" gets attached to a session, kept out of anything client/model-controlled |

**Why it exists:** this is the one place in the codebase that reads `Customer` rows for identity matching or writes `pending_identity`/`pending_customer_id` — concentrating that logic here (rather than scattering DB lookups through `routes/chat.py`) is deliberate groundwork for Week 3's Epic F3 enforcement point, which needs exactly one auditable place to point to. `routes/chat.py` calls this via `_dispatch_tool()` (below) whenever the model calls the `verify_identity` tool.

**Verified:** unit-tested directly against the real seeded DB (not mocked) — a real customer's first/last name only stays `PARTIAL`; adding a wrong phone/address returns `REJECTED`; correcting them (including deliberately mismatched casing on the address) returns `MATCHED` with the right `customer_id`, and `session.pending_customer_id` is set to match. Also exercised live through the full conversational flow (see `routes/chat.py` below).

---

### `backend/tools/lookup_shipments.py` (Week 3, Chunk A)

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `def lookup_shipments(db: Session, session: ChatSession) -> list[ShipmentInfo]:` | Exactly two parameters — `db` and `session` — and nothing else. There is no third argument a caller could use to name a different customer; the function is physically incapable of looking up anyone but `session`'s own customer | A repository method whose only "filter" input is the trusted, server-side current-user object, never a client-supplied id |
| `db.query(Shipment).filter(Shipment.customer_id == session.customer_id).all()` | **The single enforcement point (Epic F3).** `session.customer_id` is the same column `check_verification_code.py` is the only place that ever sets, on a real 2FA match — never a value read from `tool_call.arguments`, the request body, or the message text. This is the exact line to point at during the Week 3 demo | `Shipment.findAll({ where: { customerId: req.session.customerId } })` — scoping a query by the authenticated session, not a request parameter |
| `@dataclass class ShipmentInfo` / `class PackageInfo` | Plain result shapes (tracking number, carrier, origin/destination, status, dates, and a nested list of packages) — deliberately not the SQLAlchemy model instances themselves, so nothing accidentally leaks an ORM object (or a stray column) past this function's boundary | Mapping ORM entities to a plain DTO before returning them from a service layer |
| One `Package` query per shipment (not a single joined query) | Kept simple and readable over a handful of rows per customer — no measured performance need yet to justify a join here | The kind of N+1 query a real production service would eventually optimize, deferred because the mock dataset is small |

**Why it exists:** the whole reason Week 3 exists — `routes/chat.py` doesn't call this yet (that's Chunk B); today it's proven correct in isolation before anything wires a live model turn to it.

**Verified:** unit-level, against the real seeded DB (not mocked) — two different verified customers (Sergei Petrov, 3 shipments; Jovana Markovic, 1 shipment) produced two different, correctly-scoped result sets, and `inspect.signature(lookup_shipments)` confirmed the only parameters are `(db, session)` — no identifier argument exists to smuggle a value through. `pytest backend/tests` still 12/12 after adding `LOOKUP_SHIPMENTS_TOOL_SCHEMA` to `_tools_for_state()`'s `Verified` branch.

---

### `backend/services/verification_store.py`

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `_store: dict[str, PendingVerification] = {}` | A plain module-level dict — the entire "2FA code database." Per `DEV_PLAN.md`'s locked decision, no Redis/second datastore for this project; codes live only in this process's memory and vanish on restart (acceptable for a dev/demo project, not something a real deployment would do) | An in-memory `Map` used as a cache, module-scoped so every request handler shares the same instance |
| `CODE_TTL_SECONDS = 300`, `MAX_ATTEMPTS = 3` | The specific numbers `DEV_PLAN.md` explicitly asked to be picked and documented, rather than left as a vague "a few minutes"/"a few tries" | Named constants instead of magic numbers scattered through the logic that uses them |
| `@dataclass class PendingVerification: code: str; customer_id: UUID; expires_at: datetime; attempts: int = 0` | One entry per session with an outstanding code. `customer_id` is carried here (not re-derived from the DB) so `check_verification_code` knows exactly which customer to promote on a match, without a second lookup | A small in-memory record type, same shape as a Redis hash you'd otherwise store under a `verify:{sessionId}` key |
| `def set_pending(session_id, code, customer_id) -> None:` | Always overwrites any existing entry for that session — issuing a new code invalidates whatever code (if any) was outstanding before it | `Map.set(sessionId, {...})` — last write wins |
| `def get_pending` / `increment_attempts` / `clear` | The remaining CRUD-ish surface `tools/check_verification_code.py` needs; `increment_attempts` returns the new count so the caller doesn't need a second `get` to check it against `MAX_ATTEMPTS` | Small helper functions wrapping `Map.get`/mutate-in-place/`Map.delete` |

**Why it exists:** the single source of truth for "is this code right, and how many tries are left" — kept out of Postgres entirely, since a mock 2FA code is exactly the kind of transient, security-sensitive value that shouldn't outlive the request cycle it's needed for, let alone land in a durable table.

**Verified:** exercised indirectly through `send_verification_code.py`/`check_verification_code.py`'s live tests (below) — a code set here was correctly read back, its attempt count incremented on each wrong guess, and the entry removed on both a correct guess and a lockout. Also unit-tested `EXPIRED` directly by manually backdating a stored entry's `expires_at` into the past.

---

### `backend/tools/send_verification_code.py`

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `code = f"{secrets.randbelow(1_000_000):06d}"` | `secrets`, not `random` — the one place in this app that actually needs an unpredictable value (a real `random.randint` is seeded/reproducible in ways that matter for anything security-adjacent, even a mocked code). `:06d` zero-pads so `42` becomes `"000042"`, not a 2-digit code | `crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')` — `crypto`, not `Math.random()` |
| `print(f"[MOCK SMS] To {phone_number}: ...")` | The entire "send an SMS" step — console output only. This satisfies the no-PII-in-logs rule as written (`console output during dev is fine; nothing... should land in a file on disk`) since nothing here touches a file | A `console.log` standing in for a Twilio call in a dev/mock environment |
| `set_pending(str(session.id), code, session.pending_customer_id)` | Stores it keyed by the session's UUID (as a string, matching how `session_id` travels everywhere else in the API) against the customer `verify_identity` already matched | Writing a cache entry keyed by the current request's session id |
| `session.state = ChatSessionState.AWAITING_CODE; db.commit()` | Settles directly on `AwaitingCode` rather than persisting an intermediate `CodeSent` row — Section 6.2's diagram has both states, but there's no separate "show the modal" turn to distinguish them across (no modal exists yet, Chunk G), so persisting both would just be two commits for a transition nothing ever observes in between | Collapsing two state-machine transitions into one commit when nothing consumes the intermediate state |

**Why it exists:** the tool `routes/chat.py` calls the instant `verify_identity` reports `MATCHED` — this is what actually "sends" the 2FA code and moves the session past identity collection into the 2FA-pending state.

**Verified:** live, against a real matched identity — console showed `[MOCK SMS] To +14988735265: your SecureShip verification code is 720623` (a real phone number from the seeded `Customer` row), `ChatResponse.event` came back `"code_sent"`, and `chat_sessions.state` was `awaiting_code` in Postgres afterward.

---

### `backend/tools/check_verification_code.py`

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `class VerifyStatus(str, enum.Enum): MATCH / MISMATCH / EXPIRED / LOCKED_OUT` | Four outcomes, same `(str, enum.Enum)` pattern used everywhere else in the codebase | A TS string-literal union of the four outcomes |
| `if pending is None or datetime.now(timezone.utc) >= pending.expires_at: ... return EXPIRED` | No pending code at all (nothing was ever sent, or it was already cleared) is treated the same as a genuinely time-expired one — both mean "there's nothing valid to check this against" | Two different "not found" causes collapsed into one response, since the caller doesn't need to distinguish them |
| `if submitted_code == pending.code: session.customer_id = pending.customer_id; session.pending_customer_id = None; session.pending_identity = None; session.state = VERIFIED; db.commit(); clear(...)` | The actual promotion: the *real* `customer_id` column (used by every future gated tool, e.g. Week 3's `lookup_shipments`) only ever gets set here, from the store's `customer_id` — never from anything the model or client supplied directly. `pending_identity` is wiped since it's now-obsolete scratch data | The one line in the whole codebase that flips a session from "unverified" to "trusted" |
| `attempts = increment_attempts(...); if attempts >= MAX_ATTEMPTS: ... return LOCKED_OUT` | **Deliberate lockout, no silent auto-regenerate** (commented in the code per `DEV_PLAN.md`'s explicit ask): the 3rd wrong guess discards the code and reverts `session.state` to `CollectingIdentity` rather than quietly minting a new code and letting the guessing continue | A login form that locks an account after N failed attempts instead of silently allowing unlimited retries |
| Lockout/expiry both revert to `CollectingIdentity` **without touching `pending_identity`/`pending_customer_id`** | This is what makes "fields retained" actually true — the next successful identity re-check (see `routes/chat.py`'s new fallback, below) doesn't need the visitor to retype anything, because their name/phone/address are still sitting in `pending_identity` exactly as before | Preserving form state across a failed submission instead of clearing the whole form |

**Why it exists:** the second enforcement point in the identity/2FA gate (alongside `verify_identity.py`) — this is the only place a session can become genuinely `Verified`, and the only place a wrong/expired code has consequences.

**Verified:** live — a correct code produced `Verified` with `customer_id` set and `pending_customer_id`/`pending_identity` both `None` in Postgres; 3 wrong codes in a row produced `mismatch, mismatch, locked_out` with `attempts_remaining` counting down `2, 1, 0` and reverted `state` to `collecting_identity`. `EXPIRED` unit-tested directly by backdating a stored entry's `expires_at`, rather than waiting out a real 5 minutes.

---

### `backend/routes/verify.py`

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `def _get_session_or_404(db, session_id) -> ChatSession:` | Same UUID-parse-defensively pattern as `routes/chat.py`'s `_get_or_create_session`, but the opposite failure mode: `/chat` creates a session when one isn't found, this **404s** — you can't "verify a code" for a session that was never created by asking a question first | A repository lookup that raises `NotFoundException` instead of upserting, because this endpoint's contract requires the resource to already exist |
| `@router.post("/verify-code", operation_id="verifyCode")` | `operation_id="verifyCode"` is what makes Orval generate `useVerifyCode()` instead of an auto-derived name, same reasoning as `/chat`'s `operation_id="chat"` | Naming a controller action so codegen produces a clean hook name |
| `def verify_code(request: VerifyCodeRequest, db=Depends(get_db)) -> VerifyCodeResponse:` | Thin: looks up the session, calls `check_verification_code`, and maps each `VerifyStatus` to a fixed reply string + `success`/`attempts_remaining` — no branching logic of its own beyond that mapping | A controller method that's pure glue between a service call and its DTO |

**Why it exists:** the actual `POST /verify-code` endpoint `schemas/verify.py` was drafted for back in Chunk A — this is where it becomes real. Deliberately doesn't touch `session.transcript` — a code-check isn't a chat turn, so it stays out of the conversational record entirely (and never contains the code itself, so nothing 2FA-sensitive lands in `transcript` even indirectly).

**Verified:** live — correct code → `{success: true, state: "verified"}`; wrong code → `{success: false, attempts_remaining: N}`; 3rd wrong code → `{success: false, attempts_remaining: 0}` and `state` back to `collecting_identity`; a garbage/nonexistent `session_id` → `404 {"detail": "Session not found"}` instead of a 500. Mounted in `main.py` and confirmed present in `/openapi.json` (both from the containerized backend, after a rebuild).

---

### `backend/services/escalation.py`

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `ESCALATION_PHRASES = ("talk to a human", "speak to a human", ...)` | A small fixed tuple of substrings | A hardcoded `const` array, not a config file or DB table — small and stable enough not to need either |
| `def wants_escalation(message: str) -> bool: return any(phrase in message.lower() for phrase in ESCALATION_PHRASES)` | A plain substring check — deliberately **not** a model call, same reasoning as `routes/chat.py`'s `_mentions_shipment()`: a state transition this important (leaving the identity/2FA flow entirely) shouldn't depend on whether the model happens to recognize the intent this turn | `const wantsEscalation = (msg) => ESCALATION_PHRASES.some(p => msg.toLowerCase().includes(p))` |

**Why it exists:** Epic G1's trigger ("I want to talk to a human") needs to fire reliably and instantly, from *any* session state, before any Ollama round-trip — a keyword check is both faster and more deterministic than asking the model to recognize its own escalation intent.

**Verified:** live against the real running backend — "I want to talk to a human" reliably triggers escalation from a fresh `Anonymous` session and from a mid-identity-collection session alike; ordinary shipment/small-talk messages don't false-positive.

---

### `backend/routes/chat.py`

| Line | What it does | JS/Node analogy |
|---|---|---|
| `router = APIRouter()` | A mountable group of routes, kept separate from the main `app` so route logic lives per-feature instead of piling into `main.py` | `const router = express.Router()` |
| `from schemas.chat import ChatRequest, ChatResponse` | Request/response shapes now live in `schemas/chat.py` (see above) instead of being defined inline here | Importing DTOs from a shared schema module instead of declaring them in the controller file |
| `from services.prompting import build_system_prompt` | The system-prompt string is no longer a local constant — it's built fresh per request from `services/prompting.py`, which can factor in identity fields already collected for this session and whether identity collection is currently active | Importing a template-builder function instead of inlining a template string |
| `NEUTRAL_IDENTITY_MESSAGE`, `CODE_SENT_MESSAGE` | Two hardcoded reply strings — `NEUTRAL_IDENTITY_MESSAGE` is returned verbatim on `REJECTED` (Epic B3: exact wording, no model involved, so it can never leak which field was wrong or vary based on model mood). `CODE_SENT_MESSAGE` (renamed from Chunk C's placeholder `IDENTITY_MATCHED_MESSAGE`) now accurately says a code was sent, since `send_verification_code()` really runs before it's returned | A constant error-message string used directly instead of letting a template engine phrase it differently each time |
| `AGENT_NAME = "Melany"`, `ESCALATION_SCRIPT_LINES` | **New in Chunk E** — the fake human's name and the 3 fixed scripted lines from §6.2b that carry actual text. The diagram's 5th step ("chat window changes color") is a visual-only state transition, not a line of text, so it's deliberately left out of this tuple — that's Chunk H's frontend concern, not something the backend emits as a string | Constants extracted once a feature needs them, not guessed ahead of time |
| `SHIPMENT_KEYWORDS`, `def _mentions_shipment(message: str) -> bool:` | A plain substring check (`shipment`, `package`, `parcel`, `order`, `tracking`, `deliver`) — **not a model call**. Added after live testing showed the model reasonably won't call `verify_identity` with zero arguments just to "start" the flow, which left a from-scratch session stuck `Anonymous` on its very first message. This heuristic only decides the `Anonymous → CollectingIdentity` transition; the actual identity check always goes through the model + `verify_identity`, never this function | Same idea as `services/escalation.py`'s `wants_escalation()` — deterministic, no LLM round-trip needed for a decision this simple |
| `def _get_or_create_session(db: Session, session_id: str \| None) -> ChatSession:` | Unchanged since Chunk A — per-client lookup by `session_id`/primary key | Roughly `session_id ? await Session.findOne({ id: session_id, endedAt: null }) : null; session ??= await Session.create({...})` |
| `def _resolve_known_first_name(db, session) -> str \| None:` | **New in Chunk E** — pulls a first name only from `session.pending_identity` (partial identity collected so far) or, failing that, a real `Customer` row via `session.customer_id` (only set once `Verified`). Never touches the current message — the escalation-triggering text itself is never a source for the greeting, which is the concrete code-level enforcement of Epic G4 ("Melany" can't be talked into anything) | A lookup that only ever reads from already-trusted state, never from the current request's raw input |
| `def _handle_escalation(db, session, transcript) -> ChatResponse:` | Builds `ESCALATION_SCRIPT_LINES` plus a 4th personalized/generic greeting line, sets `session.state = EscalatedToHuman`, appends the joined reply to the transcript as one assistant turn (so the scripted handoff is genuinely part of the persisted conversation record, not a side effect invisible to `SELECT * FROM chat_sessions`), and returns a `ChatResponse` with `event="escalated"` and a populated `escalation` payload | A controller action that builds a canned multi-line response and tags the session state, with no branching logic beyond "is a name known or not" |
| `if session.state != EscalatedToHuman and wants_escalation(request.message): return _handle_escalation(...)` (top of `send_chat_message`, right after the user's turn is appended to the transcript) | Checked **before any Ollama call** — escalation intent is deterministic and short-circuits the entire rest of the turn (no tool dispatch, no identity-collection prompt logic runs at all this turn). Already-escalated sessions fall through to the normal flow instead of re-triggering, so a second "I want to talk to a human" mid-theater doesn't reset anything | An early-return guard at the very top of a request handler, before any of the handler's normal branching |
| `def _tools_for_state(state: ChatSessionState) -> list[dict]:` | Returns `[VERIFY_IDENTITY_TOOL_SCHEMA]` while `state` is `Anonymous`/`CollectingIdentity`, `[LOOKUP_SHIPMENTS_TOOL_SCHEMA]` while `Verified` (**Week 3, Chunk A**), else `[]` — this is both "what tools does the model get offered" *and* (via the next function) "what tool names are actually allowed to execute," so the two can never drift apart | A single function used both to build a request's `tools` array and to validate a response's tool-call name against that same list |
| `def _dispatch_tool(db, session, tool_call: ToolCall) -> IdentityOutcome \| None:` | Re-derives the allowed tool names for `session.state` via `_tools_for_state()` and rejects (`return None`) any `tool_call.name` not in that set — hardens against a hallucinated or prompt-injected tool name (Epic F2). For `verify_identity`, only pulls the four known `IDENTITY_FIELDS` keys out of `tool_call.arguments` before calling `verify_identity(db, session, **args)` — any extra/unexpected key the model supplied (e.g. an injected `customer_id`) is silently dropped rather than crashing on an unexpected keyword argument or being trusted | A controller action that re-validates an incoming action name against a per-role allowlist, and picks only known fields off a payload before passing it to a service function (never a raw object spread) |
| `collecting_identity = session.state in IDENTITY_COLLECTING_STATES` | Computed once per request, used both for `build_system_prompt(..., collecting_identity=...)` and (implicitly, via `_tools_for_state`) for which tools get offered | A single derived boolean reused across a few call sites in one request handler |
| `unverified_escalation = state == EscalatedToHuman and customer_id is None` | **New in Chunk E**, found live — passed to `build_system_prompt(..., unverified_escalation=...)`. No tool is ever offered in this state (safe by construction), but without this the model would still *sound* like it had shipment access, cheerfully asking for a tracking number instead of declining | A second derived boolean covering a state the first one (`collecting_identity`) doesn't |
| `result = ollama_client.chat([...], tools=_tools_for_state(session.state) or None)` | The first model call of the turn — `or None` means an empty tools list becomes Ollama's "no tools" (`None`), not an empty-but-present `tools` key | `chat(messages, { tools: toolsForState(state).length ? toolsForState(state) : undefined })` |
| `if result.tool_calls: outcome = _dispatch_tool(db, session, result.tool_calls[0])` | Only the first tool call is handled (a single tool schema is offered today, so more than one is not expected) | Handling `response.toolCalls[0]` when only one tool is registered |
| `if outcome is None: reply = result.content or "..."` | The disallowed-tool-name path — falls back to whatever prose the model also produced, or a generic apology if there was none | Graceful fallback when a validated action is rejected, instead of a hard error |
| `if session.state == ANONYMOUS: session.state = COLLECTING_IDENTITY` (inside the `outcome is not None` branch) | Any *legitimate* tool dispatch — regardless of `PARTIAL`/`REJECTED`/`MATCHED` — is what actually moves a session out of `Anonymous`, since it means the model engaged the identity flow for real | The state transition triggers on "a real action was taken," not on message content alone |
| `elif outcome.status == REJECTED: reply = NEUTRAL_IDENTITY_MESSAGE; event = "identity_rejected"` | No second model call for this path — wording is guaranteed exactly, and `session.state` stays `CollectingIdentity` (already-collected fields are *not* cleared, so a visitor only has to correct the one wrong field, not retype everything) | Returning a fixed error response directly from validation logic, skipping any further templating step |
| `elif outcome.status == MATCHED: send_verification_code(db, session); reply = CODE_SENT_MESSAGE; event = "code_sent"` | **Real as of Chunk D** — replaces Chunk C's placeholder. `send_verification_code` runs synchronously in this same request (prints the mock SMS, sets `session.state = AwaitingCode`) before the response is built, so `event="code_sent"` and `state="awaiting_code"` are both accurate by the time the client sees them | The action actually runs here now, not just a comment saying it will |
| `else: followup = ollama_client.chat([...collecting_identity=True...]); reply = followup.content or "..."` | The `PARTIAL` path — a **second**, separate model call (no `tools` this time) whose system prompt now includes the just-updated `pending_identity`, so the model phrases a natural follow-up asking only for the fields still missing, correctly referencing what's already known (e.g. using a name already given) | Two sequential API calls in one request handler: one to take an action, a second (with updated context) to phrase the user-facing response |
| `if session.state == ANONYMOUS and _mentions_shipment(request.message): session.state = COLLECTING_IDENTITY` (in the no-tool-calls branch) | The keyword-based fallback transition from Chunk C — covers the case where the model chose not to call the tool at all this turn (typically the very first, info-free message of a conversation) | The deterministic fallback path for the one case the primary (tool-call-driven) mechanism doesn't reliably cover |
| `elif session.state == COLLECTING_IDENTITY and all((session.pending_identity or {}).get(f) for f in IDENTITY_FIELDS): outcome = verify_identity(db, session)` | **New in Chunk D**, found live: after a 2FA lockout/expiry reverts a session to `CollectingIdentity` with every field already known, the model has nothing *new* to report and simply doesn't re-call `verify_identity` on its own — so nothing re-sent a code. This re-runs `verify_identity()` with no new arguments (a no-op merge over already-complete data) whenever that exact situation is detected, and handles `REJECTED`/`MATCHED` the same way the tool-call branch above does. Safe by construction: `CollectingIdentity` can only be reached here once any earlier verification-store entry is already cleared, so this can never overwrite a code the visitor is mid-way through entering | The same "the primary mechanism doesn't cover every case" reasoning as `_mentions_shipment` above, applied to a second gap found by actually running the flow rather than just reading the code |
| `return ChatResponse(session_id=str(session.id), reply=reply, state=session.state.value, event=event)` | `event` now also comes back as `"code_sent"` on a match, in addition to `"identity_rejected"`/`None` | `res.json({ sessionId, reply, state, event })` |

**Why it exists:** Week 1 proved a real, ungated conversation over HTTP with naive shared-session persistence. Chunk A fixed session sharing, Chunk B added the tool-calling contract, Chunk C made identity collection real, Chunk D is where a matched identity actually results in a sent (mocked) 2FA code instead of a placeholder reply, and Chunk E adds the cosmetic human-escalation handoff on top — without letting it become a gate bypass. Still missing: any frontend surface for any of this (Chunks F–H).

**Verified:** live against the real running `qwen3:8b` and the real seeded DB — a full identity match now prints a mock SMS to console and returns `event="code_sent"`/`state="awaiting_code"`; 3 wrong codes at `/verify-code` lock out and revert to `collecting_identity`; the very next chat message (no identity retyped) hits the new fallback branch and gets a *fresh* code, which was read off the console and used to complete verification, landing on `Verified` with `customer_id` set in Postgres. Rebuilt the Docker backend and regenerated/rebuilt the frontend (`npm run build` clean) against the updated OpenAPI schema. **Chunk E:** escalating from a fresh `Anonymous` session returns all 4 scripted text lines plus a generic greeting and `event="escalated"`; escalating after giving a first name personalizes the greeting ("Hey Viktor, ..."); a shipment question asked immediately after escalating while still unverified gets an explicit "I'll need to verify your identity first" instead of being entertained — confirming the escalation theater doesn't bypass the gate.

---

### `backend/db/base.py` + `backend/db/session.py`

| Line | What it does | JS/Node analogy |
|---|---|---|
| `class Base(DeclarativeBase): pass` | An empty base class every table model inherits from — SQLAlchemy uses it to collect all model definitions into one `Base.metadata` registry, which is how Alembic later finds every table to generate migrations from | The base `Model` class in an ORM like Sequelize/TypeORM that every entity extends |
| `load_dotenv(...)` | Reads `backend/.env` and loads its key=value pairs into `os.environ`, resolved relative to this file so it works regardless of the current working directory | `import 'dotenv/config'` |
| `DATABASE_URL = os.environ["DATABASE_URL"]` | Reads the connection string from the environment — centralizes config in one place per project convention, never hardcoded | `process.env.DATABASE_URL` |
| `engine = create_engine(DATABASE_URL)` | Creates the actual connection pool to Postgres. Nothing connects yet — this just describes *how* to connect | Roughly a `pg.Pool(connectionString)` |
| `SessionLocal = sessionmaker(bind=engine, ...)` | A factory for creating individual DB sessions (units of work) bound to that engine | A factory function returning a new Prisma/Knex client-like transaction scope |
| `def get_db(): ... yield db ... finally: db.close()` | A generator function FastAPI uses as a dependency — it hands a fresh session to a route, then guarantees it's closed after the request finishes, even on error | Middleware that opens a DB connection per-request and closes it in a `finally`/`res.on('finish')` |

**Why they exist:** the two files together are "how the app talks to Postgres" — kept separate from the models themselves so the connection/session machinery doesn't get tangled with table definitions.

**Verified:** imported cleanly with no errors when `main.py` (and its route imports) ran; confirmed no side effects on the existing `/health`/`/chat` routes.

---

### `backend/models/` (`customer.py`, `shipment.py`, `package.py`, `chat_session.py`, `__init__.py`)

`shipment.py` is representative of the pattern used across all four model files:

| Line | What it does | JS/Node analogy |
|---|---|---|
| `class ShipmentStatus(str, enum.Enum): LABEL_CREATED = "label_created"` | A Python enum whose members are also strings — `ShipmentStatus.LABEL_CREATED == "label_created"` is `True`. Defines the fixed set of allowed shipment states from REQUIREMENTS.md §4.4 | A TS `enum` or string-literal union type (`"label_created" \| "in_transit" \| ...`) |
| `class Shipment(Base): __tablename__ = "shipments"` | One Python class = one Postgres table. `Base` is the shared registry from `db/base.py` | A Prisma/TypeORM entity class |
| `id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` | The primary key column, typed as a Postgres `uuid`, generated in Python (`uuid.uuid4()`) at insert time rather than by a Postgres extension | `@Id @Default(uuid())` in Prisma schema syntax |
| `customer_id: ... = mapped_column(UUID(...), ForeignKey("customers.id"))` | A foreign key column pointing at another table's primary key — this is what makes `customer_id` a real relational link, not just a loose string | `@relation` / a foreign key column in Prisma |
| `status: Mapped[ShipmentStatus] = mapped_column(Enum(ShipmentStatus, name="shipment_status", values_callable=...))` | Maps the column to a native Postgres `ENUM` type. `values_callable` is the important part: by default SQLAlchemy would store the Python member *name* (`"LABEL_CREATED"`) in the DB — this tells it to store the member's `.value` instead (`"label_created"`), matching the spec's exact casing | Telling an ORM enum mapping to serialize by value, not by key |
| `estimated_delivery: Mapped[date] = mapped_column(Date)` / `last_update: Mapped[datetime] = mapped_column(DateTime)` | `date` (no time component) vs `datetime` (full timestamp) — deliberately different types matching the spec's `estimated_delivery (date)` / `last_update (datetime)` distinction | `Date` vs `DateTime` column types in any typed ORM |

The other three files follow the identical pattern: `Customer` (plain string columns, no FKs — the root entity), `Package` (FK to `shipments.id`, `Numeric` columns for `weight_kg`/`declared_value` since money/measurements shouldn't be floats), and `ChatSession` (nullable FK to `customers.id` since a session starts anonymous, its own `ChatSessionState` enum with the same `values_callable` fix, and a `JSONB` column for `transcript` defaulting to an empty list).

**Week 2, Chunk A addition to `ChatSession`:** two more nullable columns, `pending_customer_id` (another FK to `customers.id`, separate from the real `customer_id`) and `pending_identity` (`JSONB`, nullable — no default). The distinction matters: `customer_id` only gets set once a session is actually `Verified`; `pending_customer_id`/`pending_identity` are scratch space for identity fields collected *during* the conversation, before any match against `Customer` is confirmed. Neither column is written to yet — they exist so the upcoming identity-extraction chunk has somewhere to put partial results as they're collected turn-by-turn.

`models/__init__.py` just imports all four classes in one place — this is the single import Alembic's `env.py` needs to make `Base.metadata` aware of every table, rather than each migration script having to know which files define which models.

**Why it exists:** these are the four tables the entire product is built on (Section 4.4/4.6 of REQUIREMENTS.md) — customer identity, shipment/package data the chat looks up, and the chat transcript itself. Defined as Python classes rather than raw SQL so Alembic can autogenerate and evolve the schema going forward.

**Verified:** `alembic revision --autogenerate` correctly detected all four tables from these models with no manual SQL; after fixing the enum `values_callable` issue and re-generating, `\d shipments`/`\d chat_sessions` in psql confirmed the enum columns store lowercase values (`label_created`, `anonymous`, etc.) matching the spec exactly.

---

### Alembic (`backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/versions/`)

| Line | What it does | JS/Node analogy |
|---|---|---|
| `import models` | Just importing the package runs `models/__init__.py`, which imports all four model classes — this is what actually populates `Base.metadata` with table definitions, even though nothing in `models` is directly referenced by name here | Importing a barrel file purely for its side effects (registering things on a shared registry) |
| `config.set_main_option("sqlalchemy.url", DATABASE_URL)` | Overrides the placeholder URL in `alembic.ini` at runtime with the real one from `.env`, so the connection string lives in exactly one place instead of being duplicated | Reading a connection string from `process.env` instead of hardcoding it in a config file |
| `target_metadata = Base.metadata` | Tells Alembic's `--autogenerate` what the "target" schema should look like (from the Python models), so it can diff that against the database's *actual* current schema and generate the difference as a migration | The diffing step in `prisma migrate dev` — comparing your schema file against the live database |

**Why it exists:** Alembic is the migrations tool — the same job as Prisma Migrate/`knex migrate`, generating versioned, reviewable migration files instead of hand-run `CREATE TABLE` statements. `alembic init alembic` scaffolded the folder structure; the edits above (in `alembic/env.py`) are what wire it to this project's actual models and database instead of a generic template.

**Verified:** `alembic revision --autogenerate -m "..."` generated `alembic/versions/36bfe30ad2d1_....py` detecting all four new tables with correct columns/FKs/enums; `alembic upgrade head` applied it cleanly (`alembic_version` table confirms the current revision); `psql \dt` shows all five tables (four real + Alembic's own bookkeeping table).

**Week 2, Chunk A follow-up migration:** `alembic/versions/6936a11647d2_....py`, autogenerated after adding `pending_customer_id`/`pending_identity` to `models/chat_session.py` — detected the two new columns plus the new foreign key with no manual edits needed, and `alembic upgrade head` applied it cleanly against the already-seeded dev database (the migration only adds nullable columns, so existing rows needed no backfill).

---

### `backend/tests/` (`pytest.ini`, `conftest.py`, 5 test files)

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `pytest.ini`'s `pythonpath = .` | Adds `backend/` itself to `sys.path` when pytest runs, so `tests/*.py` can `from routes.chat import ...` etc. the same way `main.py` does, regardless of the directory pytest was invoked from | A `jest.config.js` `moduleDirectories`/`roots` entry, or a `tsconfig` path alias |
| `conftest.py`'s `db_session` fixture — `connection = engine.connect(); transaction = connection.begin(); session = Session(bind=connection); yield session; ...; transaction.rollback(); connection.close()` | Runs every test against the **real dev Postgres** (reusing `db.session.engine`, so the exact same `DATABASE_URL`), not a second SQLite test database — this project's models use Postgres-only column types (`JSONB`, native `Enum`), and `DEV_PLAN.md`'s locked decision is Postgres-only, no second datastore. Each test gets its own transaction that's rolled back on teardown, so nothing a test writes ever persists — no truncate step, no dedicated test DB to provision | A test wrapping each Jest test in a DB transaction via `prisma.$transaction` and rolling it back afterward, instead of pointing tests at SQLite or a Docker-spun throwaway Postgres |
| `_clear_verification_store` (`autouse=True`) | Clears `services.verification_store._store` — the 2FA code dict — before and after every test. This is the one piece of state a DB-transaction rollback alone wouldn't reset: the store is a plain module-level dict (Chunk D's deliberate "no Redis" decision), which lives at Python-process scope, not inside any DB transaction | Resetting an in-memory singleton/cache between test cases, since a DB transaction rollback wouldn't touch it either |
| `make_customer`/`make_session` fixtures | Small factory fixtures — `make_customer(**overrides)`/`make_session(**overrides)` build-and-commit a real `Customer`/`ChatSession` row (defaults filled in, e.g. a `uuid4`-suffixed phone/address so parallel tests never collide), returning the ORM object with its DB-assigned `id` populated. Every test file uses these instead of constructing rows by hand | A `factory-bot`/`fishery`-style test factory function |

**What the 5 files actually assert (not just "it runs"):**
- `test_session_identity.py` — two sessions created with no `session_id` get distinct UUIDs; an existing `session_id` resumes that exact row rather than creating a new one; `pending_identity` set on one session is never visible when resuming a different one (Chunk A's actual bug fix, now pinned down instead of just narrated).
- `test_identity_neutral_message.py` — mismatching only the first name, only the last name, only the phone, or only the address each independently return the identical `IdentityStatus.REJECTED` (never a different status that would hint which field was wrong), and the fixed `NEUTRAL_IDENTITY_MESSAGE` string itself is pinned verbatim so a future edit can't quietly make it conditional. A positive control confirms a real match still succeeds case-insensitively.
- `test_verification_flow.py` — 3 wrong codes locks out, with `attempts_remaining` counting 2 → 1 → 0 exactly; a correct code reaches `VERIFIED` and clears `customer_id`/`pending_customer_id`/`pending_identity` together; an *expired* code is rejected even when it's otherwise correct. Expiry is tested by monkeypatching `datetime` inside `tools.check_verification_code` (a fake class whose `.now()` returns a time past `CODE_TTL_SECONDS`), not by mutating the stored `expires_at` directly — the actual `datetime.now(timezone.utc) >= pending.expires_at` comparison is what's under test, not a shortcut around it.
- `test_tool_allowlist.py` — a hallucinated tool name (`lookup_shipments`, which doesn't even exist as a tool yet) is dropped; `verify_identity` is accepted while `CollectingIdentity`; the same real `verify_identity` call is rejected once the session is `EscalatedToHuman` — proving `_dispatch_tool`'s allowlist is scoped to the *current session state*, not just "is this a real tool name."
- `test_escalation_no_leak.py` — escalates a fresh `Anonymous` session, then asks a shipment question in the same still-unverified session. `ollama_client.chat` is monkeypatched to a stub that records what it was called with and returns a canned `ChatCompletionResult` — deliberately not a real Ollama call, since what's being tested is structural (no tool offered, `customer_id` never set, the `POST_ESCALATION_UNVERIFIED_INSTRUCTIONS` text actually present in the system message), not "did the model's prose sound like a decline," which the model can't be trusted to guarantee on its own.

**Why it exists:** Chunk I — every one of these behaviors was already verified by hand, live, in an earlier chunk (Chunks A/B3/D/F2/G4), but only ever documented in `CHANGE_LOG.md` prose; nothing would have caught a regression. Several of the assertions above double as a guardrail on a *decision*, not just a behavior: `ollama_client.chat()` returning a `ChatCompletionResult` dataclass (Chunk B) has to hold for `test_escalation_no_leak.py`'s mock to even type-check against real call sites; the 300s/3-attempts constants (Chunk D) are imported directly (`CODE_TTL_SECONDS`) rather than re-hardcoded in the test, so the test can't silently drift from the real value; the in-memory-dict-not-Redis call (Chunk D) is exactly why `_clear_verification_store` has to exist as its own fixture at all.

**Verified:** `pytest` (from `backend/`, venv active) — 12/12 passing. Row counts in the real dev DB (`customers`, `chat_sessions`) confirmed identical before and after two full test runs, by hand via `psql` — direct evidence the rollback fixture leaves zero trace, not just an assumption about how the fixture *should* behave.

---

## Scripts

### `scripts/seed_data.py`

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))` | This script lives outside `backend/`, but `backend`'s own modules (`db.session`, `models`) are written as if `backend/` is the working directory (same pattern as `alembic/env.py`). This line puts `backend/` on Python's module search path at runtime so `from db.session import ...` resolves regardless of where the script is invoked from | Adding a path to `NODE_PATH`, or a `tsconfig` path alias, so an import resolves without a relative `../../` chain |
| `FIRST_NAMES` / `LAST_NAMES` | Fixed pools of English/US, Serbian, and Russian names, combined independently at random per customer (so a first/last name pairing can cross nationality — realistic enough for mock data, not meant to model real naming conventions) | A hardcoded fixture array instead of a fake-data library |
| `STATUS_WEIGHTS` + `random_status()` | A weighted-random pick across `ShipmentStatus` — mostly `delivered`/`in_transit`, a few `out_for_delivery`/`label_created`, fewest `exception` — via `random.choices(statuses, weights=weights)` | Weighted random selection, same idea as a loot-table roll |
| `build_customers(count)` | Builds `Customer` ORM instances (not yet saved) — same model class `backend/models/customer.py` defines | Building an array of plain objects shaped like the DB rows, before an `insertMany` call |
| `build_shipment(customer)` | Builds one `Shipment` instance linked to a given `Customer` via `customer_id`; sets `last_update` to a recent random date and `estimated_delivery` a few days after it | Same idea, deriving a foreign key from an in-memory parent object before either is persisted |
| `build_packages(shipment)` | Builds 1–3 `Package` instances per shipment — satisfies the "≥1 Package per shipment" requirement | A `.map()` generating a small random-length array per parent |
| `db.add_all(...)` / `db.flush()` | `add_all` stages objects in the session (nothing hits Postgres yet); `flush()` sends pending `INSERT`s to the DB *without* committing, which is what assigns the auto-generated UUID primary keys so later objects (e.g. `Shipment.customer_id`) can reference them | Similar to a transaction's intermediate `INSERT ... RETURNING id` before the transaction commits |
| `db.commit()` / `db.rollback()` in `try`/`except`/`finally` | Commits everything as one transaction if nothing raised; rolls back cleanly on any error so a failed run doesn't leave partial data; `finally: db.close()` always releases the session | A single wrapped DB transaction with a `catch` that rolls back and a `finally` that releases the connection |
| `if __name__ == "__main__": seed()` | Only runs when invoked directly (`python scripts/seed_data.py`), not if ever imported elsewhere | `require.main === module` check |

**Why it exists:** Week 1's schema (Step 5) was real but empty — nothing for the chat to look up yet. This script populates it once, directly through the same ORM models the app itself uses (not raw SQL), so the mock data is guaranteed to match the schema exactly.

**Verified:** ran via `python scripts/seed_data.py` against the running Postgres container — completed cleanly, printing `Seeded 26 customers, 52 shipments, 104 packages.` (within the required 25+/40–60/≥1-per-shipment ranges). Spot-checked via `psql`: customer names show the intended English/Serbian/Russian mix, `shipments` status distribution is delivered/in_transit-heavy with only a few exceptions, and a join against `packages` confirms every shipment has at least one linked package.

---

## Frontend

Unlike the backend sections above, no JS/Node analogy column here — React/TS is this project's home turf already. These sections instead call out the constructs and decisions that aren't self-evident from reading the file.

### `frontend/src/styles/` (`_variables.scss`, `_mixins.scss`, `global.scss`)

| File | What it holds |
|---|---|
| `_variables.scss` | SCSS variables (not CSS custom properties) for color palette, spacing scale, radius, and type scale — includes a dedicated set of five status colors (`$color-status-*`) keyed to the backend's `ShipmentStatus` enum values, so the badge coloring in `ShipmentCard` has a 1:1 source of truth |
| `_mixins.scss` | Four small mixins: `flex-center`, `card-surface` (border+radius, the shared look behind the sidebar's admin card, the chat input bar, and `ShipmentCard`), `button-reset`, `truncate-text`. Kept intentionally short — no breakpoint/responsive mixins yet since nothing in the current layout needs them |
| `global.scss` | Box-sizing reset, base body font/color, `#root`/`html`/`body` full-height, list/button resets. `@use`s `_variables.scss` so its tokens are available without a separate import in every component |

Per-component SCSS files (`Sidebar.scss`, `ChatWindow.scss`, `ChatMessage.scss`, `ShipmentCard.scss`) each `@use` `variables`/`mixins` and hold one BEM block (`.sidebar`, `.chat-window`, `.chat-message`, `.shipment-card`) — no shared/global component styles outside this `styles/` folder.

**Why it exists:** the SCSS+BEM baseline from `DEV_PLAN.md`'s locked styling decision — plain SCSS, no CSS Modules, no Tailwind. `_variables.scss`/`_mixins.scss` is the one design-system partial every component styles from.

**Verified:** `npm run build` (which runs `tsc -b` then `vite build`) compiles all `.scss` imports with no errors; rendered output confirmed visually against `ai-chatbot-ui-mockup.png` via a headless-browser screenshot.

---

### `frontend/src/App.tsx`

| Construct | What it does |
|---|---|
| `const [sessionKey, setSessionKey] = useState(0)` | Owned by `App`, not `ChatWindow` — `ChatWindow` keeps its own `messages` state fully internal (per the "keep business logic out of shared/parent state unless needed" instinct), so `App` doesn't need to know anything about chat internals to reset it |
| `<ChatWindow key={sessionKey} />` | Passing a changing `key` is React's built-in "throw this subtree away and remount fresh" mechanism — clicking Sidebar's "New Chat" bumps `sessionKey`, which unmounts the old `ChatWindow` (and its state) and mounts a brand new one seeded back to the hardcoded message. No custom reset prop/effect needed. |

**Why it exists:** the composition root — lays out `Sidebar` + `ChatWindow` side by side and is the one place that knows both exist, without either component needing to know about the other.

**Verified:** clicking "New Chat" after sending a message reliably drops the list back to just the seed message (confirmed via headless-browser screenshot, see `ChatWindow` section below).

---

### `frontend/src/components/Sidebar/` (`Sidebar.tsx`, `ChatHistoryList.tsx`, `AdminAccessCard.tsx`)

| File | What it does |
|---|---|
| `Sidebar.tsx` | Static brand header, the "New Chat" button (calls the `onNewChat` prop `App` passes down — see above), and composes `ChatHistoryList` + `AdminAccessCard` |
| `ChatHistoryList.tsx` | A hardcoded array of `{id, label, time}` rendered as a non-interactive list — a visual placeholder for real chat-history persistence, which doesn't exist yet (no session id, no `ChatSession` list endpoint) |
| `AdminAccessCard.tsx` | Static card + a `href="#"` "Learn more" link — no Auth0 wired up (that's Week 4 per `DEV_PLAN.md`) |

All three share one `Sidebar.scss` (all their classes are elements of the single `.sidebar` BEM block, so splitting the SCSS per-file would fragment one block's styles across three files for no benefit).

**Why it exists:** step 8's scope was a hardcoded/echo `ChatWindow`, but the user asked for the full mockup shell (sidebar included) as a static skeleton now, with the genuinely-backend-dependent pieces (real history, admin auth) deferred rather than faked with more elaborate mock logic.

**Verified:** rendered correctly in a headless-browser screenshot (`npm run dev` + Playwright), matching `ai-chatbot-ui-mockup.png`'s sidebar layout.

---

### `frontend/src/hooks/useChatSession.ts`

| Construct | What it does |
|---|---|
| `export function useChatSession()` | **New in Chunk F.** A small hook, not a global store or context provider — deliberately consistent with the project's existing "React Query is the only shared state" convention (`DEV_PLAN.md`'s locked decision explicitly rules out Zustand/context for this HTTP-only app). Called fresh inside `ChatWindow` on every mount, so it has no lifetime beyond one chat session |
| `const [sessionId, setSessionId] = useState<string>(); ...state...; ...event...; ...escalation...` | Four independent `useState` calls, one per `ChatResponse` field this hook tracks. `event`/`escalation` default to `null` (matching the backend's `\| None` semantics) rather than `undefined`, since a caller checking "is there an active escalation" wants a clean `null`-check, not an `undefined`-vs-`null` distinction that means nothing here |
| `function applyResponse(response: ChatResponse) { ... }` | The one function `ChatWindow` calls after a successful turn — pulls all four fields out of a real `ChatResponse` in a single call, instead of the component doing four separate `setX(response.data.x)` calls itself |

**Why it exists:** before Chunk F, `ChatWindow.tsx` held `sessionId` in its own `useState` and never touched `state`/`event`/`escalation` at all — those fields existed on the wire since Chunk A/E but nothing on the frontend read them. Extracting the read/write logic into one hook means the code modal (Chunk G, below — reacts to `event === "code_sent"`) and the escalation banner (Chunk H, reacts to `escalation`) can both consume the same hook from `ChatWindow` without either needing to know how `sessionId` threading works internally.

**Verified:** `tsc -b`, `vite build`, and `oxlint` all clean after wiring it into `ChatWindow.tsx`. See that section below for the live session-isolation check, since at the time this had no behavior tested in isolation. **Since the Chunk I follow-up**, `useChatSession.test.ts` (see the `frontend` test infrastructure section near the end of this file) directly unit-tests `applyResponse`'s field-merging and its `?? null` normalization, independent of `ChatWindow`.

---

### `frontend/src/components/CodeModal/` (`CodeModal.tsx`, `CodeModal.scss`)

| Construct | What it does |
|---|---|
| `interface CodeModalProps { open: boolean; sessionId: string; onVerified: (message: string) => void }` | A controlled component — `ChatWindow` owns whether it's open, not `CodeModal` itself. `onVerified` takes the backend's own success message (`"You're verified! ..."`) as an argument, so `ChatWindow` can append it as a real bot bubble rather than the modal inventing its own wording |
| `const [digits, setDigits] = useState<string[]>(...)` (6 slots) + `inputRefs = useRef<(HTMLInputElement \| null)[]>([])` | One controlled `<input maxLength={1}>` per digit. `handleDigitChange` strips non-digits via `.replace(/[^0-9]/g, '')` and auto-focuses the next box; `handleDigitKeyDown` moves focus back on Backspace over an empty box, and submits on Enter. No form library — matches the project's existing convention (`ChatWindow`'s own input is a plain controlled `<input>` too) |
| `const [dismissed, setDismissed] = useState(false)`, `const [verified, setVerified] = useState(false)`, `const [locked, setLocked] = useState(false)` | Three independent terminal-ish flags layered on top of the `open` prop. `visible = open && !dismissed && !verified` is what actually gates rendering — `if (!visible) return null` after all hooks are called (so the rules of hooks aren't violated by the early return) |
| Escape-key `useEffect` (`window.addEventListener('keydown', ...)`, scoped to `visible`) + backdrop `onClick` (with `event.stopPropagation()` on the inner dialog) | Both just call `setDismissed(true)` — a pure client-side, no-network-call action. This is what makes "dismissible without losing server-side progress" true by construction: dismissing touches no endpoint, so the pending code/attempt-count in `services/verification_store.py` is completely unaffected |
| `verifyMutation.mutate({ data: { session_id, code } }, { onSuccess, onError })` | Calls the generated `useVerifyCode()` mutation (Chunk D). On `success: true` → `setVerified(true)` (hides the modal) and calls `onVerified(data.reply)`. On `success: false` → shows `data.reply` verbatim (the exact `CODE_MISMATCH_MESSAGE`/`CODE_LOCKED_OUT_MESSAGE`/`CODE_EXPIRED_MESSAGE` text from `routes/verify.py`, never a client-invented string) plus `data.attempts_remaining` if present, clears the digit boxes, and refocuses box 1 |
| `if (data.state !== 'awaiting_code') setLocked(true)` | Detects both `LOCKED_OUT` and `EXPIRED` the same way, generically — both revert `session.state` away from `awaiting_code` server-side (Chunk D), so checking the resulting `state` string is more robust than pattern-matching `data.reply`'s text, and doesn't need its own copy of `VerifyStatus`'s enum values. Once `locked`, the digit inputs disable and only Cancel remains clickable |

**Deliberate deviations from the pasted chunk spec, both documented in `CHANGE_LOG.md`:**
1. **File is `CodeModal.scss`, not `CodeModal.module.scss`.** The spec named a CSS Modules file; `DEV_PLAN.md`'s locked styling decision is plain SCSS + BEM project-wide, no CSS Modules. Built with the same `.code-modal__*` BEM pattern as every other component instead.
2. **`ChatWindow.tsx` passes a remounting `key`, not just the `open` boolean.** The hook's `event` field is sticky — it doesn't reset to `null` between turns on its own — so after a lockout-triggered resend (Chunk D's existing backend fallback), a fresh code's response still carries the *same* `event: "code_sent"` string as the code before it. React's `Object.is` state-update bailout means a literal `open` boolean wouldn't be seen as "changing" in that case, so nothing would reset `CodeModal`'s internal digits/dismissed/locked state for the new code. `ChatWindow` works around this with a plain incrementing `codeModalKey` (bumped in `onSuccess` whenever `response.data.event === 'code_sent'`), passed as React's `key` prop — forcing a full unmount/remount, and therefore a clean slate, on every genuinely new code, not just the first one.

**Why it exists:** the first real frontend surface for any of Week 2's identity/2FA work — before this, the entire flow (Chunks A–D) was only reachable via curl/Swagger. Styled against `ai-chatbot-modal-mockup.png` (shield icon, centered card, 6 digit boxes, Cancel/Verify Code buttons), minus the mockup's static pre-attempt "3 of 5" count, which was deliberately left out since the backend doesn't expose `MAX_ATTEMPTS` proactively (only `attempts_remaining` after a real wrong attempt) — hardcoding a duplicate "3" client-side risked silently drifting from the real constant in `services/verification_store.py`.

**Verified:** `tsc -b`/`vite build`/`oxlint` all clean. No browser-automation tool was available this session (same limitation as Chunk F), so the live behavior was driven manually by the user against the rebuilt Docker frontend/backend: dismissing via Escape mid-flow closed the modal cleanly with the rest of the chat still fully responsive; typing 3 wrong codes directly into an open modal correctly showed the exact backend lockout message and disabled further input; and — the test that actually exercises the `codeModalKey` remount fix — after that lockout, sending an ordinary follow-up chat message triggered the backend's existing auto-resend fallback, and the modal reopened fresh (empty boxes, no stale locked-out message) rather than staying stuck in its previous dismissed/locked state. **Since the Chunk I follow-up**, `CodeModal.test.tsx` covers the digit-input/lockout state machine itself with a real `<QueryClientProvider>` and only `global.fetch` mocked — see the `frontend` test infrastructure section near the end of this file — so this component's own logic no longer depends solely on a human re-clicking through it to catch a regression.

---

### `frontend/src/components/EscalationBanner/` (`EscalationBanner.tsx`, `EscalationBanner.scss`)

| Construct | What it does |
|---|---|
| `interface EscalationBannerProps { escalation: EscalationPayload; onHumanJoined?: () => void }` | Purely presentational — takes the payload `ChatWindow` already has (no fetch, no session awareness of its own) and an optional callback so the parent can react to one specific beat without the banner needing to know *why* |
| `const [visibleCount, setVisibleCount] = useState(1)` + a `useEffect` re-arming a `setTimeout` every `REVEAL_INTERVAL_MS` (700ms) until `visibleCount === escalation.lines.length` | Client-side-only pacing, per Epic G3 — the backend already sent all 4 lines in one response (`routes/chat.py`'s `_handle_escalation()`), so "staggered reveal" is entirely a frontend animation over data that already arrived, not multiple round-trips |
| `const HUMAN_JOINED_LINE_INDEX = 1` + a second `useEffect` firing `onHumanJoined()` (guarded by a `useRef` flag so it only ever fires once) once `visibleCount` passes that index | Index `1` is "Melany has entered the chat" — the second of the backend's `ESCALATION_SCRIPT_LINES`. This is a **fixed-position assumption**, not content-matched: the banner has no way to know *which* line means "a human joined" other than by its stable position in the array the backend always builds the same way. Documented here so a future change to `ESCALATION_SCRIPT_LINES`'s order would need this constant updated too |

**Deliberate deviation from the pasted chunk spec, same pattern as Chunk G:** built as `EscalationBanner.scss` (plain BEM), not the `.module.scss` the spec named — `DEV_PLAN.md`'s locked styling decision rules out CSS Modules project-wide.

**Why it exists:** the first real frontend surface for Chunk E's escalation-theater backend (built Week 2, Day 3) — before Chunk H, "Melany" only existed as a `reply` string and an unused `escalation` field on the hook. Two new tokens, `$color-human-joined-bg`/`$color-human-joined-border` (`_variables.scss`), give the banner card and the color-shift modifier (see `ChatWindow.scss` below) a shared, intentionally distinct-from-`$color-primary` visual identity — a soft mint rather than the app's usual blue, so "a human joined" reads as its own kind of event rather than another system message.

**Verified:** `tsc -b`/`vite build`/`oxlint` clean. The reveal-timing/color-shift *animation* itself was user-verified live in the real browser (no automation tool available to drive typed chat input this session) — both from a from-scratch `Anonymous` session (nameless greeting) and from a `Verified` one (personalized greeting), see `ChatWindow`'s entry below. Backend contract and the fixed-position assumption above were independently re-confirmed via direct `curl` calls: escalating returns exactly 4 lines with `"Melany has entered the chat"` at index 1 in both cases, and re-asking a shipment question in the same still-unverified session right after escalating gets a neutral identity request rather than shipment data (Epic G4 held). The banner's CSS itself (border/background/icon/bold-last-line) was screenshot-verified via a static HTML harness reusing the real compiled bundle.

---

### `frontend/src/components/ChatWindow/` (`ChatWindow.tsx`, `ChatMessage.tsx`, `ShipmentCard.tsx`, `types.ts`)

| File | What it does |
|---|---|
| `types.ts` | Local types only — `ChatMessageData`, `ShipmentCardData`, `PackageItem`, `ShipmentStatus`. Deliberately not shared with the backend yet; once Orval is wired up (a later step), the real request/response types will come from generated code instead, and these may get replaced. **Chunk H** added `'escalation'` to the `ChatRole` union and an optional `escalation?: EscalationPayload` field (imported straight from the generated client) to `ChatMessageData` — the same "optionally attach a variant's data" precedent `shipment?: ShipmentCardData` already set |
| `ChatWindow.tsx` | Owns `messages: ChatMessageData[]` (`useState`, seeded with one hardcoded bot message) and `draft: string` (the input) directly. As of Week 2, **Chunk F**, `sessionId`/`event`/`applyResponse` no longer live in this component's own `useState` calls — they're read from `const { sessionId, event: sessionEvent, applyResponse } = useChatSession()` (aliased to avoid shadowing the DOM `event` parameters `handleSubmit`/`onChange` already use; see the hook's own section above). `handleSubmit` optimistically appends the user's message, then calls the generated `useChat()` mutation with `{ data: { message: text, session_id: sessionId } }`; on a `200` response, `onSuccess` calls `applyResponse(response.data)` before appending the reply bubble, and — **Chunk G** — bumps a `codeModalKey` counter whenever `response.data.event === 'code_sent'` (see `CodeModal`'s section above for why a plain boolean isn't enough on its own). Renders `<CodeModal key={codeModalKey} open={sessionEvent === 'code_sent'} sessionId={sessionId ?? ''} onVerified={handleCodeVerified} />` as the first child of the `<section>`, where `handleCodeVerified` just appends the backend's own success message as a new bot bubble. **Chunk H**: `onSuccess` now checks `response.data.event === 'escalated'` *before* falling through to the generic bot-bubble push — when true, it destructures `const { escalation } = response.data` first (checking `response.data.escalation` inline tripped a TS narrowing error against the generated `EscalationPayload | null | undefined` type) and pushes a `role: 'escalation'` message carrying that payload, then `return`s early. A new `humanJoined` boolean (`useState(false)`) is flipped by an `onHumanJoined` callback passed down through every `<ChatMessage>` to `EscalationBanner` (see its own section below), and the root `<section>`'s className conditionally appends `chat-window--human-joined` for the color shift. `chatMutation.isPending` drives a "Typing…" bubble and disables the input/send button while a request is in flight. A `messageListRef` + `useEffect` keyed on `[messages, chatMutation.isPending]` scrolls the list to the bottom on every change — without it, new messages/the typing indicator render below the fold since `.chat-window__message-list` is a fixed-height `overflow-y: auto` region that doesn't auto-scroll on its own |
| `ChatMessage.tsx` | One bubble; `role` picks the BEM modifier (`chat-message--user`/`--bot`) and which side the avatar renders on. Renders a `ShipmentCard` if `message.shipment` is present. **Chunk H** added an early return: when `message.role === 'escalation'` and `message.escalation` is set, it renders `<EscalationBanner>` directly instead of the normal bubble/avatar markup, so the escalation sequence gets its own full-width layout rather than being squeezed into a chat bubble |
| `ShipmentCard.tsx` | Pure presentational component. Its prop shape (`ShipmentCardData`) intentionally mirrors only the fields that exist on the backend's `Shipment`/`Package` models (`tracking_number`, `carrier`, `origin`/`destination`, `status`, `estimated_delivery`, `last_update`, and `Package.description`/`weight_kg`/`declared_value`) — the mockup's Reference Number, Service Type, Shipment Date, item Quantity/Unit, and the separate Timeline card were all left out because none of that data exists in the DB yet, and the goal was a card that could plausibly render real data later, not a richer mock |

**Why it exists:** step 8 proved the component structure, BEM styling, and local-state interaction pattern (`useState` + controlled input) before any of it dealt with async/`fetch`/React Query; the Orval step then swapped the local-echo `handleSubmit` for a real `useChat()` call without touching that structure, and Chunk F (above) moved the session/event/escalation bookkeeping out into its own hook so `ChatWindow` stays focused on rendering + submission. `messages` and the seed data still live in `ChatWindow.tsx` itself — the seed message (with its mock `ShipmentCard`) is kept as message #1 so the card component stays visually demoed, since real backend replies are plain text only until Week 2+'s tool-calling lands. The `sessionId` tracking added in Chunk A isn't a nice-to-have: the backend's old "most recent open session" fallback was removed as part of that same chunk, so without this, every message sent from the browser would silently start a brand-new session instead of continuing the visible conversation.

**Verified:** headless-browser script drove the real dev server + backend together (Week 1/Chunk A) — confirmed the actual `POST /chat` network request/response (not just that a `fetch` call exists in the code), the typing indicator appearing then clearing, the real `qwen3:8b` reply rendering as a new bubble, auto-scroll bringing it into view, and zero console errors. A raw `curl` timing check (`~77s` for a reply, CPU-only) was used to size the test's wait timeout correctly. Chunk A's `sessionId` wiring was verified separately via `tsc -b`/`vite build`/`oxlint` passing, plus the backend-side `curl` checks documented in `routes/chat.py`'s entry above. **Chunk F's refactor** was verified via `tsc -b`/`vite build`/`oxlint` (all clean) plus a backend-level sanity check that two independent no-`session_id` requests still return distinct UUIDs; the actual two-tab, cross-session-isolation test (no automated browser tool available this session) was driven manually by the user — two real seeded identities in two separate tabs (Viktor Ivanov, Jovana Markovic) each matched independently, got their own mock 2FA code, and showed no cross-tab bleed, with "New Chat" confirmed to issue a genuinely fresh `session_id`. **Chunk G's `CodeModal` wiring** was likewise `tsc -b`/`vite build`/`oxlint` clean, then user-verified live: Escape-dismissing the modal left the rest of the chat fully responsive, and a full lockout → follow-up-message → auto-resend sequence correctly reopened the modal fresh (see `CodeModal`'s own section above for detail). **Chunk H's** escalation-message push + `humanJoined` color shift were user-verified live twice: once triggering `"I want to talk to a human"` as the very first message of a fresh session (all 4 lines staggered in, background faded to mint mid-reveal, generic nameless closing line), and once after a full identity-verify round-trip with a real seeded customer (Jovana Markovic) first, confirming the closing line came back personalized ("Hey Jovana, ...").

---

### `frontend/src/main.tsx`

Wraps `<App />` in `<QueryClientProvider client={queryClient}>` (a single `new QueryClient()` created at module scope) — required for any Orval-generated React Query hook (`useChat()`, etc.) to work at runtime; without a provider ancestor, calling the hook throws.

---

### `frontend/src/api/generated/` (`secure-ship.ts`) + `frontend/orval.config.ts`

| Construct | What it does |
|---|---|
| `orval.config.ts` | `input.target` points at the backend's live `http://localhost:8000/openapi.json` (backend must be running to regenerate); `output.client: 'react-query'`, `output.httpClient: 'fetch'` (Orval's built-in fetch client — deliberately chosen over the axios-based default so no new runtime HTTP-client dependency was needed) |
| `secure-ship.ts` | Generated, never hand-edited (enforced by convention, not tooling) — exports `ChatRequest`/`ChatResponse` types and `useChat()`, a `useMutation` wrapper whose `mutate`/`mutateAsync` take `{ data: ChatRequest }` and resolve to `{ data, status, headers }` (the fetch client doesn't throw on non-2xx, so callers check `response.status` themselves — that's why `ChatWindow.tsx` checks `response.status === 200` inside `onSuccess` rather than only handling `onError`). Regenerated across several Week 2 chunks as the backend schema grew: Chunk A added `ChatRequest.session_id` and `ChatResponse.session_id`/`state`/`event`/`escalation`; Chunk D added `VerifyCodeRequest`/`VerifyCodeResponse` and a new `useVerifyCode()` hook (`routes/verify.py`'s `operation_id="verifyCode"`, same naming trick as `useChat()`); the Chunk E **Cutover** step regenerated once more, updating `EscalationPayload` from Chunk A's placeholder `human_name`/`greeting` shape to the real `lines`/`agent_name`/`first_name` fields `routes/chat.py`'s `_handle_escalation()` actually populates — nothing else changed, since `useChat`/`useVerifyCode` themselves were already current |

**Why it exists:** the locked "no hand-written fetch calls or duplicated TS types" decision (`DEV_PLAN.md`/`REQUIREMENTS.md` §4.8) — `ChatRequest`/`ChatResponse` are generated straight from the backend's Pydantic models via its OpenAPI schema, so the two can't silently drift. The backend's `/chat` route was given an explicit `operation_id="chat"` (`routes/chat.py`) purely so the generated hook name comes out as `useChat()` instead of an auto-derived `useSendChatMessageChatPost()`.

**Verified:** `npm run generate:api` produces this file cleanly against the running backend each time it's been rerun (Chunk A, Chunk D, Chunk E's Cutover); `tsc -b`/`oxlint`/`npm run build` pass after every regeneration; see `ChatWindow.tsx`'s entry above for the `useChat()` runtime check. The Cutover regeneration confirmed `EscalationPayload`'s three fields (`lines`, `agent_name`, `first_name`) present with correct types and no other diff beyond that one interface.

---

### `frontend` test infrastructure (`vitest.config.ts`, `src/test/setup.ts`) + `useChatSession.test.ts` / `CodeModal.test.tsx`

| Construct | What it does |
|---|---|
| `vitest.config.ts` — `mergeConfig(viteConfig, defineConfig({ test: {...} }))` | Reuses `vite.config.ts`'s own plugin setup (`@vitejs/plugin-react`) rather than duplicating it in a second config file — Vitest is built directly on top of Vite's dev pipeline, so this is the standard pairing, not a separate test runner needing its own transform config |
| `test.environment: 'jsdom'` | Runs component tests in a simulated DOM (no real browser) — needed for anything under `@testing-library/react`, since Node has no `document`/`window` on its own |
| `test.globals: true` | Makes `describe`/`it`/`expect`/`vi`/`beforeEach`/`afterEach` available without per-file imports. Also what makes `@testing-library/react`'s automatic post-test `cleanup()` actually register — Testing Library detects a global `afterEach` and hooks into it itself; without `globals: true` it wouldn't find one and unmounted components would leak between tests |
| `src/test/setup.ts` (`import '@testing-library/jest-dom/vitest'`) | Registers jest-dom's matchers (`toBeInTheDocument`, `toBeDisabled`, `toHaveFocus`, etc.) onto Vitest's own `expect` — the `/vitest` subpath specifically, not the package's default export, which targets Jest's `expect` instead |
| `tsconfig.app.json`'s `types: [..., "vitest/globals", "@testing-library/jest-dom/vitest"]` | The *type-level* half of the two lines above — without this, `tsc -b` wouldn't know `describe`/`expect(...).toBeInTheDocument()` exist, even though they work fine at runtime |

**`useChatSession.test.ts`** (co-located with the hook) — 4 tests via `renderHook`/`act` from `@testing-library/react`: initial state is fully unset; `applyResponse` copies all four `ChatResponse` fields through in one call; a later turn's `event: null, escalation: null` actually clears a previous turn's escalation (not merged/ignored — the hook fully replaces state each call, it doesn't accumulate); and a response where `event`/`escalation` are simply *absent* from the object (not explicit `null` — both are legal per the generated `ChatResponse` type, since a real `fetch` response for an optional field can come back either way) still normalizes to `null` via the hook's own `?? null`, not `undefined`.

**`CodeModal.test.tsx`** — 6 tests. `mockVerifyResponse(body, status)` stubs `global.fetch` (`vi.stubGlobal`) with a response object shaped like what the generated `verifyCode()` client expects (`{ status, text: async () => JSON.stringify(body) }`) — this is the *only* thing mocked; `useVerifyCode()`'s real React Query mutation and `CodeModal`'s own `digits`/`locked`/`feedback`/`attemptsRemaining` state all run for real, wrapped in a real `<QueryClientProvider>`. Covers: digit auto-advance actually moves DOM focus box-to-box (`toHaveFocus()`, not just "the value updated"); Verify stays disabled until all 6 boxes are filled; a wrong code shows the backend's exact `reply` text plus `attempts_remaining`, clears all 6 boxes, and refocuses box 1; a `state !== "awaiting_code"` response (covering both `LOCKED_OUT`/`EXPIRED`, same generic check `CodeModal.tsx` itself uses) disables every digit input and the Verify button; a correct code calls `onVerified` with the backend's reply and the dialog unmounts (`queryByRole('dialog')` returns `null`); Escape dismisses with the fetch mock asserted as never called, not just inferred from the UI.

**Why it exists:** a direct follow-up to Chunk I — once the backend had a real `pytest` suite, the natural next question was frontend parity. Deliberately scoped to the two places with actual branching logic (a hook merging response fields, a modal with a real lockout/retry state machine) rather than every component — `ChatWindow`'s JSX layout or `Sidebar`'s static markup wouldn't fail in a way a unit test would catch that a type error or a glance wouldn't already catch first.

**Verified:** `npm test` (`vitest run`) — 10/10 passing. `npm run build` (`tsc -b` + `vite build`) stays clean with the new `.test.ts(x)` files present, since `tsconfig.app.json`'s `include: ["src"]` type-checks them too, but Rollup's `vite build` never bundles them into the shipped app (nothing real imports a test file). `npm run lint` (oxlint) clean.

---

<!-- Add a new "### backend/<file>" or "### frontend/<file>" section here as each new file is built. Keep entries technical and current — if a file's purpose or shape changes materially, update its section rather than leaving it stale. -->
