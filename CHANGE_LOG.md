# Change Log

A running, plain-language log of what got built and why — meant to be read out loud at weekly demos, not parsed by a machine. Newest entries at the top. Each entry maps to a "Day" of work rather than a strict calendar date.

Full technical scope and week-by-week milestones live in `docs/DEV_PLAN.md` — this file is the "what actually happened" companion to that plan.

---

## 2026-07-24 — Week 1, Day 2: Everything moves into containers 🐳

**Theme:** `docker-compose.yml` grows from just `postgres` to all three services — `frontend`, `backend`, `postgres` — running together.

- 🐍 `backend/Dockerfile` — `python:3.13-slim`, installs `requirements.txt`, runs `uvicorn main:app --host 0.0.0.0`. Nothing fancy: same startup command the backend already used host-native.
- 🟩 `frontend/Dockerfile` — `node:24-slim`, runs `npm run dev -- --host 0.0.0.0`. Dev-mode container on purpose, not a production build — matches where the rest of the project is right now; a real production image is later-week territory.
- 🔌 The actual work wasn't the Dockerfiles, it was **container networking**: inside a container, `localhost` means "this container," not the host machine. Two things that used to hardcode `localhost` had to become configurable: `ollama_client.py`'s Ollama URL (now `OLLAMA_HOST` env var, defaults to `localhost:11434` unchanged for host-native dev) and the backend's `DATABASE_URL` (now overridden per-service in `docker-compose.yml` to point at the `postgres` service name instead of `localhost`). Nothing the *browser* talks to needed to change — `localhost:5173`/`:8000` still work from the host machine because Docker Desktop maps those container ports straight back out.
- ✅ Verified for real, twice over: first a raw `curl` round-trip straight through the containerized backend (confirmed it reached both the `postgres` container and the host's Ollama), then `psql` into the Postgres container to confirm the turn actually landed in `chat_sessions.transcript`. Then the full browser path — `http://localhost:5173` served from the frontend container, driven with the same headless-browser script as the earlier `ChatWindow` wiring check — real reply rendered, zero console errors.
- 🚧 **Deliberately not done yet:** no automatic Alembic migration on container startup, so a genuinely clean clone won't have tables until `alembic upgrade head` is run by hand against the containerized Postgres — today's verification reused the existing `postgres` container and its already-migrated, already-seeded volume. Validating the true "clean clone, nothing pre-existing" path is next.

**Where things stand:** the whole stack runs in Docker, but the "clean clone" milestone (`DEV_PLAN.md`'s Monday demo checklist) is still unproven from scratch. Next: prove it from a clean state, plus the rest of the Monday demo checklist narration.

---

## 2026-07-24 — Week 1, Day 2: The frontend starts talking to the backend 🔌

**Theme:** Orval codegen + wiring `ChatWindow` to the real `POST /chat` endpoint — the frontend stops faking it.

- ⚙️ Installed and configured Orval (`client: 'react-query'`, `httpClient: 'fetch'` — no axios dependency needed), pointed at the backend's live `/openapi.json`. Gave `/chat` an explicit `operation_id="chat"` backend-side so the generated hook comes out as a clean `useChat()` instead of an auto-derived name. Generated output landed in `src/api/generated/secure-ship.ts` — never hand-edited, regenerated via `npm run generate:api`.
- 🔗 Wired `ChatWindow` to `useChat()`: submitting now calls the real endpoint, shows a "Typing…" bubble while the request is in flight (input/send disabled meanwhile), and appends the real `qwen3:8b` reply as a new bot bubble on success — or a neutral fallback bubble on error/non-200. The original seeded bot message (with its mock `ShipmentCard`) stays as message #1 so the card component is still visually demoed; real replies are plain text only, since the backend doesn't call tools yet.
- 🐛 Hit and fixed two bugs the static version never exposed: (1) the browser blocked every request with a CORS error, since the FastAPI backend never allowed the Vite origin — added `CORSMiddleware` reading a new `FRONTEND_ORIGIN` env var (defaults to `http://localhost:5173`); (2) the message list never scrolled to show new messages — added a scroll-to-bottom effect keyed off the message list and pending state.
- ✅ Verified for real again: drove the running dev server + backend with a headless-browser script, confirmed the actual network request/response round-trip (not just that a fetch call exists in the code), the typing indicator appearing and clearing, the real model reply rendering, auto-scroll bringing it into view, and zero console errors. Also timed a raw `curl` call to `/chat` directly — ~77s on this CPU-only setup — to size the test's wait timeout correctly rather than guessing.

**Where things stand:** a full, real conversation now works end-to-end in the browser, ungated. Next: the remaining Week 1 item is containerizing frontend/backend into `docker-compose.yml`, then Week 2's identity-collection + 2FA gate.

---

## 2026-07-24 — Week 1, Day 2: The frontend gets a face 🖥️

**Theme:** Step 8 — Vite + React + TS scaffold, plus a static `ChatWindow` that only echoes locally. No backend wiring yet — that's next.

- 🎨 Given a UI mockup (`ai-chatbot-ui-mockup.png`) as the visual target for the whole app — sidebar with chat history + admin card, chat column with a rich shipment-detail card. Studied it and scoped what step 8 could actually build honestly: everything on screen is either real static markup or a hardcoded local-state demo, nothing fakes a backend capability that doesn't exist yet.
- 🏗️ Scaffolded `frontend/` for real: `npm create vite@latest . -- --template react-ts`, plus the SCSS+BEM baseline (`_variables.scss`, `_mixins.scss`, `global.scss`) per the locked styling decision — no CSS Modules, no Tailwind.
- 🧩 Built the sidebar as a static shell (brand header, "New Chat" button, hardcoded chat-history list, admin-access card) — real layout and styling now, real behavior (persistence, Auth0) later, since neither exists on the backend yet.
- 💬 Built `ChatWindow`: one hardcoded bot message seeds the conversation, typing + submitting appends a new bubble to local state and clears the input, "New Chat" resets it via a remount-key trick in `App.tsx`. Zero `fetch` calls anywhere — matches the Week 1 checklist's "hardcoded/echo" scope exactly.
- ✂️ Trimmed the mockup's shipment card down to only fields the real `Shipment`/`Package` models actually have — dropped Reference Number, Service Type, Shipment Date, the Timeline card, and item Quantity/Unit columns, since none of that exists in the DB and inventing it would just be more rework once real tool-call data lands in Week 2+.
- ✅ Verified for real, not just "it compiles": `tsc -b`, `oxlint`, and `vite build` all clean, then drove the actual running dev server with a headless-browser script — confirmed the initial render, the message-echo behavior (bubble appends, input clears), and the New Chat reset, with zero console errors.

**Where things stand:** the frontend has a real, styled shell that looks like the target app but talks to no one. Next: install Orval against `/openapi.json`, generate the first real hook (`useChat`), and wire `ChatWindow` to the actual `/chat` endpoint.

---

## 2026-07-24 — Week 1, Day 2: Conversations stop vanishing 💾

**Theme:** Step 7 — persist chat turns instead of losing them the moment the HTTP response goes out.

- 🗃️ `POST /chat` now creates-or-reuses a single `ChatSession` row and appends `{role, content, timestamp}` for both the user's message and the model's reply into its `transcript` JSONB array on every call.
- 🙈 Deliberately naive on purpose: no session id from the client yet, so there's just one "open" session (`ended_at IS NULL`) that every caller currently shares — real per-session identity is Week 2 scope, this step is only about proving turns land in Postgres.
- ↩️ First pass also fed the accumulating transcript back into every Ollama call for real conversation continuity — reverted it. On this CPU-only `qwen3:8b`, replaying the whole history each turn made responses noticeably slower as the session grew (one call took 42s solo-turn; a with-history call blew past a 60s timeout). Conversation continuity is a Week 2 concern; today's scope is strictly "does it persist," so pulled it back to keep `/chat` sending just the system prompt + latest message, same as before.
- ✅ Verified by hand: fired several `POST /chat` calls in a row, then `SELECT jsonb_pretty(transcript) FROM chat_sessions` in psql — every turn shows up in order, correctly timestamped, all appended to the same row rather than overwriting it.

**Where things stand:** turns persist, but a session is still a shared, id-less singleton — the growing `docs/DEV_PLAN.md` Week 2 gap is session identity + the actual state-machine transitions (`ANONYMOUS` → `COLLECTING_IDENTITY` → ... → `VERIFIED`), not just storage.

---

## 2026-07-23 — Week 1, Day 1: The database gets some data 🌱

**Theme:** stop staring at empty tables — give the schema realistic mock data to work with.

- 🌍 Built `scripts/seed_data.py`, inserting customers, shipments, and packages straight through the same SQLAlchemy models the app uses (no raw SQL, no fake-data library added — just a couple of hardcoded name/address/carrier pools and Python's `random`).
- 🌐 Customer names deliberately mix English/US, Serbian, and Russian first/last names, shuffled independently — a nod to a realistically international customer base rather than an English-only fixture set.
- ⚖️ Shipment statuses are weighted, not uniform — mostly `delivered`/`in_transit`, a handful `out_for_delivery`/`label_created`, only a rare `exception` — closer to what a real carrier's mix looks like.
- 🔗 Every shipment gets 1–3 packages, linked via `flush()`-assigned foreign keys before the final commit.
- ✅ Ran it: 26 customers, 52 shipments, 104 packages landed cleanly — all within the required ranges. Spot-checked via `psql` — names, addresses, statuses, and shipment↔package links all look plausible.

**Where things stand:** the schema now has real data to query. Next: frontend skeleton (Vite + React + TS) and wiring `/chat` through to the browser.

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
