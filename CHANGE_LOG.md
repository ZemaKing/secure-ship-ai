# Change Log

A running, plain-language log of what got built and why — meant to be read out loud at weekly demos, not parsed by a machine. Newest entries at the top. Each entry maps to a "Day" of work rather than a strict calendar date.

Full technical scope and week-by-week milestones live in `docs/DEV_PLAN.md` — this file is the "what actually happened" companion to that plan.

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
