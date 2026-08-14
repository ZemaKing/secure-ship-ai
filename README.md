# SecureShip

A parcel-tracking customer-support chat app whose entire product is a conversational identity gate. There's no signup/login for end users — a local LLM (via [Ollama](https://ollama.com), `qwen3:8b`) collects a visitor's name/address/phone conversationally, sends a mock 6-digit 2FA code, and only after that verifies does the backend unlock tool-calling access to that customer's own shipment data. The only real login in the system is a single Auth0-backed admin account for managing the underlying customer/shipment/package data.

Built solo over a 5-week, AI-assisted-development program — see [Program & docs](#program--docs) below for the full spec and the day-by-day build log.

## Why this exists

The interesting engineering problem here isn't the chat UI — it's proving that identity gating and tool-calling enforcement live in the **backend**, not in the model's prompt or the frontend's "looking" gated. A visitor can try prompt injection, a smuggled customer ID, or a raw API call that skips the chat UI entirely, and none of it should widen what data comes back. See [`docs/ADVERSARIAL_TESTING.md`](docs/ADVERSARIAL_TESTING.md) for a documented attempt against the real model.

## Architecture at a glance

```
Browser (React) ──POST /chat──▶ FastAPI ──▶ Ollama (qwen3:8b, local)
                                    │
                                    ├─▶ Tool layer (tools/) — the enforcement point:
                                    │     lookup_shipments() always scopes to
                                    │     session.customer_id, never a model/user-
                                    │     supplied argument (no such parameter exists)
                                    │
                                    └─▶ Postgres — customers / shipments / packages /
                                          chat_sessions (transcript stored as JSONB)

Browser (React, /admin/*) ──Auth0 Universal Login──▶ Auth0 (admin:access RBAC scope)
                                    │
                                    └─▶ FastAPI /admin/* (router-level auth dependency)
                                          → same Postgres tables, plain CRUD
```

The two identity systems — the chat's conversational gate and Auth0's admin login — are structurally separate by design: no code path lets one become the other (proven in `backend/tests/test_admin_chat_separation.py`). Full diagrams (state machine, tool-calling sequence, ERD, deployment topology) live in [`docs/diagrams/`](docs/diagrams/).

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React 19 + TypeScript, global SCSS + BEM (no CSS Modules/Tailwind) |
| API client | [Orval](https://orval.dev)-generated React Query hooks from the backend's OpenAPI schema — no hand-written fetch calls |
| Backend | FastAPI + Pydantic v2 + SQLAlchemy + Alembic + Uvicorn |
| Database | Postgres (chat transcripts stored in a `JSONB` column, not a second datastore) |
| Local LLM | [Ollama](https://ollama.com) running `qwen3:8b`, containerized as an `ollama` Compose service (also runs fine host-native, e.g. for backend-outside-Docker iteration) |
| Admin auth | Auth0 (Universal Login, RBAC `admin:access` scope), via `auth0-fastapi-api` / `@auth0/auth0-react` |
| Tests | `pytest` (backend), Vitest + Testing Library (frontend) |

## Quick start (Docker Compose)

**Prerequisites:** Docker Desktop. Ollama itself is containerized (an `ollama` Compose service pulls `qwen3:8b`, ~5.2GB, on first start) — no separate host install needed, though a host-native `ollama serve` still works identically if you're running the backend outside Docker.

```bash
docker compose up -d --build
# first start: `docker compose logs ollama` to watch the qwen3:8b pull —
# backend won't start until ollama's healthcheck passes
python scripts/seed_data.py   # needs the backend's venv active, or run it inside the backend container
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend / Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- `curl http://localhost:8000/health` → `{"status":"ok"}`

**Full rebuild from scratch** (drops the Postgres volume and the Ollama model volume too — the next `up` re-pulls `qwen3:8b` from scratch):

```bash
docker compose down -v --rmi local
docker compose up -d --build
docker compose logs backend   # watch for the alembic upgrade head lines
cd backend && source .venv/Scripts/activate && python ../scripts/seed_data.py
```

## Local dev (host-native, faster iteration)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload   # :8000, see /docs for Swagger UI

# Frontend (separate terminal)
cd frontend
npm install
npm run dev   # :5173

# Seed data (separate terminal, backend venv active)
python scripts/seed_data.py
```

## Environment variables

Neither `.env` file is committed — copy the shape below into `backend/.env` and `frontend/.env`.

**`backend/.env`**
```
DATABASE_URL=postgresql://user:pass@localhost:5432/secureship
FRONTEND_ORIGIN=http://localhost:5173
AUTH0_DOMAIN=<your-tenant>.us.auth0.com
AUTH0_AUDIENCE=<your Auth0 API identifier>
```

**`frontend/.env`**
```
VITE_AUTH0_DOMAIN=<your-tenant>.us.auth0.com
VITE_AUTH0_CLIENT_ID=<your Auth0 SPA client ID>
VITE_AUTH0_AUDIENCE=<your Auth0 API identifier — must match AUTH0_AUDIENCE above>
```

`OLLAMA_HOST` is optional and only needed to override the default (`http://localhost:11434` for a host-native `ollama serve`; `docker-compose.yml` sets it to `http://ollama:11434` to reach the `ollama` Compose service instead). Admin login requires an Auth0 tenant with RBAC enabled and an `admin:access` permission assigned to your admin user — see `docs/REQUIREMENTS.md` §4.5 for the Agent-Skills-driven setup this project used.

## Project structure

```
backend/
  routes/       # chat.py, verify.py, admin.py — thin, delegate to services/tools
  services/     # business logic (prompting, escalation, admin_*), plain functions over db.query()
  tools/        # the enforcement layer — verify_identity, send_verification_code,
                #   check_verification_code, lookup_shipments (model-callable)
  models/       # SQLAlchemy models: Customer, Shipment, Package, ChatSession
  auth/         # Auth0 JWT validation (auth0-fastapi-api, no hand-rolled JWKS)
  tests/        # pytest — transaction-per-test against the real dev Postgres
frontend/
  src/components/   # ChatWindow, CodeModal, EscalationBanner
  src/admin/        # Auth0-protected admin panel (Dashboard/Customers/Shipments/Packages)
  src/api/generated/ # Orval output — never hand-edited
scripts/
  seed_data.py  # populates Postgres with mock customers/shipments/packages
docs/
  REQUIREMENTS.md, DEV_PLAN.md, diagrams/, ADVERSARIAL_TESTING.md
```

## Running the tests

```bash
# Backend — needs the dev Postgres up/migrated, AUTH0_DOMAIN/AUTH0_AUDIENCE in .env;
# never calls the real Ollama model or a real Auth0 endpoint
cd backend && pytest

# Frontend — no backend/Postgres/Ollama/Auth0 needed; each file mocks only its
# own true external boundary (fetch, useAuth0())
cd frontend && npm test
```

## Key commands

| From | Command | Does |
|---|---|---|
| `backend/` | `alembic revision --autogenerate -m "..."` / `alembic upgrade head` | Schema migrations |
| `backend/` | `python llm/ollama_client.py` | Standalone Ollama connectivity check |
| `frontend/` | `npm run generate:api` | Regenerate Orval hooks against the backend's live `/openapi.json` |
| `frontend/` | `npm run build` / `npm run lint` | Type-check + production build / oxlint |
| repo root | `docker compose up -d` | Bring up `postgres` + `ollama` + `backend` + `frontend` |
| repo root | `python scripts/seed_data.py` | (Re-)seed mock data — safe to re-run, adds more rows each time |

## Program & docs

This project was built as part of a 5-week, AI-assisted-development program. Read these in order for the full picture:

- [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) — the full spec: user stories, architecture/state-machine/sequence diagrams, mock-data schema, non-functional requirements
- [`docs/DEV_PLAN.md`](docs/DEV_PLAN.md) — this build's locked-in decisions and week-by-week task list/checklists
- [`CHANGE_LOG.md`](CHANGE_LOG.md) — a day-by-day narrative of what got built and why, meant to be read like a build diary
- [`TECH_NOTES.md`](TECH_NOTES.md) — a per-file technical breakdown of the codebase
- [`docs/ADVERSARIAL_TESTING.md`](docs/ADVERSARIAL_TESTING.md) — the documented prompt-injection/smuggled-ID attempt against the real model
- [`docs/diagrams/`](docs/diagrams/) — Mermaid diagrams kept in sync with the actual implementation (Section 6 of `REQUIREMENTS.md`)

## Non-negotiable invariants

Held true at every phase of the build, not just at the end:

- The identity/verification gate is enforced server-side, in the tool layer — never in the model's prompt or the frontend's UI state
- `lookup_shipments` (and any data tool) always scopes to `session.customer_id` read from server-side session state — never a customer-supplied identifier
- No PII in persistent logs — console output during dev is fine; nothing with mocked name/address/phone/code lands in a file on disk
- The local Ollama model is the only thing answering inside the chat at runtime — Claude Code is a build-time tool only
- A verified session is tied to that session only — a new session always re-verifies
- Admin auth (Auth0) and conversational verification are structurally separate — no code path lets one become the other
