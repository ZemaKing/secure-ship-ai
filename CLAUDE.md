# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This repo currently contains **no application code** — only planning documents. `frontend/`, `backend/`, and `scripts/` (per the skeleton in REQUIREMENTS.md §6.6) have not been created yet. Week 1 of the build (repo/Docker skeleton, Ollama wired in) has not started. There are no build/lint/test commands to document yet — once the project is scaffolded, update this file with the real commands (expect `npm run dev`/`build`/`lint` in `frontend/`, `uvicorn`/`pytest`/`alembic` in `backend/`, and `docker-compose up` at the root).

## What this project is

**SecureShip** is a solo, 5-week build: a parcel-tracking customer-support chat app whose entire product is a conversational identity gate. There's no signup/login for end users — a local LLM (via Ollama) collects name/address/phone conversationally, sends a mock 2FA code, and only after that verifies does the backend unlock tool-calling access to that customer's shipment data. The only real login in the system is a single Auth0-backed admin account for managing the underlying package/shipment data.

Two documents govern this project and take precedence over anything below — **read them before making architectural decisions**:

- **`REQUIREMENTS.md`** — the full spec: user stories (Epics A–G), the Mermaid architecture/state-machine/sequence diagrams (§6), the mock-data schema (§4.4), and the non-functional requirements (§4.3) that define what "gated" actually means here.
- **`DEV_PLAN.md`** — this specific (solo, Windows) build's locked-in decisions and week-by-week task list. Where REQUIREMENTS.md leaves something as "team's choice," DEV_PLAN.md §1 has already decided it — don't re-litigate those choices without the user's say-so.

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

Not yet created, but this is the shape `docker-compose.yml`, `frontend/`, `backend/`, and `scripts/` should take once scaffolded — `backend/tools/` is the enforcement layer described above, and `frontend/src/api/generated/` is Orval output that should never be hand-edited.

## Project Guidelines

### General
- Keep the implementation simple and maintainable.
- Prefer modifying existing code over creating new abstractions.
- Do not introduce new dependencies unless necessary.
- Ask before making breaking architectural changes.
- Complete the required scope before optional improvements.

### Frontend
- Use React functional components and hooks.
- Prefer TypeScript where available.
- Keep components small and focused.
- Extract reusable logic into custom hooks.
- Use the project's SCSS + BEM convention (see "Locked architecture decisions" above) — no CSS Modules, no Tailwind.
- Avoid inline styles unless necessary.
- Keep business logic out of UI components.

### Backend
- Use FastAPI best practices.
- Keep routes thin and move business logic into services.
- Use Pydantic models for request and response validation.
- Add proper error handling with meaningful HTTP status codes.
- Keep database access separated from API endpoints.

### Code Quality
- Follow existing project structure and naming conventions.
- Write readable, self-documenting code.
- Remove unused imports and dead code.
- Avoid premature optimization.
- Keep functions small and focused.

### Before Finishing
- Check for linting issues.
- Check for obvious type errors.
- Ensure new code follows the existing architecture.
- Update documentation when behavior changes.
