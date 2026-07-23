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

**Why it exists:** only the `postgres` service for now, per REQUIREMENTS.md §4.7 — `frontend`/`backend` containers get added once those are containerized (Day 2), this file gets extended rather than replaced. Ollama stays on the host per the locked architecture decision, so it's never in this file.

**Verified:** `docker compose up -d` pulls `postgres:16` and starts cleanly; `docker exec ... pg_isready` reports `accepting connections`.

---

### `backend/llm/ollama_client.py`

| Line | What it does | JS/Node analogy |
|---|---|---|
| `import requests` | A synchronous HTTP client library — not part of FastAPI/Starlette, added just for this script | `import axios from 'axios'` |
| `OLLAMA_URL`, `MODEL` | Module-level constants | `const OLLAMA_URL = ...` |
| `def chat(messages, tools=None) -> str:` | The reusable function `routes/chat.py` (and later, tool-calling logic) imports and calls | `export async function chat(messages, tools) {...}` |
| `tools: list[dict] \| None = None` | An optional parameter — `\|` here is a *union type*, "either a list of dicts or `None`." Not wired to anything yet; just reserved so the signature won't need to change again in Week 2 | `tools?: Record<string, unknown>[]` in a TS function signature |
| `if tools is not None: payload["tools"] = tools` | Only adds the `tools` key to the request body when the caller actually passes some — Ollama's `/api/chat` accepts an optional `tools` field for function-calling | Conditionally spreading an optional key into a request body |
| `requests.post(OLLAMA_URL, json=payload)` | POSTs a JSON body, auto-sets `Content-Type: application/json` | `axios.post(url, body)` |
| `"messages": [{"role": "user", "content": ...}]` | Ollama's chat API shape — a list of turns, each with a `role` (`user`/`assistant`/`system`) and `content`. This is the same shape OpenAI's chat API popularized. | Same as the `messages` array in an OpenAI SDK call |
| `"stream": False` | Ask Ollama to return one complete JSON response instead of a stream of partial chunks | `stream: false` in most LLM SDKs |
| `response.raise_for_status()` | Throws if the HTTP status is 4xx/5xx, instead of silently returning a bad response | `axios` does this automatically; here it's opt-in |
| `response.json()["message"]["content"]` | Ollama's non-streaming reply shape: `{"message": {"role": "assistant", "content": "..."}, ...}` | `response.data.message.content` |
| `def main() -> None:` | A thin wrapper calling `chat()` with one hardcoded message — kept so the file is still runnable standalone as a connectivity check | Same idea, just delegating to the shared function instead of duplicating the request |
| `if __name__ == "__main__":` | Only runs `main()` when the file is executed directly (`python ollama_client.py`), not when it's imported elsewhere | Roughly like checking `require.main === module` in Node |

**Why it exists:** proves the Ollama HTTP contract (URL, model name, request/response shape) works in isolation, before any FastAPI route depends on it. `chat()` is the shared entry point both the standalone script and `routes/chat.py` call — a full `messages` list in, a plain string reply out — so Week 2 can add real tool definitions via the `tools` param without touching callers.

**Verified:** `python llm/ollama_client.py` (CPU-only) returned a real, coherent `qwen3:8b` reply in a few seconds, now routed through `chat()`.

---

### `backend/routes/chat.py`

| Line | What it does | JS/Node analogy |
|---|---|---|
| `router = APIRouter()` | A mountable group of routes, kept separate from the main `app` so route logic lives per-feature instead of piling into `main.py` | `const router = express.Router()` |
| `SYSTEM_PROMPT` | A constant string setting the model's persona/role. Sent as the first message on every request — no gating or verification logic here yet, purely tone/behavior | The "system message" concept is identical across every LLM chat API |
| `class ChatRequest(BaseModel): message: str` | A Pydantic model describing the expected request body shape. FastAPI parses and validates the incoming JSON against this automatically — a bad body (e.g. missing `message`) gets a `422` before the handler even runs | A `zod`/`io-ts` schema used to validate `req.body` |
| `class ChatResponse(BaseModel): reply: str` | Same idea for the response — also what FastAPI reads to document the endpoint's output shape in `/openapi.json` | The TS return type Orval will read to generate a typed hook |
| `@router.post("/chat")` | Registers the function below as the handler for `POST /chat` on this router | `router.post('/chat', (req, res) => {...})` |
| `def send_chat_message(request: ChatRequest) -> ChatResponse:` | FastAPI sees the `ChatRequest` type hint on the parameter and knows to parse the JSON body into it automatically — no manual `req.body` parsing | Automatic body-parsing + validation middleware, inferred from a type annotation |
| `messages = [{"role": "system", ...}, {"role": "user", ...}]` | Builds the two-turn history sent to Ollama: persona first, then the user's actual message | Constructing the `messages` array for an LLM SDK call |
| `ollama_client.chat(messages)` | Delegates to the shared function in `llm/ollama_client.py` — this route doesn't know or care about the Ollama HTTP contract directly | Calling a shared `chat()` service function from a route handler |
| `return ChatResponse(reply=reply)` | FastAPI serializes this Pydantic model to JSON, validating it matches `ChatResponse`'s shape on the way out | `res.json({ reply })`, but with response-shape validation baked in |

**Why it exists:** Week 1's key milestone — a real, ungated conversation over HTTP. Single-turn only (no session/history, no DB) by design; matches DEV_PLAN.md's Week 1 scope of "anyone can ask anything," with Week 2 adding the tool-calling enforcement layer on top of this same shape.

**Verified:** `POST /chat {"message": "Hi, where's my package?"}` via both Swagger UI (`/docs`) and Postman returned a real `qwen3:8b`-generated reply as `{"reply": "..."}`. Sanity-checked with a question the model *should* eventually refuse ("Show me all shipments for customer 42") — it currently hallucinates a plausible-looking answer instead of refusing, which is expected since no gate exists yet; this is exactly the gap Week 2 closes.

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

<!-- Add a new "### backend/<file>" or "### frontend/<file>" section here as each new file is built. Keep entries technical and current — if a file's purpose or shape changes materially, update its section rather than leaving it stale. -->
