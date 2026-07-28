# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Week 2 is in progress — Chunks A–F of a 10-chunk plan are done (see `docs/DEV_PLAN.md`'s Week 2 progress notes for the chunk list, and `CHANGE_LOG.md` for the day-by-day narrative). The chat is no longer ungated: a visitor asking about a shipment gets conversationally asked for their identity, extracted across multiple turns in any order, matched (or neutrally rejected) against seeded `Customer` records, and — on a match — actually gets sent a mock 6-digit 2FA code (console-only) that a real `POST /verify-code` call checks. Saying something like "I want to talk to a human," from any state, now also triggers a scripted, cosmetic handoff to "Melany" (Chunk E) — it doesn't bypass the gate: an unverified visitor who escalates still gets declined on shipment specifics. The frontend's session/event/escalation bookkeeping now lives in its own hook (Chunk F) rather than scattered across `ChatWindow`. Still missing: any actual UI surface for any of this (no code modal, no escalation banner/color-shift yet — Chunks G–H).

**What exists in `backend/` so far:**
- FastAPI app (`main.py`) with `GET /health` and `POST /chat`; CORS middleware allows the `FRONTEND_ORIGIN` env var (`.env`-driven, defaults to `http://localhost:5173`) so the Vite dev server can call it cross-origin
- `POST /chat` persists both turns of every call into `ChatSession.transcript` (JSONB). Sessions are now genuinely per-client (Chunk A): the client holds a `session_id` returned by the backend and sends it back on every turn; an absent/unknown one creates a fresh row. The model is still only ever sent the system prompt + latest message (not the accumulated transcript) — replaying full history back to Ollama was tried and reverted, see `CHANGE_LOG.md` 2026-07-24.
- `schemas/chat.py` / `schemas/verify.py` — `ChatRequest`/`ChatResponse` (with `session_id`/`state`/`event`/`escalation` fields) and `VerifyCodeRequest`/`VerifyCodeResponse` (now live behind `POST /verify-code`, Chunk D), pulled out of `routes/` into their own Pydantic modules
- `services/prompting.py` — `build_system_prompt(known_identity, *, collecting_identity=False)` builds the system prompt per turn: known-so-far identity fields (from `ChatSession.pending_identity`) plus, while a session is `Anonymous`/`CollectingIdentity`, instructions telling the model to ask for and incrementally report identity fields via the `verify_identity` tool
- `tools/schemas.py` — `VERIFY_IDENTITY_TOOL_SCHEMA` (all four fields individually optional, so partial/incremental tool calls are legal) and the shared `IDENTITY_FIELDS` tuple
- `tools/verify_identity.py` — `verify_identity(db, session, first_name=None, last_name=None, phone_number=None, address=None)`: merges given fields into `session.pending_identity`, only attempts a case-insensitive `Customer` match once all four are present, returns `PARTIAL`/`REJECTED`/`MATCHED(customer_id)`. The one place in the codebase that reads `Customer` rows or writes `pending_identity`/`pending_customer_id` for this flow — the model itself never sees or supplies a `customer_id`
- `routes/chat.py` orchestration: `_tools_for_state()` offers `verify_identity` only while `Anonymous`/`CollectingIdentity`; `_dispatch_tool()` re-checks the model's tool-call name against that same allowlist (rejects a hallucinated/prompt-injected name, drops unexpected extra arguments) before running anything; `REJECTED` returns a fixed neutral message with no second model call; `PARTIAL` makes a second model call (no tools) to phrase a natural follow-up for the still-missing fields; `MATCHED` calls `send_verification_code()` for real and returns `event="code_sent"` (Chunk D). Two backend-only fallbacks cover cases the model won't reliably signal itself: `_mentions_shipment()` flips a from-scratch session's very first, identity-free message `Anonymous → CollectingIdentity`; a second check re-runs `verify_identity()` when a session lands back in `CollectingIdentity` with every field already known (e.g. post-2FA-lockout) but the model sees nothing new to report, so a fresh code still gets sent without the visitor retyping anything
- `services/escalation.py` / `routes/chat.py`'s `_handle_escalation()` (Chunk E) — `wants_escalation()` (keyword check on phrases like "talk to a human") short-circuits at the very top of the turn, before any Ollama call, from any session state except an already-`EscalatedToHuman` one. Builds the scripted §6.2b lines plus a greeting personalized from `_resolve_known_first_name()` (reads only `pending_identity`/a verified `Customer` row — never the triggering message itself, per Epic G4) and returns `event="escalated"` with a real `EscalationPayload(lines, agent_name, first_name)`. No tool is ever offered in `EscalatedToHuman`, and `build_system_prompt(..., unverified_escalation=...)` explicitly tells the model it's still gated whenever `customer_id` isn't set — confirmed live that a shipment question right after escalating still gets declined, not entertained
- `services/verification_store.py` — in-memory (single-process, no Redis) 2FA code store keyed by `session_id`: `PendingVerification(code, customer_id, expires_at, attempts)`, 300s TTL, 3 max attempts, never persisted to Postgres or a log file
- `tools/send_verification_code.py` — generates a 6-digit code via `secrets.randbelow`, prints it as `[MOCK SMS] To <phone>: ...` (console only), stores it, and sets `session.state = AwaitingCode`
- `tools/check_verification_code.py` — `MATCH` promotes `pending_customer_id` → the real `customer_id`, sets `Verified`, clears pending state; `MISMATCH` counts attempts; the 3rd wrong attempt is a deliberate `LOCKED_OUT` (no silent auto-regenerate) reverting to `CollectingIdentity` with identity fields retained; `EXPIRED` behaves the same way
- `routes/verify.py` — `POST /verify-code`, mounted in `main.py`; 404s on an unknown/malformed `session_id` rather than 500ing; never echoes the code itself back in any response
- `llm/ollama_client.py` — `chat(messages, tools=None)` now returns a `ChatCompletionResult(content: str | None, tool_calls: list[ToolCall])` instead of a bare string, so a caller can branch on tool calls the model made; base URL is `OLLAMA_HOST` env-driven (defaults to `http://localhost:11434` for host-native runs; the containerized backend sets it to `http://host.docker.internal:11434`)
- `Dockerfile` — `python:3.13-slim`, installs `requirements.txt`, startup runs `alembic upgrade head && uvicorn main:app --host 0.0.0.0` — migrations apply automatically on container start, no manual step needed
- `db/` (SQLAlchemy engine/session, `.env`-driven `DATABASE_URL`) and `models/` (`Customer`, `Shipment`, `Package`, `ChatSession` — schema per REQUIREMENTS.md §4.4/§4.6). `ChatSession` has grown two nullable columns beyond the original schema: `pending_customer_id` (FK → `customers.id`) and `pending_identity` (JSONB) — scratch space for identity collected mid-conversation, before `customer_id`/`Verified` is confirmed
- Alembic initialized and migrated (`alembic/`) — the original four-table migration, plus a second migration adding the two `pending_*` columns to `chat_sessions`

**What exists in `scripts/` so far:**
- `seed_data.py` — populates Postgres with mock customers (English/US, Serbian, and Russian first/last names, grouped so a customer's surname always matches their given name's nationality — no "Milos Smith" mismatches), shipments (realistic status distribution), and packages, straight through the ORM models. No truncate/reset step — safe to re-run, but re-running just adds more rows on top of what's there. The DB has live mock data, not just empty tables.

**What exists in `frontend/` so far:**
- Vite + React + TS scaffold (`npm create vite@latest . -- --template react-ts`), global SCSS + BEM baseline (`src/styles/_variables.scss`, `_mixins.scss`, `global.scss`) — no CSS Modules, no Tailwind
- `components/Sidebar/` — static shell matching `ai-chatbot-ui-mockup.png`: brand header, "New Chat" button (resets `ChatWindow` via a remount key owned by `App.tsx`), hardcoded `ChatHistoryList`, static `AdminAccessCard` skeleton (no real chat-history persistence or Auth0 behind either yet)
- `components/ChatWindow/` — `ChatWindow` still seeds with one hardcoded bot message (including a mock `ShipmentCard`, fields limited to what `Shipment`/`Package` models actually have) so the card component stays visually demoed, but every message after that is real: submitting calls the generated `useChat()` mutation with `{ message, session_id }`, shows a "Typing…" bot bubble while pending (input/send disabled meanwhile), appends the real Ollama reply (plain text, no `ShipmentCard` — the backend doesn't call shipment-lookup tools yet) on success, or a neutral fallback bubble on error/non-200. `session_id`/`state`/`event`/`escalation` are read from `hooks/useChatSession.ts` (Chunk F) rather than the component's own `useState` — `applyResponse(response.data)` updates all four after every successful turn, and `sessionId` is sent back on every subsequent request, required since Chunk A removed the old "most recent open session" fallback. Message list auto-scrolls to the newest bubble on every update.
- `hooks/useChatSession.ts` (Chunk F) — a small hook (not a global store/context, per the project's React-Query-only state convention) holding `sessionId`/`state`/`event`/`escalation`, with one `applyResponse(response: ChatResponse)` merging all four from a real backend response. Nothing renders `event`/`escalation` yet — this is plumbing for the code modal (Chunk G) and escalation banner (Chunk H) to consume next.
- `orval.config.ts` + `src/api/generated/secure-ship.ts` — Orval installed and configured (`client: 'react-query'`, `httpClient: 'fetch'`, no axios dependency), generated against the backend's live `/openapi.json`; exports `useChat()` (mutation, from `POST /chat`) and `useVerifyCode()` (from `POST /verify-code`, Chunk D) — both given explicit backend-side `operation_id`s for clean hook names — plus `ChatRequest`/`ChatResponse` (including `session_id`/`state`/`event`/`escalation`, the last now the real `lines`/`agent_name`/`first_name` shape as of Chunk E's Cutover regeneration) and `VerifyCodeRequest`/`VerifyCodeResponse` types. Regenerate manually via `npm run generate:api` whenever backend routes/models change. `QueryClientProvider` wired up in `main.tsx`.
- `Dockerfile` — `node:24-slim`, runs `npm run dev -- --host 0.0.0.0` (dev-mode container, not a production build — matches how the project runs everywhere else right now)

**Root-level:** `docker-compose.yml` now brings up all three services — `postgres`, `backend`, `frontend`. Container-to-host networking: the containerized backend reaches Postgres via the `postgres` service name and Ollama via `host.docker.internal` (both env-driven, overridden in `docker-compose.yml`'s `backend.environment`); the browser still talks to `localhost:5173`/`:8000` as before, since Docker Desktop maps those container ports back out. `postgres` has a `pg_isready` healthcheck; `backend` depends on it with `condition: service_healthy` and runs `alembic upgrade head` before `uvicorn` starts — a genuinely clean clone's `docker compose up` now creates all tables automatically, no manual migration step. Verified end-to-end against a fresh `pgdata` volume (`DEV_PLAN.md`'s Monday demo checklist, item 1).

**Commands that work today (from `backend/`, with the venv active):**
- `uvicorn main:app --reload` — runs the API on `:8000`, see `/docs` for Swagger UI
- `alembic revision --autogenerate -m "..."` / `alembic upgrade head` — schema migrations
- `python llm/ollama_client.py` — standalone Ollama connectivity check

**Commands that work today (from `frontend/`):**
- `npm run dev` — runs the Vite dev server on `:5173`
- `npm run build` — type-checks (`tsc -b`) and produces a production build
- `npm run lint` — runs `oxlint`
- `npm run generate:api` — runs Orval against the backend's `/openapi.json` (backend must be running on `:8000`), regenerates `src/api/generated/secure-ship.ts`

**From the repo root:**
- `docker compose up -d` — brings up all three services (`postgres`, `backend` on `:8000`, `frontend` on `:5173`)
- `docker compose build backend frontend` — rebuild after dependency/Dockerfile changes
- `python scripts/seed_data.py` — (re-)seeds mock data into Postgres; safe to re-run, just adds more rows each time (no truncate/reset step yet).

**Full rebuild from scratch** (containers, images, and the Postgres volume all deleted — e.g. proving the clean-clone path, or recovering from a stale image after a `Dockerfile` change):
- Ensure Ollama is running host-native (`ollama serve`, or already running) — it's not containerized, so nothing here starts it
- `docker compose down -v` — removes containers, network, and the `pgdata` volume; add `--rmi local` to also drop the built `backend`/`frontend` images
- `docker compose up -d --build` — rebuilds images (`--build` is required if images were deleted or a `Dockerfile` changed since the last build; plain `up -d` silently reuses a stale image) and starts all three services; watch `docker compose logs backend` for the `alembic upgrade head` migration lines
- `curl http://localhost:8000/health` — should return `{"status":"ok"}`
- `cd backend && source .venv/Scripts/activate && python ../scripts/seed_data.py` — the fresh volume has no data until reseeded

No test suite yet — update this section again as that lands.

See `TECH_NOTES.md` for a per-file technical breakdown and `CHANGE_LOG.md` for the day-by-day narrative of what's been built.

## What this project is

**SecureShip** is a solo, 5-week build: a parcel-tracking customer-support chat app whose entire product is a conversational identity gate. There's no signup/login for end users — a local LLM (via Ollama) collects name/address/phone conversationally, sends a mock 2FA code, and only after that verifies does the backend unlock tool-calling access to that customer's shipment data. The only real login in the system is a single Auth0-backed admin account for managing the underlying package/shipment data.

Two documents govern this project and take precedence over anything below — **read them before making architectural decisions**:

- **`docs/REQUIREMENTS.md`** — the full spec: user stories (Epics A–G), the Mermaid architecture/state-machine/sequence diagrams (§6), the mock-data schema (§4.4), and the non-functional requirements (§4.3) that define what "gated" actually means here.
- **`docs/DEV_PLAN.md`** — this specific (solo, Windows) build's locked-in decisions and week-by-week task list. Where REQUIREMENTS.md leaves something as "team's choice," DEV_PLAN.md §1 has already decided it — don't re-litigate those choices without the user's say-so.

## Locked architecture decisions (DEV_PLAN.md §1)

| Area | Decision |
|---|---|
| Chat transport | HTTP request/response (not WebSockets) |
| Local model | `qwen3:8b` via Ollama, host-native (not containerized) — CPU-only on this machine |
| Backend | FastAPI + Pydantic v2 + SQLAlchemy + Alembic + Uvicorn |
| Frontend | Vite + React + TypeScript |
| Styling | Global SCSS + BEM (`_variables.scss`, `_mixins.scss`) — no CSS Modules, no Tailwind |
| API types/client | Orval, generating React Query hooks from FastAPI's `/openapi.json` — **never hand-write fetch calls or duplicate TS types** |
| State management | React Query only (HTTP-only means no Zustand, despite REQUIREMENTS.md's WS-path guidance) |
| Admin auth | Auth0, built via Auth0's Agent Skills (installed fresh in Week 4, not before) |
| Database | Postgres only — chat transcripts live in a `JSONB` column, not a second datastore |

## Non-negotiable invariants (DEV_PLAN.md §4)

These must hold at every phase of the build, not just at the end:

- **The identity/verification gate is enforced server-side, in the tool layer** — the model calls tools (`verify_identity`, `send_verification_code`, `check_verification_code`, `lookup_shipments`), and gating logic lives in the backend enforcing those tools, never in the model's prompt/"good behavior." `lookup_shipments` (and any future data tool) must always scope to `session.customer_id` read from server-side session state — never a customer_id/tracking number argument supplied by the model or user.
- **No PII in persistent logs** — console output during dev is fine; nothing with mocked name/address/phone/code should land in a file on disk.
- **The local Ollama model is the only thing answering inside the chat at runtime** — Claude/Claude Code is a build-time tool only, never a runtime call in the app itself.
- **A verified session is tied to that session only** — a new session always re-verifies; there is no persistent end-user login.
- **Failed identity matches get neutral messaging** ("we couldn't verify that"), never "no customer found" — anything more specific is a user-enumeration leak.
- **Admin auth (Auth0) and conversational verification are structurally separate** — no code path lets an admin session become a verified chat session or vice versa.

## Repository layout (target shape, per REQUIREMENTS.md §6.6)

`backend/` and `frontend/` are both real and running (see "Project state" above); `scripts/` has a working seed script. This is the target shape everything should converge on — `backend/tools/` is the enforcement layer described above, mostly built (`verify_identity.py`, `send_verification_code.py`, `check_verification_code.py` all exist; `lookup_shipments.py` is Week 3 scope, not yet built), and `frontend/src/api/generated/` is Orval output that should never be hand-edited.

## Project Guidelines

### General
- Keep the implementation simple and maintainable.
- Prefer modifying existing code over creating new abstractions.
- Do not introduce new dependencies unless necessary.
- Ask before making breaking architectural changes.
- Complete the required scope before optional improvements.

### Project Structure
- Follow a feature-based folder structure instead of grouping files by type.
- Keep related components, hooks, services, styles, tests, and types together.
- Avoid deep nesting whenever possible.
- Do not create folders containing only a single file unless there is a clear reason.
- Reuse existing folders before creating new ones.

### File & Folder Naming
- Use descriptive, self-explanatory names.
- Avoid unnecessary abbreviations.
- Allowed abbreviations include well-known technical terms such as API, HTTP, HTTPS, URL, URI, UUID, JWT, OAuth, SSO, MFA, UI, UX, CSS, SCSS, HTML, JSON, SQL, MCP, DTO, CRUD, UUID, CSV, PDF, SVG, PNG.
- Prefer `user-profile-card.tsx` over `upc.tsx`.
- Prefer `authentication-service.py` over `auth.py` unless it matches an existing project convention.
- File names should clearly describe their responsibility.
- Use kebab-case for file and folder names unless the framework requires otherwise.

### Architecture
- Prefer feature-based architecture.
- Keep modules loosely coupled.
- Favor composition over inheritance.
- Minimize shared mutable state.
- Avoid circular dependencies.
- Prefer dependency injection where appropriate.

### Frontend (React)
- Use React functional components and hooks.
- Prefer TypeScript where available.
- One component per file, one primary responsibility per component.
- Keep components small and focused — aim for under ~200 lines whenever practical.
- Extract reusable logic into custom hooks.
- Keep presentation and business logic separated; keep business logic out of UI components.
- Avoid prop drilling when appropriate; prefer composition over inheritance.
- Co-locate tests, styles, and types with the component.

### SCSS
- Use the project's SCSS + BEM convention (see "Locked architecture decisions" above) — no CSS Modules, no Tailwind.
- Keep styles scoped to the feature/component.
- Prefer nesting only when it improves readability.
- Avoid overly specific selectors.
- Reuse variables, mixins, and design tokens.
- Avoid inline styles unless necessary.
- Avoid `!important` unless absolutely necessary.

### Backend (FastAPI)
- Use FastAPI best practices; keep routes thin and move business logic into services.
- Database access belongs in repositories, kept separate from API endpoints.
- Validate all request and response models with Pydantic.
- Add proper error handling with meaningful HTTP status codes.
- Prefer dependency injection over global state.
- Keep routers organized by feature.

### Python
- Follow PEP 8.
- Use explicit type hints whenever possible.
- Prefer dataclasses or Pydantic models over raw dictionaries.
- Keep functions focused on a single responsibility.
- Avoid large utility modules.
- Use meaningful exception types.
- Prefer `pathlib` over `os.path`.

### Configuration
- Store configuration in environment variables.
- Never hardcode secrets or credentials.
- Keep development and production configuration separate.
- Centralize configuration loading.

### Imports
- Remove unused imports.
- Keep imports organized.
- Prefer absolute imports if supported by the project.
- Avoid wildcard imports.

### Code Quality
- Follow existing project structure and naming conventions.
- Write readable, self-documenting, explicit code — prefer explicit over clever.
- Keep functions and files focused on a single responsibility.
- Avoid duplicate logic; refactor when duplication appears.
- Remove unused imports and dead code.
- Avoid premature optimization — readability first.
- Leave the codebase cleaner than you found it.

### Before Creating New Code
Before creating a new file, component, hook, service, utility, or model:
- Search the project for an existing implementation.
- Reuse existing code whenever appropriate.
- Extend existing modules instead of creating similar ones.
- Do not introduce duplicate functionality.

### Decision Making
When multiple implementation options exist:
- Choose the simplest maintainable solution.
- Explain why the chosen approach is preferred.
- Do not over-engineer.
- Avoid unnecessary abstractions.
- Avoid creating generic utilities until at least two real use cases exist.

### Before Finishing
- Check for linting issues.
- Check for obvious type errors.
- Ensure new code follows the existing architecture.
- Update documentation when behavior changes.
