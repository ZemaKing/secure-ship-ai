# PII / logging audit — Week 5

`docs/REQUIREMENTS.md` §4.3 and `CLAUDE.md`'s non-negotiable invariants both state the
same rule: **no PII in persistent logs** — console output during dev is fine; nothing
with mocked name/address/phone/2FA-code should land in a file on disk. This has been
asserted throughout the build (see `TECH_NOTES.md`'s notes on `send_verification_code.py`),
but never systematically checked end to end. This is that pass — every place output
could conceivably reach disk, checked directly against the code, not re-asserted from
memory.

## What's being defended

The mock 2FA flow generates a real secret (the 6-digit code) and handles real-shaped PII
(name, phone, address) on every identity-collection turn. The rule isn't "never print
this" — the console-only mock-SMS print is a deliberate, load-bearing part of the demo
(REQUIREMENTS.md §8 explicitly asks for the tool call to be visible in terminal logs
during a demo). The rule is narrower and more specific: none of it should survive to a
**file on disk** once the terminal scrolls past it.

## Inventory — every place output could reach disk

**1. Backend `print()` statements — the only three in the codebase:**

| Location | Content | Verdict |
|---|---|---|
| `tools/send_verification_code.py:19` | `[MOCK SMS] To {phone_number}: your SecureShip verification code is {code}` | Console only, by design (§8's demo requirement) — see the Docker caveat below |
| `routes/chat.py:197` | `[TOOL CALL] lookup_shipments customer_id={...} shipment_count={...}` | A UUID, not name/phone/address — lower-sensitivity, still console-only |
| `llm/ollama_client.py:57` | Model's answer to a hardcoded dev-only smoke-test question | No PII, never runs as part of the app itself (`python llm/ollama_client.py` only) |

No other `print`, `logging.info/debug/warning`, or `logger.*` call exists anywhere in
`backend/` outside these three and the standard library/dependency code in `.venv/`.

**2. `alembic/env.py`'s logging config** — `alembic.ini`'s `[handler_console]` is a plain
`StreamHandler(sys.stderr)`, not a `FileHandler`. Alembic's own migration-progress
logging (table names, revision ids — no application data, let alone PII) never touches
a file either.

**3. Uvicorn's access log** — enabled by default, but its format
(`%(client_addr)s - "%(request_line)s" %(status_code)s`) only logs the HTTP method, path,
and status code. `POST /chat`'s message and `POST /verify-code`'s code live in the
**request body**, not the URL — neither ever appears in an access-log line. Confirmed
against the installed `uvicorn` package's own log format, not assumed.

**4. `docker-compose.yml` / `Dockerfile`** — the container's `CMD` runs
`alembic upgrade head && uvicorn main:app ...` directly, with no `> file.log` redirection
or `--log-file` flag anywhere. Nothing in this repo configures a Docker logging driver
either, which leads to the one real nuance found in this pass:

> **Known, accepted trade-off — Docker's own log persistence.** When running via
> `docker compose up`, Docker's *default* `json-file` log driver persists a container's
> stdout/stderr to disk under Docker's own data directory (outside this repo, not
> `.gitignore`-relevant) — meaning the mock-SMS print (phone number + code) technically
> does reach a file, just not one this application writes itself. This has been true
> since the mock-SMS print was first added (Week 2) and was never flagged before this
> audit. The alternative — disabling container logging (`logging: driver: "none"` in
> `docker-compose.yml`) — would also silence the `[TOOL CALL] lookup_shipments ...` line
> that REQUIREMENTS.md §8 explicitly wants visible during a live demo (`docker compose
> logs backend`), so it isn't a clean fix; suppressing the print entirely would remove
> the demo's core "watch it happen live" gesture. Documented here as a known boundary of
> the "console output is fine" rule, not silently ignored — a real production deployment
> would want log-scrubbing or a shorter Docker log retention window, out of scope for
> this program.

**5. `ChatSession.transcript` (Postgres `JSONB`)** — this **is** intentional persisted
storage, not a log file the no-PII rule is aimed at (`REQUIREMENTS.md` §4.6 specifies it
by name as the chat-history mechanism). It does legitimately contain whatever a visitor
typed while giving their name/phone/address, since that's literally the conversation.
What was checked specifically: does the **2FA code itself** ever leak into it. It
doesn't — `CODE_SENT_MESSAGE` (`routes/chat.py`) is a fixed, generic string ("I just sent
a 6-digit verification code...") with no interpolation, and `/verify-code` is a separate
endpoint whose request/response never touches `transcript` at all. Pinned down by a new
automated test (below), not just read-and-assumed.

**6. Frontend** — zero `console.log`/`console.debug`/`console.warn`/`console.error` calls
anywhere in `frontend/src/` (checked directly, not just "wasn't noticed"). No error-
tracking or analytics SDK (Sentry, PostHog, Mixpanel, LogRocket, Datadog, etc.) is
installed anywhere in either `package.json` — nothing to exfiltrate PII to a third party
even accidentally.

**7. `.env` files** — `backend/.env`/`frontend/.env` (which hold Auth0 credentials, not
end-user PII) are `.gitignore`d (confirmed: lines 151–152), so they were never a PII
concern to begin with, just a secrets one, and already handled correctly.

## Automated backstop

New `backend/tests/test_pii_logging.py::test_the_2fa_code_never_lands_in_the_persisted_transcript`
— sends a message that matches identity and triggers a real code send, then asserts
neither the generated code nor the customer's phone number appears anywhere in
`session.transcript`'s persisted content. This is the same "don't just assert it, prove
it with a test" discipline `ADVERSARIAL_TESTING.md` established in Week 3.

```
pytest backend/tests/test_pii_logging.py
```

## Outcome

No code changes were required — every real print/log path was already console-only by
design, and the one genuine finding (Docker's own log-driver persistence) is a documented,
accepted trade-off rather than a bug, for the reasons above. The rule holds as stated
everywhere this application controls directly.
