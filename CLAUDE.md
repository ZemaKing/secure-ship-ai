# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Week 1 is in progress. `backend/` is real and running; `frontend/` and `scripts/` are still empty (per the skeleton in REQUIREMENTS.md §6.6) — not yet started.

**What exists in `backend/` so far:**
- FastAPI app (`main.py`) with `GET /health` and `POST /chat` (ungated — no session/gating logic yet, matches Week 1 scope)
- `llm/ollama_client.py` — `chat(messages, tools=None)` wrapping calls to the local Ollama server
- `db/` (SQLAlchemy engine/session, `.env`-driven `DATABASE_URL`) and `models/` (`Customer`, `Shipment`, `Package`, `ChatSession` — schema per REQUIREMENTS.md §4.4/§4.6)
- Alembic initialized and migrated (`alembic/`) — all four tables exist in Postgres, currently empty (seeding is next)

**Root-level:** `docker-compose.yml` exists but only brings up the `postgres` service so far — `frontend`/`backend` containers get added later, per REQUIREMENTS.md §4.7.

**Commands that work today (from `backend/`, with the venv active):**
- `uvicorn main:app --reload` — runs the API on `:8000`, see `/docs` for Swagger UI
- `alembic revision --autogenerate -m "..."` / `alembic upgrade head` — schema migrations
- `python llm/ollama_client.py` — standalone Ollama connectivity check

**From the repo root:** `docker compose up -d` — brings up Postgres only, for now.

No frontend commands yet, and no test suite yet — update this section again as those land.

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

`backend/` is partially scaffolded (see "Project state" above); `frontend/` and `scripts/` are still empty. This is the target shape everything should converge on — `backend/tools/` is the not-yet-built enforcement layer described above (Week 2+), and `frontend/src/api/generated/` is Orval output that should never be hand-edited once the frontend exists.

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
