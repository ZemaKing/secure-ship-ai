# Change Log

A running, plain-language log of what got built and why — meant to be read out loud at weekly demos, not parsed by a machine. Newest entries at the top. Each entry maps to a "Day" of work rather than a strict calendar date.

Full technical scope and week-by-week milestones live in `docs/DEV_PLAN.md` — this file is the "what actually happened" companion to that plan.

---

## 2026-07-23 — Week 1, Day 1: The database shows up 🗄️

**Theme:** stand up real Postgres, real tables, real migrations — no more "nothing persists" (flagged in the plan as the day's least-familiar territory).

- 🐳 Added `docker-compose.yml` with just the `postgres` service for now (per spec: `secureship` DB, `user`/`pass`, port 5432, persistent volume) — `frontend`/`backend` containers get added to this same file later, not a separate one.
- 🏗️ Built the four core tables as SQLAlchemy models — `Customer`, `Shipment`, `Package`, `ChatSession` — matching the schema in REQUIREMENTS.md §4.4/§4.6 field-for-field, including the two enum columns (`shipment.status`, `chat_session.state`) and the `transcript` JSONB column.
- 🔧 Wired up `backend/db/` — a connection to Postgres via SQLAlchemy, config'd from `.env`, no hardcoded credentials.
- 📐 Set up Alembic (the migrations tool) and generated/applied the first migration — `alembic upgrade head` creates all four tables from scratch.
- 🐛 Caught a real bug before it landed: Postgres was about to store enum values as `LABEL_CREATED` instead of the spec's `label_created` (SQLAlchemy's default is to use the enum's name, not its value). Fixed and regenerated the migration before applying.
- ✅ Verified directly in psql — all four tables exist with the right columns, foreign keys, native Postgres enums (correct lowercase values), and a real `jsonb` column. Confirmed `/health` and `/chat` still work unaffected.

**Where things stand:** the schema is real and migrated, but empty — no data in it yet. Next: `scripts/seed_data.py` to generate ≥25 customers and 40–60 shipments so there's actually something for the chat to look up later.

---

## 2026-07-23 — Week 1, Day 1: First real conversation 💬

**Theme:** wire the local model into an actual HTTP endpoint — today's key milestone.

- 🔧 Generalized the standalone Ollama script into a reusable `chat(messages, tools)` function — same request/response contract, but now callable from anywhere, with an unused `tools` param reserved so Week 2's tool-calling can slot in without a rewrite.
- 🆕 Built `POST /chat`: takes a message, adds a basic support-agent system prompt, calls the local model, returns the reply. No database, no session history, no gating — matches Week 1's "anyone can ask anything" goal exactly.
- ✅ Tested by hand via Swagger UI (`/docs`) and Postman — sent "Hi, where's my package?", got back a real, coherent `qwen3:8b` reply over HTTP.
- 🕵️ Sanity-checked the "no gate yet" expectation on purpose: asked "Show me all shipments for customer 42" and the model happily hallucinated a fake shipment list instead of refusing. Expected and correct for today — it's exactly the gap Week 2's tool-calling enforcement (`verify_identity`, `lookup_shipments` scoped to a real session) is built to close.

**Where things stand:** a full conversation now works end-to-end over HTTP, ungated. Next: wire Orval + the frontend `ChatWindow` to this endpoint, then start persisting turns to `ChatSession.transcript`.

---

## 2026-07-23 — Week 1, Day 1: Kickoff 🚀

**Theme:** paperwork before code — a clear plan and a documented starting point.

- 📋 Turned Week 1's goal ("a real conversation, zero security") into 8 ordered build checkpoints for today.
- 🔍 Confirmed the starting line: `frontend/`, `backend/`, `scripts/` exist but are empty — true from-scratch start.
- 🗺️ Copied the original architecture diagrams (system design, identity-verification flow, escalation theater, tool-calling sequence, data model, deployment layout) into `docs/diagrams/` as our "before" snapshot — to be redrawn in Week 5 against what we actually build.
- 🩺 First real backend code: a bare-bones FastAPI server with a `/health` check — proof the server boots and answers before anything smarter gets layered on.
- ✅ Tested by hand — clean `200 OK`, plus the framework's free interactive docs page loading in-browser.
- 🤖 Talked to the local AI brain directly for the first time — a standalone script hits Ollama and gets a real `qwen3:8b` reply back, no server or app logic involved yet.
- ✅ Confirmed: asked it what a tracking number is, got a correct, coherent answer in a few seconds (CPU-only, as expected).

**Where things stand:** backend server alive, health check passing, local AI model confirmed responsive. Next: wire that model into a real `/chat` endpoint — the day's key milestone, a full conversation over HTTP.
