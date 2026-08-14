---
name: orval-regen-suggestion
description: Use whenever backend/routes/*.py or backend/schemas/*.py have been created, edited, or deleted in this session — before ending the turn or handing back to the user. Checks whether the Orval-generated frontend API client (frontend/src/api/generated/secure-ship.ts) is now stale relative to those files, and if so, suggests (never runs) `npm run generate:api`. Also useful any time someone asks "do I need to regenerate the API client?" or "is the frontend API types out of date?".
---

# Orval regen suggestion

SecureShip's frontend never hand-writes fetch calls or duplicate TS types
(`CLAUDE.md`'s locked architecture decision) — `frontend/src/api/generated/secure-ship.ts`
is Orval output, regenerated from the backend's live `/openapi.json` via
`npm run generate:api`. That command is never run automatically anywhere in
this project (same "AI suggests, human confirms" pattern as never
auto-committing) — it needs the backend running with the new code, and the
regen diff itself deserves a human look before being trusted.

This skill's only job is to **notice** when the generated client is likely
stale and **say so** — never to run the regen itself.

## When to run the check

Any time this session has touched `backend/routes/*.py` or
`backend/schemas/*.py` (created, edited, or deleted), run the check below
before ending the turn.

## How to check staleness

Compare each changed route/schema file's last-touched point against the
generated client's, using whichever signal is available:

1. **Working tree changes** (most common mid-session case):
   ```
   git status --porcelain -- backend/routes backend/schemas frontend/src/api/generated/secure-ship.ts
   ```
   If `backend/routes/*.py` or `backend/schemas/*.py` show as modified/added/deleted
   but `secure-ship.ts` does *not* appear in the same output, the client is stale
   relative to uncommitted work.

2. **Committed history** (useful if the route/schema edit was already committed
   this session but the regen wasn't):
   ```
   git log -1 --format=%cI -- backend/routes backend/schemas
   git log -1 --format=%cI -- frontend/src/api/generated/secure-ship.ts
   ```
   If the routes/schemas timestamp is more recent than the generated file's,
   it's stale.

Only route/schema changes that plausibly affect the OpenAPI surface matter —
a docstring or internal-logic-only edit to a route function technically
touches the file but won't change `/openapi.json`. Use judgment: changes to
request/response models, `Pydantic` fields, path/method signatures, or new/
removed routes are the kind that matter; a comment or a reordered import
isn't worth flagging.

## What to do when stale

Tell the user plainly, once, near the end of your turn — don't loop or
re-check repeatedly for the same unregenerated change:

> The backend's OpenAPI surface may have changed (`<files>`). The generated
> frontend client (`frontend/src/api/generated/secure-ship.ts`) might be out
> of date — run `npm run generate:api` (backend must be running on `:8000`)
> when you're ready to regenerate it.

Do **not**:
- Run `npm run generate:api` yourself.
- Start or restart the backend to make the regen possible.
- Block or refuse other work pending a regen — it's a suggestion, not a gate.

If the user declines or ignores the suggestion, don't repeat it again in the
same turn cycle — only re-surface it if further route/schema changes happen
afterward.
