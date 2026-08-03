# Change Log

A running, plain-language log of what got built and why — meant to be read out loud at weekly demos, not parsed by a machine. Newest entries at the top. Each entry maps to a "Day" of work rather than a strict calendar date.

Full technical scope and week-by-week milestones live in `docs/DEV_PLAN.md` — this file is the "what actually happened" companion to that plan.

---

## 2026-08-03 — Week 3, Day 2: A verified visitor gets a real answer 📬

**Theme:** Chunk B — wiring yesterday's `lookup_shipments` tool into an actual chat turn. Before today the tool existed and was exposed to the model, but nothing in `routes/chat.py` knew what to do if the model actually called it.

- 🔌 `_dispatch_tool()` now handles `lookup_shipments` alongside `verify_identity` — calls the real tool (no arguments to even consider, since the schema has none) and returns its result. The tool-name allowlist check above it (Epic F2) applies exactly the same way it always has — nothing special-cased for the new tool.
- 🗣️ **Second model call, same shape as Week 2's identity `PARTIAL` follow-up:** once the real shipment data comes back, a second, tool-free `ollama_client.chat()` call phrases the actual reply. `services/prompting.py`'s `build_system_prompt()` grew a `shipment_data` parameter — the new `SHIPMENT_DATA_INSTRUCTIONS` block tells the model to answer only from the data it's given and never invent details or mention another customer's shipments. A new `_format_shipments()` helper turns the tool's `ShipmentInfo` dataclasses into the plain-text block that goes into the prompt.
- 💬 Console log line on every call, console-only per the no-PII-in-logs rule: `[TOOL CALL] lookup_shipments customer_id=<uuid> shipment_count=<n>` — exactly the scoping decision (whose data, how much of it) that Epic F3 needs to be demoable live, not just true in the code.
- 🔒 **The enforcement line itself got an explicit inline comment today** (on top of yesterday's docstring), directly on `db.query(Shipment).filter(Shipment.customer_id == session.customer_id)` in `tools/lookup_shipments.py` — the exact line to scroll to at the demo, no docstring-reading required.
- ✅ **Verified live**, against the real running `qwen3:8b` and real seeded Postgres (rebuilt the Docker backend first, since it has no bind mount): inserted a real `Verified` `ChatSession` row for seeded customer Sergei Petrov, asked "Where is my package?" through the actual `POST /chat` endpoint, and got back all 3 of his real shipments — correct tracking numbers, carriers, statuses, and contents, nothing invented. The terminal showed `[TOOL CALL] lookup_shipments customer_id=11ab8fad-7b0d-4156-bf48-c5fe5ed23708 shipment_count=3` right alongside it. `pytest backend/tests` stayed 12/12 throughout.

**Where things stand:** a verified visitor can now ask a real question and get a real, data-backed answer — the core of Week 3's goal. Still only reachable via curl/direct DB insert, not the browser (Chunk C), and the enforcement point hasn't been attacked on purpose yet (Chunk D). Next: Chunk C, real shipment data in the frontend.

---

## 2026-08-03 — Week 3, Day 1: The shipment-lookup tool exists, but nobody's calling it yet 📦

**Theme:** Chunk A of Week 3's 5-chunk plan (A–E, one per weekday) — backend-only groundwork. `lookup_shipments` now exists and is exposed to the model as a real tool definition once a session is `Verified`, but `routes/chat.py`'s dispatch logic doesn't call it yet — that's Chunk B, tomorrow.

- 🔒 **The single enforcement point (Epic F3), written down on day one:** `tools/lookup_shipments.py`'s `lookup_shipments(db, session)` takes exactly two parameters — no `customer_id`, no tracking number, nothing a caller could use to name a different customer. The query scopes to `session.customer_id` only, the same column `check_verification_code.py` is the only place that ever sets. The tool's own schema (`LOOKUP_SHIPMENTS_TOOL_SCHEMA` in `tools/schemas.py`) mirrors this at the model layer: its `parameters` object is empty, not just missing a `required` list like `verify_identity`'s — there's nothing there for the model to fill in, let alone smuggle a foreign id into.
- 🗂️ Returns plain `ShipmentInfo`/`PackageInfo` dataclasses (tracking number, carrier, origin/destination, status, dates, nested package list) rather than raw ORM rows — one query per shipment for its packages, kept simple since the mock dataset is small.
- 🚦 `routes/chat.py`'s `_tools_for_state()` now returns `[LOOKUP_SHIPMENTS_TOOL_SCHEMA]` for `Verified` sessions (alongside the existing `Anonymous`/`CollectingIdentity` → `verify_identity` mapping) — `_dispatch_tool()` itself doesn't handle the name yet, so a live tool call would currently just fall through to the model's own prose. That wiring is Chunk B.
- ✅ **Verified, unit-level, against the real seeded DB:** two different verified customers (Sergei Petrov — 3 shipments; Jovana Markovic — 1 shipment) produced two different, correctly-scoped result sets. `inspect.signature(lookup_shipments)` confirmed directly that `(db, session)` are the only parameters — no identifier argument exists to attack. `pytest backend/tests` stayed 12/12 after the `_tools_for_state()` change.

**Where things stand:** the tool and its enforcement line exist and are provably scoped, but nothing in a real conversation calls them yet. Next: Chunk B — wire `lookup_shipments` into the actual chat turn, add the natural-language answer pass, and log the scoping decision to the terminal.

---

## 2026-07-30 — Week 2, Day 4: The frontend gets its own test suite too 🧪

**Theme:** a follow-on to Chunk I, not a lettered chunk of its own — backend just got a real `pytest` suite, and the obvious next question was whether the frontend should have equivalent coverage. Scoped deliberately narrow: the two places with real logic (a hook that merges response fields, a modal with a real state machine), not `ChatWindow`'s JSX layout or anything CSS/visual.

- 🧪 Installed **Vitest** (not Jest) — it reuses the project's existing Vite config/transform pipeline directly (`vitest.config.ts` = `mergeConfig(viteConfig, {...})`), so there's no second ts-jest/babel/jsdom setup to maintain alongside Vite's own. Plus `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`. `test.globals: true` in `vitest.config.ts` — the standard, well-documented Vitest+Testing-Library pairing, and the thing that makes Testing Library's automatic post-test cleanup actually register. `tsconfig.app.json`'s `types` array grew `vitest/globals` and `@testing-library/jest-dom/vitest` so `describe`/`it`/`expect(...).toBeInTheDocument()` type-check without per-file imports. New `npm test` (`vitest run`) / `npm run test:watch` (`vitest`) scripts.
- 🪝 New `src/hooks/useChatSession.test.ts` (co-located with the hook, per this project's own component-co-location convention) — 4 tests: initial state is all-unset, `applyResponse` copies all four `ChatResponse` fields through, a later turn's `null`s actually clear out a previous escalation rather than getting merged/ignored, and a response with `event`/`escalation` simply *absent* (not explicitly `null` — both legal on the wire) still normalizes to `null`, not `undefined`, matching the hook's own `?? null` intent.
- 🔢 New `src/components/CodeModal/CodeModal.test.tsx` — 6 tests: digit auto-advance actually moves focus box-to-box (not just "the value updates"), Verify stays disabled until all 6 boxes are filled, a wrong code shows the backend's exact `reply` text + `attempts_remaining`, clears the boxes, and refocuses box 1; a `state !== "awaiting_code"` response (lockout/expiry) disables every digit input and the Verify button; a correct code calls `onVerified` with the backend's reply and the dialog unmounts; Escape dismisses with **zero** network calls (asserted directly against the fetch mock, not inferred).
- 🎯 **Mocking boundary, deliberately mirroring Chunk I's backend approach:** only `global.fetch` is mocked (the actual network I/O `useVerifyCode()`'s generated client calls) — React Query and `CodeModal`'s own state (`digits`/`locked`/`feedback`/`attemptsRemaining`) all run for real. Same principle as `test_escalation_no_leak.py` mocking `ollama_client.chat` but keeping the real Postgres transaction: mock the actual external edge, not the code being tested.
- ✅ `npm test` — 10/10 passing. `npm run build` (`tsc -b` + `vite build`) stays clean with the new `.test.ts(x)` files present — they type-check under the same strict `tsconfig.app.json` as the rest of `src/`, but Rollup never bundles them since nothing in the real app imports a test file. `npm run lint` (oxlint) clean.
- 📝 **Standing instruction going forward, noted for future chunks too:** watch for changes that touch anything these tests cover (`routes/chat.py`/`tools/`/`services/` on the backend; `useChatSession.ts`/`CodeModal.tsx` on the frontend) and update the relevant tests — or add new ones for genuinely new logic — as part of that same change, not as a separate ask each time.

**Where things stand:** both halves of the stack now have a real, automated regression net for their actual logic (not just live-verified-once-by-hand) — `pytest backend/tests` (12/12) and `npm test` in `frontend/` (10/10). Next: Week 3, `lookup_shipments` and the single server-side enforcement point for real shipment data.

---

## 2026-07-30 — Week 2, Day 4: A real test suite, and Week 2's own decisions get pinned down ✅

**Theme:** Chunk I — tests, hardening, docs. Closes out the week: every gating/2FA/escalation behavior built across Chunks A–H has been verified live by hand at some point, but nothing ran automatically until today. This chunk's tests deliberately target the *decisions*, not just the happy path — several were made on the fly in earlier chunks and never had anything holding them in place besides a changelog entry.

- 🧪 New `backend/tests/` (`pytest.ini` with `pythonpath = .`, so imports work regardless of cwd) — 12 tests across 5 files, all run against the **real dev Postgres** (`DATABASE_URL` from `backend/.env`), not a second SQLite test database. `conftest.py`'s `db_session` fixture opens a connection, begins a transaction, binds a `Session` to it, and rolls the transaction back on teardown — every test's writes vanish on their own, no truncate step, no separate test DB to provision, consistent with `DEV_PLAN.md`'s Postgres-only decision. Confirmed by hand: `customers`/`chat_sessions` row counts in the real dev DB were identical before and after two full test runs.
- 🔒 An `autouse` fixture clears `services.verification_store._store` (the 2FA code dict) before and after every test — it's module-level, process-lifetime state that lives *outside* any DB transaction, so it's the one piece of global state a rollback alone wouldn't reset.
- 📋 What each file actually pins down: `test_session_identity.py` — two sessions created with no `session_id` get distinct UUIDs, an existing `session_id` resumes that exact row, and `pending_identity` set on one session is never visible from another (Chunk A's whole point). `test_identity_neutral_message.py` — mismatching just the first name, just the last name, just the phone, or just the address all return the identical `REJECTED` status (and the fixed `NEUTRAL_IDENTITY_MESSAGE` string is pinned verbatim), plus a positive control that a correctly-cased-differently match still succeeds. `test_verification_flow.py` — 3 wrong codes locks out with `attempts_remaining` counting 2 → 1 → 0, a correct code verifies and clears all pending state, and an *expired* code is rejected even when it's the right code, using a monkeypatched `datetime.now` inside `tools/check_verification_code.py` rather than mutating the stored `expires_at` directly, so the real comparison logic is what's actually under test. `test_tool_allowlist.py` — a hallucinated tool name is dropped, `verify_identity` is allowed while `CollectingIdentity`, and — the sharper case — that same real tool is rejected once a session is `EscalatedToHuman`, proving the allowlist is state-scoped, not just name-matched. `test_escalation_no_leak.py` — escalating from `Anonymous`, then asking about a shipment while still unverified, mocks `ollama_client.chat` to capture what it was actually called with (never a real Ollama call — the enforcement being tested is structural) and asserts no tool was offered, `customer_id` stayed `None`, and the unverified-escalation prompt addendum was actually present in the system message sent.
- 🗂️ **Decisions this chunk's tests now hold in place, each first made in an earlier chunk and only ever documented in prose before today:** `ollama_client.chat()` returning a `ChatCompletionResult(content, tool_calls)` dataclass instead of a bare string (Chunk B) — `test_escalation_no_leak.py`'s mock has to honor this exact shape to even compile, so the contract can't silently drift back to a plain string. The 2FA store being an ephemeral, in-memory dict rather than anything persisted to Postgres or a log file (Chunk D) — `test_verification_flow.py` reaches into `services/verification_store.get_pending()` directly specifically because that's the *only* place a code ever exists; there's nothing in the `chat_sessions` table to assert against instead, which is the point. The specific numbers, 300-second TTL and 3 max attempts (Chunk D, `CODE_TTL_SECONDS`/`MAX_ATTEMPTS`) — asserted directly rather than hardcoded a second time in the test (`test_verification_flow.py` imports `CODE_TTL_SECONDS` itself to build the monkeypatched future time), so the test can't quietly drift from the real constant. The in-memory-dict-not-Redis call (Chunk D, `DEV_PLAN.md`'s locked "no second datastore" decision) — this is exactly why `conftest.py` needs its own `_clear_verification_store` fixture at all; a Redis-backed store with per-test key namespacing wouldn't have needed one.
- ✅ **Manual walkthrough against the real running stack** (real `qwen3:8b`, real seeded customers), per this chunk's own "Done when": happy path — gave a real customer's full identity in one message, got matched, pulled the mock code from `docker compose logs backend`, verified it, reached `Verified`. Unhappy path 1 (rejected-then-retried) — gave a fully-specified but wrong address, got the exact neutral message, corrected just that field, matched. Unhappy path 2 (locked-out-then-restarted) — matched a third customer, sent 3 wrong codes to `/verify-code` (`attempts_remaining` 2 → 1 → 0, then `locked_out`), sent an ordinary next message with no identity retyped, confirmed the Chunk D fallback auto-sent a fresh code without being asked, and verified with that new code.
- 🐍 Added `pytest` (plus its own small dependency set — `iniconfig`, `packaging`, `pluggy`, `Pygments`) to `requirements.txt`. First new backend dependency since Week 1's original stack — a test runner, not a runtime one.

**Where things stand:** Week 2's identity/2FA/escalation gate is now backed by a real, green automated test suite (`pytest backend/tests`, 12/12 passing) in addition to every prior chunk's live manual verification — closing out the Monday demo checklist's remaining prerequisite. Next: Week 3, `lookup_shipments` and the single server-side enforcement point for real shipment data.

---

## 2026-07-30 — Week 2, Day 4: Melany finally shows up on screen 🎭

**Theme:** Chunk H — the frontend half of Chunk E's escalation theater. The backend has sent a real `EscalationPayload` since Chunk E; until today nothing rendered it.

- 🎬 New `src/components/EscalationBanner/EscalationBanner.tsx`: takes the `escalation` payload `ChatWindow` already receives and reveals its 4 lines one at a time (~700ms apart) — purely a client-side pacing effect over data the backend already sent in a single response, per Epic G3's "cosmetic only." Styled as `EscalationBanner.scss` (plain BEM), not the `.module.scss` the pasted spec named — same locked no-CSS-Modules deviation as Chunk G's `CodeModal`, documented the same way.
- 🟢 Color shift: a fixed index into `escalation.lines` (position 1, "Melany has entered the chat" — stable because the backend always builds this array from `ESCALATION_SCRIPT_LINES` in the same order) fires an `onHumanJoined` callback exactly once, guarded by a ref so React re-renders can't double-fire it. `ChatWindow.tsx` uses that to flip a `humanJoined` flag, toggling a new `chat-window--human-joined` class that fades the whole window to a soft mint green (`$color-human-joined-bg`/`$color-human-joined-border`, new tokens in `_variables.scss`) — a deliberately different color from the app's usual blue, so "a human joined" reads as its own kind of event.
- 🧩 `ChatMessageData`/`ChatRole` (`types.ts`) gained an `'escalation'` variant and an optional `escalation?: EscalationPayload` field — the same "optionally attach a variant" precedent `shipment?: ShipmentCardData` already set, rather than inventing a new message shape. `ChatMessage.tsx` renders `<EscalationBanner>` full-width in place of the normal bubble/avatar when that role is set.
- 🔌 `ChatWindow.tsx`'s `onSuccess` now branches on `event === "escalated"` before the generic bot-bubble push: destructures `escalation` off the response first (checking `response.data.escalation` inline tripped a TS control-flow narrowing error against the generated `EscalationPayload | null | undefined` type), pushes an `escalation`-role message carrying it, and returns early.
- ✅ Verified: `tsc -b`/`vite build`/`oxlint` all clean. Backend contract re-confirmed via direct `curl` (not just trusted from Chunk E) — escalating from a fresh session returns exactly 4 lines with "Melany has entered the chat" at index 1 and `first_name: null`; re-verified **Epic G4** by asking a shipment question in the same still-unverified, post-escalation session and getting a neutral identity request, not shipment data. The banner/color-shift CSS was screenshot-checked via a static HTML harness reusing the real compiled bundle (no interactive browser-automation tool available this session, same limitation as Chunks F/G). The actual timed reveal + color fade, in both directions — nameless greeting triggered from a from-scratch `Anonymous` session, and a personalized "Hey Jovana, ..." greeting after a full identity-verify round-trip with real seeded customer Jovana Markovic — was user-confirmed live in the browser.

**Where things stand:** every piece of Week 2's gating/escalation work now has a real frontend surface — no more curl/Swagger needed anywhere in the flow. Next: Chunks I–J, whichever the remaining 10-chunk split calls for.

---

## 2026-07-28 — Week 2, Day 3: The 2FA code gets an actual UI 🔢

**Theme:** Chunk G — the first real frontend surface for any of Week 2's gating work. Before today, the entire identity/2FA/escalation flow was only testable via curl/Swagger — now the code modal is real, on-demand, and wired to the actual `POST /verify-code` endpoint.

- 🔢 New `src/components/CodeModal/CodeModal.tsx`: a controlled component (`open`, `sessionId`, `onVerified`) with 6 individual digit inputs (regex-filtered to digits only, auto-advance focus forward on entry, backspace moves focus back, Enter submits) — no form library, matching the project's existing convention. Calls the generated `useVerifyCode()` mutation directly.
- 🎨 Styled to match `ai-chatbot-modal-mockup.png` (shield icon, centered card, digit boxes, Cancel/Verify Code buttons) — but built as `CodeModal.scss` with the project's normal BEM convention, not the `.module.scss` (CSS Modules) the pasted spec named, since `DEV_PLAN.md`'s locked styling decision already rules out CSS Modules project-wide. Added the one missing design token this needed, `$z-modal`, to `_variables.scss`.
- 🔁 **Design decision, reasoned through rather than found live:** `ChatWindow.tsx` renders `<CodeModal key={codeModalKey} open={sessionEvent === 'code_sent'} .../>`, where `codeModalKey` is a plain counter bumped every time a response's `event` is `"code_sent"`. This matters because the hook's `event` field doesn't reset itself between chat turns — after a 2FA lockout reverts to `CollectingIdentity` and the backend's Chunk D fallback auto-resends a fresh code, the new response's `event` is the *same string value* (`"code_sent"`) as before, which React would otherwise treat as unchanged and never re-run any reset logic. Forcing a fresh `key` guarantees `CodeModal` fully remounts (clean digits, cleared dismissed/verified/locked flags) on every genuinely new code, not just the first one.
- 🔒 Wrong-code handling shows the exact `attempts_remaining` count from the backend's response inline (no client-side guess at "how many attempts are allowed" before a real attempt has been made, since the backend doesn't expose `MAX_ATTEMPTS` proactively — showing a hardcoded starting number risked silently drifting from the real constant in `services/verification_store.py`). A generic `data.state !== "awaiting_code"` check (rather than string-matching the reply text) detects both `LOCKED_OUT` and `EXPIRED` the same way, disabling further input and leaving Cancel as the only way out — deliberately reusing Chunk D's own state transition instead of re-deriving the same logic client-side.
- 🚪 Dismissible via Escape or a backdrop click, with no `onClose` prop — the "closed" state lives entirely inside `CodeModal` itself, and only clears when a fresh `code_sent` event triggers a remount. Confirmed live this has a real, if narrow, UX consequence: once dismissed, there's no manual "reopen" affordance — the modal only comes back on an actual new code being sent (e.g. after a lockout-triggered resend), not on demand.
- ✅ **User-verified live** (no browser-automation tool available this session, same as Chunk F): dismissing via Escape mid-flow closes the modal cleanly with the rest of the chat still fully responsive afterward; a full lockout-then-resend sequence (3 wrong codes typed directly into the modal, then an ordinary follow-up chat message) correctly triggered the backend's auto-resend fallback and the modal reopened fresh — confirming the `codeModalKey` remount fix actually works, not just in theory.

**Where things stand:** the 2FA half of the gate is now fully testable end-to-end through the browser alone — no more pairing curl/Swagger with the UI. Escalation still has zero UI surface (Chunk H). Next: Chunk H, or whichever the 5-day split calls for.

---

## 2026-07-28 — Week 2, Day 3: Session state moves into its own hook 🪝

**Theme:** Chunk F — frontend session plumbing. No new behavior, just getting `sessionId`/`state`/`event`/`escalation` out of `ChatWindow.tsx`'s own `useState` calls and into a dedicated hook, so later chunks (the code modal, the escalation banner) have somewhere to read those fields from without `ChatWindow` growing further.

- 🪝 New `src/hooks/useChatSession.ts` — a small hook, not a global store (consistent with the project's existing no-context/no-reducer convention: React Query is the only shared state manager this project uses). Holds `sessionId`/`state`/`event`/`escalation` and exposes one `applyResponse(response: ChatResponse)` function that pulls all four out of a real backend response in one call.
- 🔌 `ChatWindow.tsx` swapped its own `const [sessionId, setSessionId] = useState<string>()` for `const { sessionId, applyResponse } = useChatSession()`, and its `onSuccess` handler now calls `applyResponse(response.data)` instead of `setSessionId(response.data.session_id)` directly. Purely a relocation — the request/response wiring (`session_id` sent on every request, read back from every response) behaves identically to Chunk A, just owned by the hook instead of the component.
- 🧪 **Verification note, different from earlier chunks:** no browser-automation tool was available this session, so — unlike Chunks A/B/C's headless-Playwright-script verification — the actual two-tab, cross-session-isolation check was driven manually by the user rather than by an automated script. Backend-level distinctness (`POST /chat` with no `session_id` from two independent calls → two different UUIDs) was re-confirmed directly as a sanity check first, since that's the piece Chunk F's refactor could theoretically have broken if the hook were built wrong.
- ✅ User-confirmed live: two real seeded identities (Viktor Ivanov, Jovana Markovic) in two separate browser tabs each matched, got their *own* mock 2FA code, and never saw or referenced the other tab's name/session — full cross-tab isolation holds. "New Chat" mid-conversation issues a fresh `session_id` rather than resuming the old one, confirmed to be intentional (re-verification is required per-session by design, not a bug to fix).

**Where things stand:** the frontend's session/event/escalation state now lives in one reusable spot instead of scattered `useState` calls — nothing renders `event`/`escalation` yet (still text-only replies), but the plumbing is ready for the code modal (Chunk G) and escalation banner (Chunk H) to consume it. Next: Chunk G or H, whichever the 5-day split calls for.

---

## 2026-07-28 — Week 2, Day 3: A fake human named Melany shows up 🎭

**Theme:** Chunk E — human-escalation theater. Purely cosmetic per Epic G, but the identity gate has to keep holding underneath it.

- 🗣️ New `services/escalation.py`: `wants_escalation(message)`, a plain substring check against a small set of phrases ("talk to a human", "speak to a person", etc.) — evaluated before any Ollama call, same philosophy as Chunk C's `_mentions_shipment()`: a state transition this important shouldn't depend on whether the model feels like recognizing the intent this turn.
- 🎬 `routes/chat.py` gained `_handle_escalation()`: short-circuits at the very top of `send_chat_message` (right after the user's turn is appended to the transcript, before any Ollama call) whenever `wants_escalation()` fires and the session isn't already `EscalatedToHuman`. Builds the 3 actual scripted lines from §6.2b ("Thank you for your patience...", "Melany has entered the chat", "Hello, my name is Melany...") plus a 4th, personalized greeting line — the diagram's "chat window changes color" step is a 5th *state*, not a 5th line of text, so it's left as a frontend-only visual cue for Chunk H, not something the backend emits as a string.
- 🪪 The greeting's `first_name` is resolved by `_resolve_known_first_name()` — pulled only from `session.pending_identity` or a `Customer` row via `session.customer_id`, never from the escalation-triggering message itself. This is the concrete code-level enforcement of Epic G4: "Melany" can't be talked into anything, because nothing about her greeting is attacker-controlled.
- 🔒 **Found live, not in review:** with no tool offered in `EscalatedToHuman` (correctly — `_tools_for_state()` already excluded it), a shipment question asked right after escalating while still unverified couldn't leak real data, but it *sounded* wrong — the model cheerfully asked for a tracking number and promised to "check right away," instead of the neutral decline Epic A3/G4 calls for. Fixed with a new `build_system_prompt(unverified_escalation=...)` addendum in `services/prompting.py`, applied whenever a session is `EscalatedToHuman` with no confirmed `customer_id` — tells the model explicitly that the visitor still isn't verified even though "a human" has joined. This is prompt-only, not enforcement (the real enforcement is still that no data-lookup tool exists for this state) but it closes the UX gap the acceptance criteria actually asked for.
- ✅ Verified against the real running `qwen3:8b`: escalating from a fresh `Anonymous` session returns all 4 scripted lines plus a generic "Hey, I'm up to speed" greeting, `agent_name: "Melany"`, `event: "escalated"`; escalating mid-identity-collection (after giving a first name) returns the same sequence with "Hey Viktor, I'm up to speed..."; asking about a package status in the same still-unverified session immediately after escalating gets a reply that explicitly asks to verify identity first rather than proceeding — confirming "Melany" isn't a gate bypass. Rebuilt the Docker backend for both the initial implementation and the prompt fix.
- 🔄 **Cutover:** with `ChatResponse`/`VerifyCodeResponse` now final for Week 2, ran `npm run generate:api` once more — `src/api/generated/secure-ship.ts`'s `EscalationPayload` picked up Chunk E's real `lines`/`agent_name`/`first_name` shape (replacing Chunk A's `human_name`/`greeting` placeholder). `useChat`/`useVerifyCode` themselves were untouched (already regenerated in Chunk D); only the one interface changed. `npm run build` clean.

**Where things stand:** the identity gate, 2FA, and escalation theater are all real end-to-end via the API, and the frontend's generated API client is fully caught up with the final backend shapes — still zero frontend *UI* surface for any of it (no code modal, no escalation banner/color-shift). Next: Chunk F onward, or whichever the 5-day split calls for.

---

## 2026-07-28 — Week 2, Day 2: A real (mocked) 2FA code, end to end 🔐

**Theme:** Chunk D — the identity match from yesterday now actually sends a code, and there's a real endpoint to check it against. `MATCHED` is no longer a placeholder.

- 🗄️ New `services/verification_store.py`: a plain in-memory dict (module-level, single-process — no Redis, per `DEV_PLAN.md`'s locked decision), keyed by `session_id`, holding a `PendingVerification(code, customer_id, expires_at, attempts)`. Codes never touch a persistent log file or Postgres — they exist only for the life of the backend process. **300-second TTL, 3 max attempts** — the specific numbers `DEV_PLAN.md` asked to be picked and documented.
- 📱 New `tools/send_verification_code.py`: generates a 6-digit code via `secrets.randbelow` (not `random` — this is the one place in the app that needs a cryptographically unpredictable value), prints a `[MOCK SMS]` line to console as the "send" (console output during dev is explicitly fine per the no-PII-in-logs rule — it's persistent *files* that are off-limits), stores it, and moves the session straight to `AwaitingCode`. `routes/chat.py`'s `MATCHED` branch now calls this for real and returns `event="code_sent"` instead of yesterday's placeholder reply.
- ✅ New `tools/check_verification_code.py`: `MATCH` promotes `pending_customer_id` → the real `customer_id`, sets `Verified`, and clears both the in-memory store entry and the now-obsolete `pending_identity` scratch data. `MISMATCH` counts up; the **3rd wrong attempt is a deliberate lockout** — no silent auto-regenerate — clearing the code and reverting to `CollectingIdentity` (fields retained, so the visitor isn't asked to retype anything). `EXPIRED` (checked directly, not waiting out a real 5 minutes) reverts the same way, for the same reason: no endpoint here should be the one quietly minting a fresh code.
- 🔌 New `POST /verify-code` (`routes/verify.py`), mounted in `main.py`; 404s cleanly on an unknown/malformed `session_id` rather than 500ing. Orval regenerated — `useVerifyCode()` and the `VerifyCodeRequest`/`VerifyCodeResponse` types are now live in `src/api/generated/secure-ship.ts` (no frontend component wired to it yet — that's Chunk G's `CodeModal`).
- 🐛 **Found live, not in review:** after a lockout reverts a session to `CollectingIdentity` with every identity field already known, the model has nothing new to report and simply won't re-call `verify_identity` on its own — so nothing re-sent a code, despite the whole point of "retaining fields" being that the visitor shouldn't have to start over. Fixed with the same kind of deterministic backend fallback as Chunk C's `_mentions_shipment()`: if a session is `CollectingIdentity` with all four fields already present and the model didn't call the tool this turn, `routes/chat.py` calls `verify_identity()` itself. Safe by construction, not just by convention — `CollectingIdentity` only exists once any earlier verification-store entry has already been cleared, so this can never stomp on a code the visitor is mid-way through entering.
- ✅ Verified against the real running `qwen3:8b` and a real seeded customer: full match → console code → `POST /verify-code` with the right code → `Verified`, with `chat_sessions.customer_id` set and `pending_customer_id`/`pending_identity` both cleared in Postgres. 3 wrong codes → `locked_out`, reverts to `CollectingIdentity`. The very next message (no identity retyped) auto-recovers and sends a *fresh* code via the new fallback — confirmed by reading the new code off the console and completing verification with it. Also unit-tested `EXPIRED` directly (manually backdating a stored code's `expires_at`) and a 404 on a nonexistent `session_id`. Rebuilt the Docker backend and re-confirmed both routes live in `/openapi.json`; regenerated and rebuilt the frontend (`npm run build` clean) against the new schema.

**Where things stand:** the full identity → 2FA → verified gate now works end to end via the API, with no frontend surface for it yet (no modal, no escalation). Next: Chunk E — escalation theater's backend half.

---

## 2026-07-27 — Week 2, Day 1: The bot starts actually asking who you are 🪪

**Theme:** Chunk C — the first slice of Week 2 with real conversational logic in it: a visitor gets asked for their identity, gives it in whatever order/grouping they like, and gets matched (or neutrally rejected) against the seeded `Customer` table.

- 🧩 New `tools/verify_identity.py`: `verify_identity(db, session, first_name, last_name, phone_number, address)` merges whatever fields were just given into `session.pending_identity` (all four are optional — partial extraction is legal, Epic B2) and only attempts a `Customer` match once all four are present. Match is case-insensitive on all four fields — a real visitor is more likely to mistype casing than genuinely provide the wrong data. Returns `PARTIAL` / `REJECTED` / `MATCHED(customer_id)`; this is the only place in the codebase that reads `Customer` rows or writes `pending_identity` — the model itself never sees or supplies a `customer_id`.
- 🔌 `routes/chat.py` grew real orchestration: `_tools_for_state()` only offers `verify_identity` while a session is `Anonymous`/`CollectingIdentity`; `_dispatch_tool()` re-checks the tool name the model actually called against that same allowlist before running anything — a hallucinated or prompt-injected tool name (or a name with extra/unexpected arguments tacked on, like a stray `customer_id`) is silently dropped rather than crashing or being trusted (Epic F2 groundwork).
- 🎭 On `REJECTED`, the neutral message ("We couldn't verify that information — could you double check and try again?") is returned directly, with no second model call — wording is guaranteed regardless of what the model would've said (Epic B3/A3). On `PARTIAL`, a second `ollama_client.chat()` call (no tools this time) phrases the natural follow-up asking for whichever fields are still missing. On `MATCHED`, today's reply is a placeholder ("hold on while I verify it's really you") — Chunk D replaces this branch with an actual `send_verification_code()` call.
- 🐛 **Found live, not in review:** the model reliably calls `verify_identity` once it has *something* to report, but — reasonably — won't call it with zero arguments just to "start" the flow. That meant the very first message of a conversation (e.g. "I want to check my shipment," no identity given yet) left the session stuck in `Anonymous` instead of flipping to `CollectingIdentity`, contradicting the plan's own acceptance criterion. Fixed with a plain keyword check (`_mentions_shipment()`) — deliberately *not* another model call, same reasoning as Chunk E's escalation-intent design: don't make a state transition depend on model whim when a dumb heuristic is just as good and fully deterministic. It only decides whether a session leaves `Anonymous`; the actual identity match stays entirely tool/backend-enforced.
- 🔧 Small correction to Chunk B's own shape along the way: `ollama_client.ChatCompletionResult.tool_calls` is now a proper `list[ToolCall]` (a small dataclass with `.name`/`.arguments`) instead of raw dicts, and `VERIFY_IDENTITY_TOOL_SCHEMA`'s four fields are no longer marked `"required"` in the JSON Schema — they need to be *individually* optional for partial, multi-turn extraction to be legal at the schema level, not just in application logic.
- ✅ Verified against the real running `qwen3:8b` (not mocked): a fresh session asking about a shipment with zero identity now flips to `CollectingIdentity` immediately; giving only a first/last name keeps it `CollectingIdentity` and gets a natural "great to meet you, could you also share your phone number and address" follow-up that correctly remembers the name already given; a fully-specified but non-matching identity gets the exact neutral message and stays `CollectingIdentity`; correcting just the wrong field afterward reaches `MATCHED`. Also unit-tested `verify_identity()` directly against the seeded DB (PARTIAL/REJECTED/MATCHED/case-insensitivity) and `_dispatch_tool()` against a hallucinated tool name and an injected extra argument, both rejected/ignored without crashing. Ordinary small talk ("how are you today?") confirmed to leave state untouched.

**Where things stand:** a visitor can now be conversationally identified and matched against real customer records, with a neutral failure path and hardened tool dispatch. Still missing: the actual 2FA send/verify (today's `MATCHED` branch is a placeholder), and escalation. Next: Chunk D — the verification-code store and `/verify-code` endpoint.

---

## 2026-07-27 — Week 2, Day 1: Tool-calling plumbing goes into the LLM layer 🔧

**Theme:** Chunk B — no real tool execution yet, just the contract the identity-gate tools (starting with `verify_identity`) will run on top of.

- 🔧 `ollama_client.chat()` no longer returns a bare string — it returns a `ChatCompletionResult` dataclass (`content`, `tool_calls`), so a future caller can branch on whether the model asked to call a tool instead of just replying in prose.
- 🧾 New `tools/schemas.py` — `VERIFY_IDENTITY_TOOL_SCHEMA`, an OpenAI-style function-calling schema for `verify_identity(first_name, last_name, phone_number, address)`, matching `Customer`'s columns exactly. This only defines what the model is *told* it can call — nothing invokes it yet, that's the enforcement layer still to come.
- 💬 New `services/prompting.py` — `build_system_prompt(known_identity)` appends any identity fields already collected (read from the `pending_identity` column added yesterday) onto the base system prompt, so the model won't ask a visitor to repeat themselves once real extraction starts populating that column. Currently a no-op in practice, since nothing writes to `pending_identity` yet.
- 🔌 `routes/chat.py` updated to match both changes: reads `.content` off the new return type, and builds its system prompt via `build_system_prompt(session.pending_identity)` instead of a hardcoded constant.
- ✅ Verified directly: a real call to the running Ollama server confirmed `chat()` now returns a proper `ChatCompletionResult`; `build_system_prompt` checked by hand against empty/`None`/populated identity dicts; rebuilt the backend container and re-confirmed `/chat` still round-trips end-to-end afterward.

**Where things stand:** the model-facing tool-calling contract exists, but nothing calls `verify_identity` yet and no identity extraction populates `pending_identity`. Next: conversational identity collection/extraction and actually wiring the `verify_identity` tool + neutral-failure messaging (Epic B).

---

## 2026-07-27 — Week 2, Day 1: Chat sessions stop being shared globally 🪪

**Theme:** Chunk A — the first Week 2 slice, fixing a Week 1 shortcut before building the identity gate on top of it.

- 🪪 **The bug:** `_get_or_create_session()` picked "whichever `ChatSession` row is still open," full stop — every caller, in every browser tab, shared the exact same session. Fixed: `ChatRequest.session_id` (nullable) now round-trips between frontend and backend; the lookup is by primary key when a `session_id` is given (and still open), otherwise a fresh row is created and its id echoed back in `ChatResponse.session_id`.
- 📦 Pulled `ChatRequest`/`ChatResponse` out of their inline definitions in `routes/chat.py` into a new `schemas/chat.py` (plus a stub `EscalationPayload` field for a later escalation-theater chunk), and added `schemas/verify.py` with `VerifyCodeRequest`/`VerifyCodeResponse` ahead of the future code-verification endpoint.
- 🗄️ `ChatSession` grows two nullable columns: `pending_customer_id` (FK → `customers.id`) and `pending_identity` (JSONB) — a place to hold identity fields collected mid-conversation before a customer match is confirmed. New Alembic migration, applied cleanly against the existing dev database.
- 🖥️ Frontend follow-on that turned out to be required, not optional: with the old "most recent session" fallback gone, `ChatWindow` had to actually track its own `session_id`, or every single message would've silently become its own new session. It now stores the `session_id` the backend returns and sends it back on every subsequent turn.
- ✅ Verified with real requests: two callers with no `session_id` land in two distinct sessions; passing a returned `session_id` back resumes that exact row, with its `transcript` correctly accumulating turns rather than starting over — confirmed both via the API responses and a direct look at the `chat_sessions` table.

**Where things stand:** chat sessions are genuinely per-client now, and there's somewhere to put identity fields as they're collected. Next: the tool-calling plumbing (Chunk B, below) and then real conversational identity extraction feeding `pending_identity`.

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
