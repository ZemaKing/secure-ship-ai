# Tech Notes

A technical reference log, organized by file/module rather than by date. Where `CHANGE_LOG.md` is the conversational "what happened, in demo-friendly language" record, this file is the "what does this piece of code actually do, and why" record — meant to be a living document that gets a new section every time a new file/module is added, and gets corrected/updated if that file changes meaningfully later.

Written with JS/Node/TypeScript analogies throughout, since that's the background this project is being learned from.

---

## Backend

### `backend/main.py`

```python
from fastapi import FastAPI

from routes.chat import router as chat_router

app = FastAPI(title="SecureShip Backend")

app.include_router(chat_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

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

Only five packages were installed directly (per `DEV_PLAN.md`'s locked stack); everything else below is a transitive dependency `pip freeze` captured automatically — same as how `npm install` pulls in a deep tree for one direct dependency.

| Package(s) | Role | Notes |
|---|---|---|
| `fastapi` | The web framework itself | Direct dependency |
| `starlette` | Lower-level ASGI toolkit FastAPI is built on | Like Express sitting on Node's `http` module |
| `pydantic`, `pydantic_core`, `typing_extensions`, `typing-inspection`, `annotated-doc`, `annotated-types` | Data validation — turns type hints into runtime validation + JSON schema | Doing double duty as both a shape-checker (like `zod`) and the OpenAPI schema generator |
| `uvicorn`, `h11`, `httptools`, `websockets`, `watchfiles`, `colorama` | Uvicorn is the ASGI server process that actually runs the app and listens on a port | Python needs a separate server process to run an app, unlike Node running Express directly. The rest are uvicorn's internals (HTTP parsing, `--reload` file-watcher, colored terminal output) | Direct dependency: `uvicorn[standard]` |
| `anyio`, `idna`, `click` | Supporting libs uvicorn/starlette use internally | Async I/O abstraction, domain-name handling, CLI arg parsing |
| `sqlalchemy`, `greenlet` | ORM — will define `Customer`/`Shipment`/`Package`/`ChatSession` as Python classes instead of raw SQL (Checkpoint 5) | Like Prisma/TypeORM. `greenlet` is a low-level dep SQLAlchemy needs for async support | Direct dependency: `sqlalchemy` |
| `alembic`, `Mako`, `MarkupSafe` | Migrations tool — tracks schema changes over time | Like Prisma Migrate / `knex migrate`. `Mako`/`MarkupSafe` are templating libs Alembic uses to generate migration file boilerplate | Direct dependency: `alembic` |
| `python-dotenv` | Loads `.env` files into environment variables | Same job as the `dotenv` npm package |
| `PyYAML` | YAML parsing | Transitive dependency pulled in by one of the above |
| `requests`, `urllib3`, `certifi`, `charset-normalizer` | Synchronous HTTP client — used by `llm/ollama_client.py` to call Ollama's local API | Like `axios`. `urllib3`/`certifi`/`charset-normalizer` are its internals (connection pooling, SSL certs, encoding detection) | Direct dependency: `requests` |

---

### `backend/llm/ollama_client.py`

```python
import requests

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen3:8b"


def chat(messages: list[dict], tools: list[dict] | None = None) -> str:
    """Send a full message history to the local Ollama model and return its reply.

    `tools` is unused for now — accepted so Week 2's tool-calling enforcement
    can be wired in without changing this function's signature.
    """
    payload = {
        "model": MODEL,
        "messages": messages,
        "stream": False,
    }
    if tools is not None:
        payload["tools"] = tools

    response = requests.post(OLLAMA_URL, json=payload)
    response.raise_for_status()
    return response.json()["message"]["content"]


def main() -> None:
    reply = chat(
        [{"role": "user", "content": "In one sentence, what is a parcel tracking number?"}]
    )
    print(reply)


if __name__ == "__main__":
    main()
```

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
| `def main() -> None:` | Now just a thin wrapper calling `chat()` with one hardcoded message — kept so the file is still runnable standalone as a connectivity check | Same idea, just delegating to the shared function instead of duplicating the request |
| `if __name__ == "__main__":` | Only runs `main()` when the file is executed directly (`python ollama_client.py`), not when it's imported elsewhere | Roughly like checking `require.main === module` in Node |

**Why it exists:** proves the Ollama HTTP contract (URL, model name, request/response shape) works in isolation, before any FastAPI route depends on it. `chat()` is now the shared entry point both the standalone script and `routes/chat.py` call — a full `messages` list in, a plain string reply out — so Week 2 can add real tool definitions via the `tools` param without touching callers.

**Verified:** `python llm/ollama_client.py` (CPU-only) returned a real, coherent `qwen3:8b` reply in a few seconds, now routed through `chat()`.

---

### `backend/routes/chat.py`

```python
from fastapi import APIRouter
from pydantic import BaseModel

from llm import ollama_client

router = APIRouter()

SYSTEM_PROMPT = (
    "You are a friendly customer support assistant for SecureShip, a parcel "
    "tracking company. Help customers with questions about their shipments."
)


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat")
def send_chat_message(request: ChatRequest) -> ChatResponse:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": request.message},
    ]
    reply = ollama_client.chat(messages)
    return ChatResponse(reply=reply)
```

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

<!-- Add a new "### backend/<file>" or "### frontend/<file>" section here as each new file is built. Keep entries technical and current — if a file's purpose or shape changes materially, update its section rather than leaving it stale. -->
