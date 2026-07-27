# Tech Notes

A technical reference log, organized by file/module rather than by date. Where `CHANGE_LOG.md` is the conversational "what happened, in demo-friendly language" record, this file is the "what does this piece of code actually do, and why" record — meant to be a living document that gets a new section every time a new file/module is added, and gets corrected/updated if that file changes meaningfully later.

Written with JS/Node/TypeScript analogies throughout, since that's the background this project is being learned from. Code isn't reproduced here — each section references the real file, which is the source of truth; only the constructs worth explaining are broken out below.

---

## Backend

### `backend/main.py`

| Line | What it does | JS/Node analogy |
|---|---|---|
| `from fastapi import FastAPI` | Imports the FastAPI web framework | `import express from 'express'` |
| `from routes.chat import router as chat_router` | Imports the `APIRouter` defined in `routes/chat.py` | `import chatRouter from './routes/chat'` |
| `app = FastAPI(title="SecureShip Backend")` | Creates the application instance everything else attaches routes to. `title` only labels the app in the auto-generated docs. | `const app = express()` |
| `app.include_router(chat_router)` | Mounts every route defined on that router onto the main app | `app.use('/', chatRouter)` |
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
| `@dataclass class ChatCompletionResult: content: str; tool_calls: list[dict] \| None = None` | The real return shape as of Week 2 — a plain data container (`@dataclass`, no validation, unlike the Pydantic models in `schemas/`) holding both the model's prose reply *and* any tool calls it asked to make, instead of just a bare string | A small `interface ChatCompletionResult { content: string; toolCalls?: Record<string, unknown>[] }` returned instead of a raw string |
| `def chat(messages, tools=None) -> ChatCompletionResult:` | The reusable function `routes/chat.py` (and later, tool-calling logic) imports and calls | `export async function chat(messages, tools): Promise<ChatCompletionResult> {...}` |
| `tools: list[dict] \| None = None` | An optional parameter — `\|` here is a *union type*, "either a list of dicts or `None`." Now genuinely wired: passed straight through to Ollama's request body, though no caller supplies a real schema yet (`tools/schemas.py`'s `VERIFY_IDENTITY_TOOL_SCHEMA` exists but nothing hands it to `chat()` yet — that's tool *execution*, still to come) | `tools?: Record<string, unknown>[]` in a TS function signature |
| `if tools is not None: payload["tools"] = tools` | Only adds the `tools` key to the request body when the caller actually passes some — Ollama's `/api/chat` accepts an optional `tools` field for function-calling | Conditionally spreading an optional key into a request body |
| `requests.post(OLLAMA_URL, json=payload)` | POSTs a JSON body, auto-sets `Content-Type: application/json` | `axios.post(url, body)` |
| `"messages": [{"role": "user", "content": ...}]` | Ollama's chat API shape — a list of turns, each with a `role` (`user`/`assistant`/`system`) and `content`. This is the same shape OpenAI's chat API popularized. | Same as the `messages` array in an OpenAI SDK call |
| `"stream": False` | Ask Ollama to return one complete JSON response instead of a stream of partial chunks | `stream: false` in most LLM SDKs |
| `response.raise_for_status()` | Throws if the HTTP status is 4xx/5xx, instead of silently returning a bad response | `axios` does this automatically; here it's opt-in |
| `message = response.json()["message"]` / `ChatCompletionResult(content=message.get("content", ""), tool_calls=message.get("tool_calls"))` | Ollama's non-streaming reply shape is `{"message": {"role": "assistant", "content": "...", "tool_calls": [...]}, ...}` — both fields are pulled off the same `message` object and wrapped in the dataclass; `tool_calls` is usually absent (`.get(...)` returns `None`) unless the model actually decided to call a tool | `const { content, tool_calls } = response.data.message` |
| `def main() -> None:` | A thin wrapper calling `chat()` with one hardcoded message, printing `result.content` — kept so the file is still runnable standalone as a connectivity check | Same idea, just delegating to the shared function instead of duplicating the request |
| `if __name__ == "__main__":` | Only runs `main()` when the file is executed directly (`python ollama_client.py`), not when it's imported elsewhere | Roughly like checking `require.main === module` in Node |

**Why it exists:** proves the Ollama HTTP contract (URL, model name, request/response shape) works in isolation, before any FastAPI route depends on it. `chat()` is the shared entry point both the standalone script and `routes/chat.py` call. As of Week 2's tool-calling plumbing (Chunk B), it returns a `ChatCompletionResult` instead of a bare string specifically so a caller can eventually check `result.tool_calls` and act on them — that caller doesn't exist yet, this just makes it possible without another signature change.

**Verified:** `python llm/ollama_client.py` (CPU-only) returned a real, coherent `qwen3:8b` reply in a few seconds, routed through `chat()`; separately, called `chat()` directly from a Python shell and confirmed the return value is a `ChatCompletionResult` instance with `tool_calls=None` for an ordinary reply.

---

### `backend/tools/schemas.py`

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `VERIFY_IDENTITY_TOOL_SCHEMA` | A plain dict describing one callable tool, in the OpenAI/Ollama function-calling schema shape: `{"type": "function", "function": {"name", "description", "parameters": {JSON Schema}}}` | The same shape passed as the `tools` array to any OpenAI-compatible chat completions call |
| `"parameters": {"type": "object", "properties": {...}, "required": [...]}` | A JSON Schema object listing the four fields the model must supply to call `verify_identity` — `first_name`, `last_name`, `phone_number`, `address` — matching `models/customer.py`'s columns exactly | A `zod`/JSON-Schema shape describing a function's expected arguments |

**Why it exists:** this is what the model is *told* it can call — not the enforcement logic itself. `backend/tools/` is documented in `REQUIREMENTS.md` §6.6 as "the enforcement layer, called by the model via tool-calling"; this file is step one (the schema), with `verify_identity.py` (the actual DB lookup + enforcement) landing in a later chunk once identity extraction feeds it real arguments.

**Verified:** imported directly in a Python shell and asserted `VERIFY_IDENTITY_TOOL_SCHEMA["function"]["name"] == "verify_identity"`; not yet exercised against a live Ollama tool-call, since nothing passes it into `chat(tools=...)` yet.

---

### `backend/services/prompting.py`

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `BASE_SYSTEM_PROMPT` | The same persona string that used to live as a constant in `routes/chat.py` — moved here so prompt-building logic has one home instead of living inline in a route handler | Extracting an inline template literal into its own module |
| `IDENTITY_FIELDS = ("first_name", "last_name", "phone_number", "address")` | The fixed set of fields `build_system_prompt` knows how to read out of a `pending_identity` dict, in a stable display order | A `const` tuple used to iterate a known set of object keys in a fixed order |
| `def build_system_prompt(known_identity: dict \| None = None) -> str:` | If `known_identity` is falsy (`None` or `{}`), returns `BASE_SYSTEM_PROMPT` unchanged. Otherwise, appends a block listing whichever of the four fields are actually present, telling the model not to re-ask for them | A template function: `buildSystemPrompt(knownIdentity?: Record<string, string>): string` |
| `[f"- {field}: {known_identity[field]}" for field in IDENTITY_FIELDS if known_identity.get(field)]` | A list comprehension — Python's inline `.filter().map()` — walks the fixed field order, skips any field not yet known, and formats the rest as a bullet line | `IDENTITY_FIELDS.filter(f => knownIdentity[f]).map(f => \`- ${f}: ${knownIdentity[f]}\`)` |

**Why it exists:** the model shouldn't ask a visitor for a name/address/phone it already has. `routes/chat.py` now calls `build_system_prompt(session.pending_identity)` every turn instead of a hardcoded string — today `pending_identity` is always `None` (nothing populates it yet), so this is currently a no-op in practice, wired ahead of the identity-extraction chunk that will actually fill that column.

**Verified:** checked directly in a Python shell against three cases — `None`, `{}`, and a populated dict (`{"first_name": "Milos", "last_name": "Radulovic"}`) — confirming the first two return `BASE_SYSTEM_PROMPT` unchanged and the third includes both fields in the output.

---

### `backend/schemas/chat.py` + `backend/schemas/verify.py`

| Construct | What it does | JS/Node analogy |
|---|---|---|
| `class EscalationPayload(BaseModel): human_name: str; greeting: str \| None = None` | A stub payload shape for the human-escalation theater (Epic G) — defined now so `ChatResponse` has a stable field for it, even though nothing populates it until that chunk lands | A TS interface added ahead of the feature that fills it in |
| `class ChatRequest(BaseModel): message: str; session_id: str \| None = None` | Moved verbatim out of `routes/chat.py`, plus the new `session_id` field (nullable — absent on a visitor's first message, present on every turn after) | Same shape, just relocated out of the route file into its own schema module |
| `class ChatResponse(BaseModel): session_id: str; reply: str; state: str; event: str \| None = None; escalation: EscalationPayload \| None = None` | `session_id` and `state` are new — every response now tells the caller which session it's talking to and what state that session is in (`"anonymous"` today; real transitions come with the gate). `event`/`escalation` are reserved for later chunks (e.g. `"code_sent"`, `"escalated"`) — always `None` right now since nothing sets them | Extending a response DTO with fields a later feature will populate, without waiting for that feature to exist |
| `class VerifyCodeRequest(BaseModel): session_id: str; code: str` / `class VerifyCodeResponse(BaseModel): session_id: str; success: bool; reply: str; state: str; attempts_remaining: int \| None = None` | Shapes for the future `POST /verify-code` endpoint (2FA code check) — defined ahead of time so the endpoint, once built, has an already-reviewed contract to implement against | Drafting a response DTO before its controller exists |

**Why they exist:** `routes/chat.py` used to define `ChatRequest`/`ChatResponse` inline as the only two request/response shapes in the app. Pulling them into `schemas/` (following the same "schemas separate from routes" convention the project guidelines call for) makes room for `verify.py` to exist alongside without another route file growing its own inline models, and keeps FastAPI/Orval's source-of-truth (these classes) in one predictable place as more endpoints are added through Week 2.

**Verified:** `routes/chat.py` imports and uses `ChatRequest`/`ChatResponse` from here with no circular-import issues; `/openapi.json` reflects the new `session_id`/`state`/`event`/`escalation` fields correctly (confirmed via the regenerated Orval output in `frontend/src/api/generated/secure-ship.ts`). `schemas/verify.py`'s models aren't wired to a route yet, so only checked by direct import/instantiation in a Python shell.

---

### `backend/routes/chat.py`

| Line | What it does | JS/Node analogy |
|---|---|---|
| `router = APIRouter()` | A mountable group of routes, kept separate from the main `app` so route logic lives per-feature instead of piling into `main.py` | `const router = express.Router()` |
| `from schemas.chat import ChatRequest, ChatResponse` | Request/response shapes now live in `schemas/chat.py` (see above) instead of being defined inline here | Importing DTOs from a shared schema module instead of declaring them in the controller file |
| `from services.prompting import build_system_prompt` | The system-prompt string is no longer a local constant — it's built fresh per request from `services/prompting.py`, which can factor in identity fields already collected for this session | Importing a template-builder function instead of inlining a template string |
| `def _get_or_create_session(db: Session, session_id: str \| None) -> ChatSession:` | **Rewritten in Week 2, Chunk A.** Used to just grab "whichever `ChatSession` is still open" — every caller shared one row. Now: if a `session_id` is given, parse it as a UUID and look it up by primary key (still requiring `ended_at IS NULL`); only falls through to creating a brand-new row if no `session_id` was given, or the given one doesn't parse/doesn't match an open session | Roughly `session_id ? await Session.findOne({ id: session_id, endedAt: null }) : null; session ??= await Session.create({...})` |
| `try: session_uuid = uuid.UUID(session_id) except ValueError: session_uuid = None` | Defensively parses the incoming string as a UUID — a malformed/garbage `session_id` from a client falls through to "create a new session" instead of raising a 500 | A `try/catch` around `new URL(...)`-style parsing, treating a parse failure as "no valid input" rather than an error |
| `@router.post("/chat", operation_id="chat")` | Registers the function below as the handler for `POST /chat` on this router; `operation_id="chat"` is what makes Orval generate `useChat()` instead of an auto-derived name | `router.post('/chat', (req, res) => {...})` |
| `def send_chat_message(request: ChatRequest, db: Session = Depends(get_db)) -> ChatResponse:` | `Depends(get_db)` is FastAPI's dependency injection — it calls the generator from `db/session.py` for this one request, hands the route the yielded session, and closes it after the response is sent, success or failure | Middleware that attaches a fresh `req.db` per request and closes/releases it afterward |
| `transcript = list(session.transcript or [])` | Copies the JSONB column's current value out into a plain Python list before mutating it, rather than mutating `session.transcript` in place | Copying an array out of a DB record before pushing to it, instead of mutating the ORM's live reference directly |
| `transcript.append({"role": "user", "content": ..., "timestamp": ...})` | Records the user's turn with an ISO-8601 UTC timestamp, *before* calling the model — so a turn is captured even if Ollama itself later fails | Pushing a message object into a local array before an async call that might throw |
| `messages = [{"role": "system", "content": build_system_prompt(session.pending_identity)}, {"role": "user", ...}]` | Still single-turn to Ollama — the growing `transcript` is persisted for the record, but is **not** fed back to the model as conversation context (tried and reverted in Week 1, see the 2026-07-24 change-log entry). The system prompt is now built per-request from `session.pending_identity` rather than a hardcoded string, though that's a no-op today since nothing populates `pending_identity` yet | Constructing the `messages` array fresh each call, with a templated system message instead of a static one |
| `result = ollama_client.chat(messages)` / `reply = result.content` | `chat()` now returns a `ChatCompletionResult` (Week 2, Chunk B) instead of a bare string — this pulls the prose reply back out of it. `result.tool_calls` isn't inspected yet; that's the next chunk's job | `const result = await chat(messages); const reply = result.content` |
| `transcript.append({"role": "assistant", ...})` | Records the model's reply the same way, after the call succeeds | Same pattern, for the response side |
| `session.transcript = transcript` | Reassigning the column to a **new** list object (not mutating the old one in place) is what makes SQLAlchemy detect the change and include it in the next flush — mutating the existing list in place wouldn't be picked up automatically for a plain (non-`Mutable`-wrapped) JSONB column | Reassigning `record.field = [...newArray]` instead of `record.field.push(...)`, because some ORMs only track top-level reference changes, not in-place array mutation |
| `db.commit()` | Persists the new/updated `ChatSession` row (insert or update) in one transaction. For a brand-new session, this is also what flushes the Python-side `default=uuid.uuid4` and actually assigns `session.id` | `await session.save()` / committing a transaction |
| `return ChatResponse(session_id=str(session.id), reply=reply, state=session.state.value)` | Now echoes back `session_id` (so the client can send it on the next turn) and `state` (the enum's string value); `event`/`escalation` are left at their `None` defaults | `res.json({ sessionId, reply, state })` |

**Why it exists:** Week 1 proved a real, ungated conversation over HTTP with naive shared-session persistence. Week 2's Chunk A fixed the "everyone shares one session" shortcut — sessions are now genuinely per-client, keyed by a `session_id` the client holds onto — and Chunk B swapped the hardcoded system prompt and bare-string Ollama reply for the `build_system_prompt`/`ChatCompletionResult` plumbing the identity gate will build on. Still no gating, tool execution, or state transitions — this route creates/finds sessions and talks to the model, nothing more yet.

**Verified:** `curl` round-trips confirming two callers with no `session_id` land in two distinct rows, and that passing a returned `session_id` back resumes the same row with `transcript` correctly accumulating turns (checked directly via a `chat_sessions` table query) rather than starting over. Rebuilt the backend Docker image and re-confirmed `/chat` still works end-to-end after the Chunk B changes.

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

### `frontend/src/components/ChatWindow/` (`ChatWindow.tsx`, `ChatMessage.tsx`, `ShipmentCard.tsx`, `types.ts`)

| File | What it does |
|---|---|
| `types.ts` | Local types only — `ChatMessageData`, `ShipmentCardData`, `PackageItem`, `ShipmentStatus`. Deliberately not shared with the backend yet; once Orval is wired up (a later step), the real request/response types will come from generated code instead, and these may get replaced |
| `ChatWindow.tsx` | Owns `messages: ChatMessageData[]` (`useState`, seeded with one hardcoded bot message), `draft: string` (the input), and — as of Week 2, Chunk A — `sessionId: string \| undefined` (`useState`, starts unset). `handleSubmit` optimistically appends the user's message, then calls the generated `useChat()` mutation with `{ data: { message: text, session_id: sessionId } }`; on a `200` response, `onSuccess` calls `setSessionId(response.data.session_id)` before appending the reply bubble, so every subsequent turn sends the session id the backend just confirmed. `chatMutation.isPending` drives a "Typing…" bubble and disables the input/send button while a request is in flight. A `messageListRef` + `useEffect` keyed on `[messages, chatMutation.isPending]` scrolls the list to the bottom on every change — without it, new messages/the typing indicator render below the fold since `.chat-window__message-list` is a fixed-height `overflow-y: auto` region that doesn't auto-scroll on its own |
| `ChatMessage.tsx` | One bubble; `role` picks the BEM modifier (`chat-message--user`/`--bot`) and which side the avatar renders on. Renders a `ShipmentCard` if `message.shipment` is present |
| `ShipmentCard.tsx` | Pure presentational component. Its prop shape (`ShipmentCardData`) intentionally mirrors only the fields that exist on the backend's `Shipment`/`Package` models (`tracking_number`, `carrier`, `origin`/`destination`, `status`, `estimated_delivery`, `last_update`, and `Package.description`/`weight_kg`/`declared_value`) — the mockup's Reference Number, Service Type, Shipment Date, item Quantity/Unit, and the separate Timeline card were all left out because none of that data exists in the DB yet, and the goal was a card that could plausibly render real data later, not a richer mock |

**Why it exists:** step 8 proved the component structure, BEM styling, and local-state interaction pattern (`useState` + controlled input) before any of it dealt with async/`fetch`/React Query; the Orval step (below) then swapped the local-echo `handleSubmit` for a real `useChat()` call without touching that structure. `messages` and the seed data still live in `ChatWindow.tsx` itself — the seed message (with its mock `ShipmentCard`) is kept as message #1 so the card component stays visually demoed, since real backend replies are plain text only until Week 2+'s tool-calling lands. The `sessionId` tracking added in Chunk A isn't a nice-to-have: the backend's old "most recent open session" fallback was removed as part of that same chunk, so without this, every message sent from the browser would silently start a brand-new session instead of continuing the visible conversation.

**Verified:** headless-browser script drove the real dev server + backend together — confirmed the actual `POST /chat` network request/response (not just that a `fetch` call exists in the code), the typing indicator appearing then clearing, the real `qwen3:8b` reply rendering as a new bubble, auto-scroll bringing it into view, and zero console errors. A raw `curl` timing check (`~77s` for a reply, CPU-only) was used to size the test's wait timeout correctly. Chunk A's `sessionId` wiring was verified separately via `tsc -b`/`vite build`/`oxlint` passing, plus the backend-side `curl` checks documented in `routes/chat.py`'s entry above (which exercise the exact request/response shape this component now sends/reads).

---

### `frontend/src/main.tsx`

Wraps `<App />` in `<QueryClientProvider client={queryClient}>` (a single `new QueryClient()` created at module scope) — required for any Orval-generated React Query hook (`useChat()`, etc.) to work at runtime; without a provider ancestor, calling the hook throws.

---

### `frontend/src/api/generated/` (`secure-ship.ts`) + `frontend/orval.config.ts`

| Construct | What it does |
|---|---|
| `orval.config.ts` | `input.target` points at the backend's live `http://localhost:8000/openapi.json` (backend must be running to regenerate); `output.client: 'react-query'`, `output.httpClient: 'fetch'` (Orval's built-in fetch client — deliberately chosen over the axios-based default so no new runtime HTTP-client dependency was needed) |
| `secure-ship.ts` | Generated, never hand-edited (enforced by convention, not tooling) — exports `ChatRequest`/`ChatResponse` types and `useChat()`, a `useMutation` wrapper whose `mutate`/`mutateAsync` take `{ data: ChatRequest }` and resolve to `{ data, status, headers }` (the fetch client doesn't throw on non-2xx, so callers check `response.status` themselves — that's why `ChatWindow.tsx` checks `response.status === 200` inside `onSuccess` rather than only handling `onError`). As of Week 2, Chunk A, `ChatRequest` gained an optional `session_id` and `ChatResponse` gained `session_id`/`state`/`event`/`escalation` — regenerated straight from `schemas/chat.py`'s Pydantic models with no manual edits |

**Why it exists:** the locked "no hand-written fetch calls or duplicated TS types" decision (`DEV_PLAN.md`/`REQUIREMENTS.md` §4.8) — `ChatRequest`/`ChatResponse` are generated straight from the backend's Pydantic models via its OpenAPI schema, so the two can't silently drift. The backend's `/chat` route was given an explicit `operation_id="chat"` (`routes/chat.py`) purely so the generated hook name comes out as `useChat()` instead of an auto-derived `useSendChatMessageChatPost()`.

**Verified:** `npm run generate:api` produces this file cleanly against the running backend; `tsc -b`/`oxlint` pass; see `ChatWindow.tsx`'s entry above for the runtime check.

**Verified:** `tsc -b`, `oxlint`, and `vite build` all clean. Drove the running `npm run dev` server with a headless Playwright script: initial render matches the mockup (seed message + embedded `ShipmentCard` with correct fields), typing text and clicking send appends a new user bubble and clears the input, clicking Sidebar's "New Chat" resets back to one message — zero console errors across all three states.

---

<!-- Add a new "### backend/<file>" or "### frontend/<file>" section here as each new file is built. Keep entries technical and current — if a file's purpose or shape changes materially, update its section rather than leaving it stale. -->
