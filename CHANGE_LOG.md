# Change Log

This is a running, plain-language log of what got built and why — meant to be read out loud at weekly demos, not parsed by a machine. Newest entries at the top. Each entry maps to a "Day" of work rather than a strict calendar date, since some days cover more ground than others.

Full technical scope and week-by-week milestones live in `docs/DEV_PLAN.md` — this file is the "what actually happened" companion to that plan.

---

## 2026-07-23 — Week 1, Day 1: Kickoff and reference diagrams

**What this day was about:** getting the project's paperwork in order before writing any real backend/frontend code — making sure we have a clear, dependency-ordered plan for Week 1 and a documented starting point to build against.

- Reviewed `DEV_PLAN.md`'s Week 1 goal ("a real conversation end-to-end with zero security") and broke it down into a concrete, ordered list of 8 build checkpoints for today, so the day has natural stopping points instead of one big undifferentiated task.
- Confirmed where we're actually starting from: `frontend/`, `backend/`, and `scripts/` folders already exist but are empty — nothing's been built yet, so today is a true from-scratch start.
- Copied the project's original architecture diagrams (system architecture, the identity-verification state machine, the human-escalation flow, the tool-calling sequence, the data model, and the deployment layout) into `docs/diagrams/` as our "before" reference. These are AI-drafted starting points, not final — we'll redraw them in Week 5 to match what we actually built, and it'll be a good "here's what changed from the plan" moment at the final demo.

**Where things stand:** no application code yet — this was groundwork. Next up is standing up a bare-bones backend server and getting it talking to the local AI model, with nothing smart happening yet (that's deliberate — Week 1's whole point is proving the plumbing works before adding any security gate).
