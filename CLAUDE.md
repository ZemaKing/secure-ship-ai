# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

SecureShip is complete end to end. The chat is fully gated: a visitor asking about a shipment gets conversationally asked for their identity, extracted across multiple turns in any order, matched (or neutrally rejected) against seeded `Customer` records, and — on a match — gets sent a mock 6-digit 2FA code (console-only) that a real `POST /verify-code` call checks through an on-demand modal in the browser. Saying something like "I want to talk to a human," from any state, triggers a scripted, cosmetic handoff to "Melany" with a staggered-reveal banner and a color shift in the browser — it doesn't bypass the gate: an unverified visitor who escalates still gets declined on shipment specifics. The frontend's session/event/escalation bookkeeping lives in its own hook (`hooks/useChatSession.ts`) rather than scattered across `ChatWindow`.

Verified users get real, data-backed shipment answers, and the enforcement point is provable, not just claimed. `lookup_shipments(db, session)` is exposed as a tool to `Verified` sessions and wired into a real chat turn — `_dispatch_tool()` calls it and a second, tool-free model call phrases a natural-language answer from the real result, scoped strictly to `session.customer_id` with no identifier parameter anywhere in the tool's signature or schema, and the scoping decision prints to the terminal on every call. The frontend renders that real data through the `ShipmentCard` component (Orval-regenerated `ChatResponse.shipments`). The enforcement point has been tried under deliberate attack, not just designed to resist one: `backend/tests/test_gating.py` proves a prompt-injection attempt and a smuggled foreign customer-id argument both fail to widen the query, and a live attempt against the real `qwen3:8b` had the model decline on its own — see `docs/ADVERSARIAL_TESTING.md`.

The admin panel (`/admin/*`) is real, protected by a router-level `Depends(get_current_admin)` backed by `auth0-fastapi-api`'s `Auth0FastAPI.require_auth(scopes="admin:access")` (JWKS validation, never hand-rolled, plus a real RBAC permission check — a valid signed token alone isn't enough). The frontend has a real Auth0 Universal Login round trip — a visitor clicks Admin Access, logs in via Auth0's own hosted login, and lands back on `/admin` seeing real decoded token claims from `GET /admin/me`. `AdminLayout.tsx` is the real admin shell per the `admin-pages.png` mockup: a dedicated sidebar (Dashboard/Customers/Shipments/Packages, all wired) plus a header with a working Logout button, nesting real child routes under `/admin`. Full CRUD exists for Customers, Shipments (including a status-dropdown row action that `PATCH`es just `{"status": ...}` via a deliberately partial-update `ShipmentUpdate` schema, unlike the full-replace `CustomerUpdate`/`PackageUpdate`), and Packages, each with delete-with-children surfacing a `409` where applicable (Shipments/Customers; Packages have no children). `admin/Dashboard/Dashboard.tsx` derives 4 stat cards + a Recent Shipments mini-table entirely client-side via `useMemo` over the same `useListShipments()` data `ShipmentManager` fetches — no dedicated backend endpoint. The admin write path and the chat read path (`lookup_shipments`) are proven to share the same Postgres rows: an admin-driven status update is reflected in a subsequent verified chat answer, both live-verified in the browser and pinned by `backend/tests/test_admin_shipments.py`. `backend/tests/test_admin_chat_separation.py` is the Epic E4 structural-separation proof — every `/admin/*` route rejects no/invalid tokens, source inspection confirms no admin file ever references `ChatSession`, `/chat`/`verify-code` are indifferent to a stray admin bearer token, and an admin customer edit never mutates an unrelated `ChatSession` row.

Beyond the core CRUD scope, the build also includes a read-only admin chat-session viewer (`services/admin_sessions.py`, `admin/SessionManager/`, with a narrowed structural-separation test proving it's read-only rather than weakening Epic E4's invariant); a project-authored `.claude/skills/orval-regen-suggestion/SKILL.md` that suggests (never auto-runs) an Orval regen when backend routes/schemas change; and Ollama itself containerized as an `ollama` Compose service (`ollama:11434`), with `ollama serve` host-native still working identically for anyone running the backend outside Docker. A systematic PII/logging audit (`docs/PII_AUDIT.md`) found one accepted, documented trade-off — Docker's own default `json-file` log driver persists container stdout outside this repo, never something this app writes itself — and no code changes were otherwise needed, since every real print/log path was already console-only by design.

All of this is covered by real automated test suites on both sides — `backend/tests/` (pytest) and `frontend/src/**/*.test.ts(x)` (Vitest) — rather than only ever-run-by-hand curl/browser checks.

**What exists in `backend/` so far:**
- FastAPI app (`main.py`) with `GET /health` and `POST /chat`; CORS middleware allows the `FRONTEND_ORIGIN` env var (`.env`-driven, defaults to `http://localhost:5173`) so the Vite dev server can call it cross-origin
- `POST /chat` persists both turns of every call into `ChatSession.transcript` (JSONB). Sessions are genuinely per-client: the client holds a `session_id` returned by the backend and sends it back on every turn; an absent/unknown one creates a fresh row. The model is still only ever sent the system prompt + latest message (not the accumulated transcript) — replaying full history back to Ollama was tried and reverted, see `CHANGE_LOG.md` 2026-07-24.
- `schemas/chat.py` / `schemas/verify.py` — `ChatRequest`/`ChatResponse` (with `session_id`/`state`/`event`/`escalation` fields) and `VerifyCodeRequest`/`VerifyCodeResponse` (live behind `POST /verify-code`), pulled out of `routes/` into their own Pydantic modules
- `services/prompting.py` — `build_system_prompt(known_identity, *, collecting_identity=False)` builds the system prompt per turn: known-so-far identity fields (from `ChatSession.pending_identity`) plus, while a session is `Anonymous`/`CollectingIdentity`, instructions telling the model to ask for and incrementally report identity fields via the `verify_identity` tool
- `tools/schemas.py` — `VERIFY_IDENTITY_TOOL_SCHEMA` (all four fields individually optional, so partial/incremental tool calls are legal) and the shared `IDENTITY_FIELDS` tuple
- `tools/verify_identity.py` — `verify_identity(db, session, first_name=None, last_name=None, phone_number=None, address=None)`: merges given fields into `session.pending_identity`, only attempts a case-insensitive `Customer` match once all four are present, returns `PARTIAL`/`REJECTED`/`MATCHED(customer_id)`. The one place in the codebase that reads `Customer` rows or writes `pending_identity`/`pending_customer_id` for this flow — the model itself never sees or supplies a `customer_id`
- `routes/chat.py` orchestration: `_tools_for_state()` offers `verify_identity` only while `Anonymous`/`CollectingIdentity`; `_dispatch_tool()` re-checks the model's tool-call name against that same allowlist (rejects a hallucinated/prompt-injected name, drops unexpected extra arguments) before running anything; `REJECTED` returns a fixed neutral message with no second model call; `PARTIAL` makes a second model call (no tools) to phrase a natural follow-up for the still-missing fields; `MATCHED` calls `send_verification_code()` for real and returns `event="code_sent"`. Two backend-only fallbacks cover cases the model won't reliably signal itself: `_mentions_shipment()` flips a from-scratch session's very first, identity-free message `Anonymous → CollectingIdentity`; a second check re-runs `verify_identity()` when a session lands back in `CollectingIdentity` with every field already known (e.g. post-2FA-lockout) but the model sees nothing new to report, so a fresh code still gets sent without the visitor retyping anything
- `services/escalation.py` / `routes/chat.py`'s `_handle_escalation()` — `wants_escalation()` (keyword check on phrases like "talk to a human") short-circuits at the very top of the turn, before any Ollama call, from any session state except an already-`EscalatedToHuman` one. Builds the scripted §6.2b lines plus a greeting personalized from `_resolve_known_first_name()` (reads only `pending_identity`/a verified `Customer` row — never the triggering message itself, per Epic G4) and returns `event="escalated"` with a real `EscalationPayload(lines, agent_name, first_name)`. No tool is ever offered in `EscalatedToHuman`, and `build_system_prompt(..., unverified_escalation=...)` explicitly tells the model it's still gated whenever `customer_id` isn't set — confirmed live that a shipment question right after escalating still gets declined, not entertained
- `services/verification_store.py` — in-memory (single-process, no Redis) 2FA code store keyed by `session_id`: `PendingVerification(code, customer_id, expires_at, attempts)`, 300s TTL, 3 max attempts, never persisted to Postgres or a log file
- `tools/send_verification_code.py` — generates a 6-digit code via `secrets.randbelow`, prints it as `[MOCK SMS] To <phone>: ...` (console only), stores it, and sets `session.state = AwaitingCode`
- `tools/check_verification_code.py` — `MATCH` promotes `pending_customer_id` → the real `customer_id`, sets `Verified`, clears pending state; `MISMATCH` counts attempts; the 3rd wrong attempt is a deliberate `LOCKED_OUT` (no silent auto-regenerate) reverting to `CollectingIdentity` with identity fields retained; `EXPIRED` behaves the same way
- `routes/verify.py` — `POST /verify-code`, mounted in `main.py`; 404s on an unknown/malformed `session_id` rather than 500ing; never echoes the code itself back in any response
- `auth/dependencies.py` — constructs `Auth0FastAPI(domain=os.environ["AUTH0_DOMAIN"], audience=os.environ["AUTH0_AUDIENCE"])` (fail-fast, same `.env`-driven idiom as `db/session.py`'s `DATABASE_URL`) and exposes `get_current_admin = auth0.require_auth(scopes="admin:access")` (closes the "anyone who signs up is an admin" gap; a valid signed token is not sufficient on its own, it must also carry the `admin:access` permission, RBAC'd on the Auth0 side and never granted automatically by signup) — the SDK does all JWKS fetch/cache/validation, no hand-rolled JWT verification. `routes/admin.py` mounts `APIRouter(prefix="/admin", dependencies=[Depends(get_current_admin)])` — one router-level dependency is the single enforcement point for every `/admin/*` route, present and future
- `GET /admin/me` (`schemas/admin.py::AdminMeResponse`) returns decoded token claims. `services/admin_customers.py` — plain `list_customers`/`get_customer`/`create_customer`/`update_customer`/`delete_customer` functions, `db.query(...)` directly, same shape as `tools/lookup_shipments.py`, no repository layer. `routes/admin.py`'s five Customer routes are thin wrappers around them; `DELETE` catches `IntegrityError` (a customer with existing shipments) and returns a documented `409` (`schemas/admin.py::ErrorDetail`, reused for the same pattern in Shipment/Package delete) instead of a `500`
- `services/admin_shipments.py` — same plain-function shape as `admin_customers.py`, plus `routes/admin.py`'s five Shipment routes and `_to_shipment_out()` (denormalizes `customer_name` onto the response so the admin table needs no second join). `schemas/admin.py::ShipmentUpdate` is a deliberate deviation from `CustomerUpdate`'s full-replace shape — every field `Optional`, so the admin UI's status-dropdown row action can `PATCH` just `{"status": ...}` (via `update_shipment`'s `data.model_dump(exclude_unset=True)` merge) without resubmitting the rest of the record. `DELETE` gets the same `409`-on-children treatment for a shipment with existing packages
- `services/admin_packages.py` — same plain-function shape again, plus `routes/admin.py`'s five Package routes and `_to_package_out()` (denormalizes the parent shipment's `tracking_number`). `schemas/admin.py::PackageUpdate` is a plain full-replace shape, like `CustomerUpdate` rather than `ShipmentUpdate` — no row action needs a partial merge here. `DELETE` has no `409`-on-children case — nothing has a foreign key pointing at `packages.id`, the only CRUD entity without one
- `llm/ollama_client.py` — `chat(messages, tools=None)` returns a `ChatCompletionResult(content: str | None, tool_calls: list[ToolCall])` instead of a bare string, so a caller can branch on tool calls the model made; base URL is `OLLAMA_HOST` env-driven (defaults to `http://localhost:11434` for host-native runs; the containerized backend sets it to `http://ollama:11434` — the `ollama` Compose service — no code change was needed for this, only `docker-compose.yml`)
- `Dockerfile` — `python:3.13-slim`, installs `requirements.txt`, startup runs `alembic upgrade head && uvicorn main:app --host 0.0.0.0` — migrations apply automatically on container start, no manual step needed
- `db/` (SQLAlchemy engine/session, `.env`-driven `DATABASE_URL`) and `models/` (`Customer`, `Shipment`, `Package`, `ChatSession` — schema per REQUIREMENTS.md §4.4/§4.6). `ChatSession` has grown two nullable columns beyond the original schema: `pending_customer_id` (FK → `customers.id`) and `pending_identity` (JSONB) — scratch space for identity collected mid-conversation, before `customer_id`/`Verified` is confirmed
- Alembic initialized and migrated (`alembic/`) — the original four-table migration, plus a second migration adding the two `pending_*` columns to `chat_sessions`
- `tests/` (`pytest.ini` sets `pythonpath = .`) — 44 tests across 12 files, run against the real dev Postgres via a transaction-per-test rollback fixture in `conftest.py` (no second test DB, no truncate step) plus an autouse fixture clearing the in-memory 2FA store between tests. `db_session`'s `Session(...)` uses `join_transaction_mode="create_savepoint"` — needed once a test first exercised code that calls `db.rollback()` itself (the Customer delete-409 handler); without it, that rollback wiped out the whole test's own fixture data, not just the failed operation. Covers session isolation, identical-rejection-wording across every single-field identity mismatch, the full 2FA flow (lockout/match/expiry — expiry via a monkeypatched clock, not a mutated `expires_at`), the tool allowlist rejecting both a hallucinated name and a real tool once a state stops offering it, post-escalation gating while unverified (with `ollama_client.chat` mocked so the real model is never needed for this assertion), `lookup_shipments`'s own scoping (no identifier parameter exists, two sessions get two non-overlapping result sets), an explicit adversarial pass proving a prompt-injection attempt and a smuggled foreign customer-id argument both fail to widen the query (see `docs/ADVERSARIAL_TESTING.md` for the demoable write-up, including what the real model did when the injection was tried live), that a rejected tool call's reply never falls back to the model's own raw narration, which could otherwise name the rejected tool itself, `/admin/me`'s real HTTP-level behavior via `TestClient` (a missing header is `400`, an invalid token is `401`, a real claims dict flows through via `app.dependency_overrides`), full Customer CRUD through `TestClient` with `get_db` also overridden onto the test's own transactional session, including the delete-with-children `409` proving the customer is still there afterward, not partially deleted, full Shipment CRUD the same way, plus `test_status_update_via_admin_is_what_lookup_shipments_returns_next` — the automated proof that an admin-driven status update is what a subsequent `lookup_shipments()` call for that customer actually returns, the same claim the Monday demo dry run makes live, full Package CRUD, with no delete-with-children case since nothing hangs off a package, and the Epic E4 structural-separation proof in `test_admin_chat_separation.py` — every `/admin/*` route rejecting no/invalid tokens, source inspection confirming no admin file ever references `ChatSession`, `/chat`/`verify-code` proven indifferent to a stray admin bearer token (Ollama mocked), and an admin customer edit proven not to mutate an unrelated `ChatSession` row

**What exists in `scripts/` so far:**
- `seed_data.py` — populates Postgres with mock customers (English/US, Serbian, and Russian first/last names, grouped so a customer's surname always matches their given name's nationality — no "Milos Smith" mismatches), shipments (realistic status distribution), and packages, straight through the ORM models. No truncate/reset step — safe to re-run, but re-running just adds more rows on top of what's there. The DB has live mock data, not just empty tables.

**What exists in `frontend/` so far:**
- Vite + React + TS scaffold (`npm create vite@latest . -- --template react-ts`), global SCSS + BEM baseline (`src/styles/_variables.scss`, `_mixins.scss`, `global.scss`) — no CSS Modules, no Tailwind
- `components/Sidebar/` — static shell matching `ai-chatbot-ui-mockup.png`: brand header, "New Chat" button (resets `ChatWindow` via a remount key owned by `App.tsx`), hardcoded `ChatHistoryList` (no real chat-history persistence yet), `AdminAccessCard` — its button is a real `<Link to="/admin">` instead of a dead `href="#"` (relabeled "Administrator Panel" with an icon, matching the mockup's actual copy)
- `components/ChatWindow/` — `ChatWindow` still seeds with one hardcoded bot message (including a mock `ShipmentCard`, fields limited to what `Shipment`/`Package` models actually have) so the card component stays visually demoed, but every message after that is real: submitting calls the generated `useChat()` mutation with `{ message, session_id }`, shows a "Typing…" bot bubble while pending (input/send disabled meanwhile), appends the real Ollama reply (plain text, no `ShipmentCard` — the backend doesn't call shipment-lookup tools yet) on success, or a neutral fallback bubble on error/non-200. `session_id`/`event` are read from `hooks/useChatSession.ts` rather than the component's own `useState` — `applyResponse(response.data)` updates all four hook fields after every successful turn, and `sessionId` is sent back on every subsequent request (there is no "most recent open session" fallback). Also renders `<CodeModal>` whenever `event === "code_sent"`, keyed off an incrementing counter so the modal fully remounts (clean state) on every genuinely new code, including a post-lockout resend where the `event` string itself doesn't change. When `event === "escalated"`, pushes an `escalation`-role message carrying the real payload instead of a plain bot bubble, and tracks a `humanJoined` flag (flipped by `<EscalationBanner>` once it reaches its "human joined" reveal beat) that toggles a `chat-window--human-joined` color-shift class on the whole window. Message list auto-scrolls to the newest bubble on every update.
- `hooks/useChatSession.ts` — a small hook (not a global store/context, per the project's React-Query-only state convention) holding `sessionId`/`state`/`event`/`escalation`, with one `applyResponse(response: ChatResponse)` merging all four from a real backend response.
- `components/CodeModal/` — the real UI surface for the gating work: a controlled `open`/`sessionId`/`onVerified` component with 6 individual digit inputs, calling the generated `useVerifyCode()` mutation directly. Dismissible via Escape/backdrop-click with no network call (server-side pending code/attempt-count is untouched by dismissing); on a wrong code, shows the backend's own `reply` text and `attempts_remaining` verbatim; a generic `state !== "awaiting_code"` check (covering both `LOCKED_OUT`/`EXPIRED`) disables further input, leaving Cancel as the only way out. Styled against `ai-chatbot-modal-mockup.png` using the project's normal BEM `.scss` convention (the pasted chunk spec named a `.module.scss` file, but CSS Modules aren't part of this project's locked styling decision).
- `components/EscalationBanner/` — the frontend half of the escalation theater: takes the `EscalationPayload` `ChatWindow` already has (`lines`/`agent_name`/`first_name`) and staggers the reveal of each line client-side (~700ms apart) — purely a cosmetic pacing over data the backend already sent in one response, per Epic G3. Fires an `onHumanJoined` callback once, when the fixed line index for "Melany has entered the chat" becomes visible (a stable-position assumption tied to `ESCALATION_SCRIPT_LINES`'s backend ordering, not content-matched). Built as `EscalationBanner.scss` (plain BEM), same deviation from the pasted `.module.scss` spec as `CodeModal`.
- `auth/Auth0ProviderWithNavigate.tsx` + `auth/ProtectedRoute.tsx` — `Auth0ProviderWithNavigate` wraps `Auth0Provider` with an **explicit** `redirect_uri` (`window.location.origin`) and an `onRedirectCallback` that navigates to `appState.returnTo` — omitting `redirect_uri` was the actual cause of a real, live `server_error: Unable to issue redirect for OAuth 2.0 transaction`, reproduced identically across two fresh Auth0 tenants before being tracked down (see `CHANGE_LOG.md`). `ProtectedRoute` redirects an unauthenticated visitor to login (guarded by a `useRef` against StrictMode's dev-only double effect invocation) and passes `appState: { returnTo: location.pathname }` so login lands back where the visitor actually started. `authorizationParams.scope` explicitly requests `'openid profile email admin:access'` — the RBAC `permissions` claim and the OAuth `scope` claim are two separate things in Auth0 tokens, and `auth0-fastapi-api`'s `require_auth(scopes=...)` only checks the latter, so `admin:access` has to be requested here even though the permission itself is assigned server-side.
- `admin/AdminLayout.tsx` (+ `.scss`) — the real admin shell per `admin-pages.png`: a dedicated sidebar (Dashboard/Customers/Shipments/Packages nav, all four wired, each with a real nav icon) plus a header with a working Logout button. Renders a react-router `<Outlet />` for whichever admin page is active. `admin/useAdminAccessToken.ts` — extracts the `getAccessTokenSilently()`/`authHeaders()` dance into a shared hook used by `AdminLayout`, `CustomerManager`, `ShipmentManager`, and `PackageManager`. `admin/ConfirmDialog/` — a generic delete-confirmation modal, built once for reuse across Customer/Shipment/Package delete flows, not per-manager; reused as-is by `ShipmentManager` and `PackageManager`. `admin/CustomerManager/` — table (Name/Phone/Address/Actions) with client-side search and a two-direction Name-column sort, icon-based Edit/Delete row actions (a `mask-image`/`currentColor` technique to recolor the otherwise-hardcoded-black SVGs), `CustomerFormModal` (Add/Edit, same form per `admin-modals.png`'s "doubles as Edit" note) — its remount `key` (`customer.id`/`'create'`/`'closed'`) is required, not decorative, since the modal stays mounted across Add→Edit and its form-state initializer only runs on true first mount (same class of bug `CodeModal`'s own remount-key trick already solved once, for a different reason). Has a third row action, **Copy to Clipboard** (`table-copy.svg`, same mask-image technique) — `navigator.clipboard.writeText()` of a plain labeled text block (name/phone/address) meant to be pasted straight into the chat window as answers to the bot's identity questions, with a transient "Copied!" confirmation. All three managers' Actions columns (Customer/Shipment/Package) are right-aligned. `admin/ShipmentManager/` — table (Tracking Number/Customer/Origin/Destination/Carrier/Status/Est. Delivery/Updated/Actions) with a first-class status-dropdown row action (`PATCH`ing just `{"status": ...}`, the literal Monday demo gesture) doubling as a colored pill via the existing `$color-status-*` tokens, `ShipmentFormModal` (Add/Edit) applying both fixes `CustomerFormModal` learned the hard way (remount `key`, picking only editable fields off the `*Out` prop) from the start. `admin/PackageManager/` — table (Tracking Number/Description/Weight (kg)/Declared Value/Actions), `PackageFormModal` (Add/Edit, with a Shipment `<select>` populated from `useListShipments()`) applying both fixes from the start too. `admin/Dashboard/Dashboard.tsx` — 4 stat cards (Total/In Transit/Delivered/Exceptions) + a Recent Shipments mini-table per `admin-dashboard.png`, derived entirely client-side via `useMemo` over the same `useListShipments()` data `ShipmentManager` fetches, no new backend endpoint; the mockup's "+X% from last month" deltas and System Status/User Management/Quick Actions panels were deliberately left out as unbacked by any real data or epic. Gates its loading state on `data === undefined` rather than react-query's `isLoading` — a real bug found and fixed, since `isLoading` reads `false` while a query is merely `disabled` (token not yet resolved), which let the page flash empty/zeroed content before the real fetch even began. `utils/formatDate.ts` — `formatDateTime`/`formatDate` extracted out of `ChatWindow.tsx` into the frontend's first shared, non-feature-specific utility folder, once `ShipmentManager` needed the same formatting. Also has `formatUpdated()` — today's updates show only a time, older ones only a date — used in place of `formatDateTime` in Dashboard's and `ShipmentManager`'s "Updated" columns, shrinking that column to help with the Shipments table's horizontal scroll.
- Frontend test suite — **Vitest**, not Jest, since it reuses `vite.config.ts` directly (`vitest.config.ts` = `mergeConfig(viteConfig, {...})`, no second transform/config to maintain) + Testing Library. `hooks/useChatSession.test.ts`, `components/CodeModal/CodeModal.test.tsx`, `auth/ProtectedRoute.test.tsx`, `admin/CustomerManager/CustomerManager.test.tsx`, `admin/ShipmentManager/ShipmentManager.test.tsx`, `admin/PackageManager/PackageManager.test.tsx`, and `admin/Dashboard/Dashboard.test.tsx` — all co-located with what they test, deliberately scoped to the places with real branching logic rather than every component. Only the true external boundary is mocked per file — `global.fetch` for `CodeModal`/`CustomerManager`/`ShipmentManager`/`PackageManager`/`Dashboard`, `useAuth0()` for `ProtectedRoute`/`CustomerManager`/`ShipmentManager`/`PackageManager`/`Dashboard` — everything else (React Query, component state machines) runs for real. `CustomerManager.test.tsx` caught two real bugs before they reached the browser: the remount-key issue above, and a customer `id` leaking into `PATCH` bodies because the edit form's initial state was seeded directly from the `CustomerOut` prop instead of picking only the editable fields — both fixes applied pre-emptively in `ShipmentFormModal` and `PackageFormModal`, so both passed on their first run (4 tests each). `Dashboard.test.tsx` caught the `isLoading`-vs-`data === undefined` bug described above — the empty-shipments-list test never resolved past a perpetual "Loading…" state until the gating logic was fixed. `CustomerManager.test.tsx` has a Copy-to-Clipboard test (`vi.spyOn(navigator.clipboard, 'writeText')` — jsdom 30 ships a real `Clipboard` stub, so replacing the whole object via `Object.defineProperty` silently fails; spying on its method is what actually works). `npm test`: 33/33 passing
- `orval.config.ts` + `src/api/generated/secure-ship.ts` — Orval installed and configured (`client: 'react-query'`, `httpClient: 'fetch'`, no axios dependency), generated against the backend's live `/openapi.json`; exports `useChat()` (mutation, from `POST /chat`), `useVerifyCode()` (from `POST /verify-code`), `useAdminMe()` (from `GET /admin/me`), `useListCustomers()`/`useCreateCustomer()`/`useUpdateCustomer()`/`useDeleteCustomer()`, `useListShipments()`/`useCreateShipment()`/`useUpdateShipment()`/`useDeleteShipment()`, and `useListPackages()`/`useCreatePackage()`/`useUpdatePackage()`/`useDeletePackage()` — all given explicit backend-side `operation_id`s for clean hook names — plus `ChatRequest`/`ChatResponse` (including `session_id`/`state`/`event`/`escalation`, the last the real `lines`/`agent_name`/`first_name` shape), `VerifyCodeRequest`/`VerifyCodeResponse`, `AdminMeResponse`, `CustomerCreate`/`CustomerUpdate`/`CustomerOut`/`ErrorDetail` types (the last a shared 409-conflict body shape, reused for the same delete-with-children pattern in Shipment CRUD), `ShipmentCreate`/`ShipmentUpdate`/`ShipmentOut` (the last including a denormalized `customer_name`; `ShipmentUpdate`'s fields all generated as optional, matching the backend's partial-update schema), and `PackageCreate`/`PackageUpdate`/`PackageOut` (the last including a denormalized `tracking_number`; `weight_kg`/`declared_value` typed `number | string` on the create/update side, a plain pattern-constrained `string` on the way out, same Decimal-via-OpenAPI quirk `ShipmentCard`'s mapper already works around). Regenerate manually via `npm run generate:api` whenever backend routes/models change — a running Docker backend needs to be stopped and restarted first, since a stale container will otherwise keep answering `/openapi.json` with the pre-change schema. `QueryClientProvider` wired up in `main.tsx`, inside a `BrowserRouter` + `Auth0ProviderWithNavigate`.
- `Dockerfile` — `node:24-slim`, runs `npm run dev -- --host 0.0.0.0` (dev-mode container, not a production build — matches how the project runs everywhere else right now)

**Root-level:** `docker-compose.yml` now brings up four services — `postgres`, `ollama`, `backend`, `frontend`. Container-to-host networking: the browser still talks to `localhost:5173`/`:8000` as before, since Docker Desktop maps those container ports back out. `postgres` has a `pg_isready` healthcheck; `backend` depends on it with `condition: service_healthy` and runs `alembic upgrade head` before `uvicorn` starts — a genuinely clean clone's `docker compose up` now creates all tables automatically, no manual migration step. Verified end-to-end against a fresh `pgdata` volume (`DEV_PLAN.md`'s Monday demo checklist, item 1). `backend.environment` holds `AUTH0_DOMAIN`/`AUTH0_AUDIENCE`, and a `frontend.environment` block holds `VITE_AUTH0_DOMAIN`/`VITE_AUTH0_CLIENT_ID`/`VITE_AUTH0_AUDIENCE` — needed since Vite only sees `VITE_`-prefixed vars present at container start and the frontend container has no bind mount to pick up a local `.env` otherwise. Ollama itself is containerized: an `ollama` service (`ollama/ollama:latest`, named `ollama_data` volume for model persistence) overrides its entrypoint to serve, poll until the server is actually accepting requests, then `ollama pull qwen3:8b` once (a no-op on a restart with an already-populated volume) before handing off to the server process — a fixed `sleep` before the pull was tried first and raced a slow first-boot server, so it's a poll loop instead. `backend.environment`'s `OLLAMA_HOST` changed from `http://host.docker.internal:11434` to `http://ollama:11434`, and `backend` now also `depends_on: ollama` with `condition: service_healthy` (healthcheck: `ollama list | grep -q qwen3`). No backend code changes were needed — `ollama_client.py` was already `OLLAMA_HOST`-env-driven. Live-verified: a real `POST /chat` round trip against the containerized model, both test suites still green (71 backend/55 frontend) afterward.

**Commands that work today (from `backend/`, with the venv active):**
- `uvicorn main:app --reload` — runs the API on `:8000`, see `/docs` for Swagger UI
- `alembic revision --autogenerate -m "..."` / `alembic upgrade head` — schema migrations
- `python llm/ollama_client.py` — standalone Ollama connectivity check
- `pytest` — runs `backend/tests/` (44 tests across 12 files); requires the dev Postgres to be up and migrated (`DATABASE_URL` in `.env`) and `AUTH0_DOMAIN`/`AUTH0_AUDIENCE` set in `.env` (`auth/dependencies.py` reads them at import time) — but never calls the real Ollama model or a real Auth0 endpoint; each test runs in its own rolled-back transaction, so nothing it writes persists

**Commands that work today (from `frontend/`):**
- `npm run dev` — runs the Vite dev server on `:5173`
- `npm run build` — type-checks (`tsc -b`) and produces a production build
- `npm run lint` — runs `oxlint`
- `npm run generate:api` — runs Orval against the backend's `/openapi.json` (backend must be running on `:8000`), regenerates `src/api/generated/secure-ship.ts`
- `npm test` — runs the Vitest suite once (`npm run test:watch` for watch mode); no backend/Postgres/Ollama/Auth0 needed — each file mocks only its own true external boundary (`global.fetch` for `CodeModal`, `useAuth0()` for `ProtectedRoute`)

**From the repo root:**
- `docker compose up -d` — brings up all four services (`postgres`, `ollama` on `:11434`, `backend` on `:8000`, `frontend` on `:5173`)
- `docker compose build backend frontend` — rebuild after dependency/Dockerfile changes
- `python scripts/seed_data.py` — (re-)seeds mock data into Postgres; safe to re-run, just adds more rows each time (no truncate/reset step yet).

**Full rebuild from scratch** (containers, images, the Postgres volume, and the Ollama model volume all deleted — e.g. proving the clean-clone path, or recovering from a stale image after a `Dockerfile` change):
- `docker compose down -v` — removes containers, network, the `pgdata` volume, and the `ollama_data` volume (a fresh `ollama_data` means `qwen3:8b` gets re-pulled from scratch on next `up`, a multi-GB download); add `--rmi local` to also drop the built `backend`/`frontend` images
- `docker compose up -d --build` — rebuilds images (`--build` is required if images were deleted or a `Dockerfile` changed since the last build; plain `up -d` silently reuses a stale image) and starts all four services; watch `docker compose logs ollama` for the model pull and `docker compose logs backend` for the `alembic upgrade head` migration lines — `backend` won't actually start until `ollama`'s healthcheck (`ollama list | grep -q qwen3`) passes, so the first `up` here takes as long as the model pull does
- `curl http://localhost:8000/health` — should return `{"status":"ok"}`
- `cd backend && source .venv/Scripts/activate && python ../scripts/seed_data.py` — the fresh volume has no data until reseeded

`backend/tests/` covers session isolation, neutral-rejection wording, the full 2FA flow (lockout/match/expiry), the state-scoped tool allowlist, post-escalation gating while unverified, `lookup_shipments` scoping under adversarial pressure, admin auth/Customer/Shipment/Package CRUD (including the delete-with-children `409` and the admin-write→chat-read proof), and the Epic E4 admin/chat structural-separation proof — 44/44 passing. `frontend`'s Vitest suite covers `useChatSession`'s field-merging/normalization, `CodeModal`'s digit-input/lockout state machine, `ProtectedRoute`'s redirect logic, `CustomerManager`/`ShipmentManager`/`PackageManager`'s CRUD flows (including Copy to Clipboard), and `Dashboard`'s stat/loading-state derivation — 33/33 passing. Standing instruction: keep both suites updated as covered code changes, and add new tests for new logic, without waiting to be asked each time.

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
| Local model | `qwen3:8b` via Ollama — CPU-only on this machine. Runs as an `ollama` Compose service; `ollama serve` host-native still works identically for anyone running the backend outside Docker |
| Backend | FastAPI + Pydantic v2 + SQLAlchemy + Alembic + Uvicorn |
| Frontend | Vite + React + TypeScript |
| Styling | Global SCSS + BEM (`_variables.scss`, `_mixins.scss`) — no CSS Modules, no Tailwind |
| API types/client | Orval, generating React Query hooks from FastAPI's `/openapi.json` — **never hand-write fetch calls or duplicate TS types** |
| State management | React Query only (HTTP-only means no Zustand, despite REQUIREMENTS.md's WS-path guidance) |
| Admin auth | Auth0, built via Auth0's Agent Skills |
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

`backend/` and `frontend/` are both real and running (see "Project state" above); `scripts/` has a working seed script. This is the target shape everything has converged on — `backend/tools/` is the enforcement layer described above, and it's fully built (`verify_identity.py`, `send_verification_code.py`, `check_verification_code.py`, `lookup_shipments.py` all exist), and `frontend/src/api/generated/` is Orval output that should never be hand-edited.

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
