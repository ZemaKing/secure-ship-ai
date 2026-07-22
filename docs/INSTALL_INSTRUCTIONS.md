# SecureShip — Install Instructions

Setup checklist for this solo Windows build, per `DEV_PLAN.md` §2. Split into two parts:

1. **Tools & apps** — install these once, now, before Week 1 starts.
2. **Project dependencies** — installed later via `npm`/`pip` once the repo is scaffolded (Week 1). Kept here as a reference so all install commands live in one place.

---

## 1. Tools & apps

### 1.1 Python

Download: https://www.python.org/downloads/ (3.13.x)

- Run the installer and check **"Add python.exe to PATH"** before clicking Install.

Verify:

```powershell
python --version
```

Expected: `Python 3.13.x`

---

### 1.2 Node.js (includes npm)

Download: https://nodejs.org/en/download (v24.x LTS)

- Run the installer with default options (npm is bundled).

Verify:

```powershell
node --version
npm --version
```

Expected: `v24.x` / `11.x`

---

### 1.3 Git

Download: https://git-scm.com/downloads/win

- Default options are fine; on the "Adjusting your PATH environment" step, keep **"Git from the command line and also from 3rd-party software"** selected.

Verify:

```powershell
git --version
```

Expected: `git version 2.47.x` (or newer)

---

### 1.4 Docker Desktop for Windows

Download: https://www.docker.com/products/docker-desktop/

- During install, choose the **WSL2 backend** (this machine already defaults to WSL2, so it should be a clean install).
- If Docker Desktop complains about virtualization, enable **Intel VT-x** in BIOS/UEFI and re-run the installer.
- Reboot if prompted.

Verify:

```powershell
docker --version
docker compose version
```

---

### 1.5 Ollama for Windows

Download: https://ollama.com/download/windows

After install, pull the locked-in model (`DEV_PLAN.md` §1 — `qwen3:8b`, chosen for tool-calling reliability):

```powershell
ollama pull qwen3:8b
```

Verify tool-calling support (should list `tools` under capabilities):

```powershell
ollama show qwen3:8b
```

Quick smoke test:

```powershell
ollama run qwen3:8b "Say hello in one sentence."
```

Ollama runs host-native (not in Docker) for Weeks 1–4 — see `DEV_PLAN.md` §1.

---

### 1.6 API client — Postman

Download: https://www.postman.com/downloads/

Used for backend-only demo weeks and manually exercising endpoints before the frontend is wired up. (Insomnia or the VS Code "Thunder Client" extension work equally well if preferred — no need to install more than one.)

---

### 1.7 Postgres GUI (optional but recommended)

Pick one:

- pgAdmin: https://www.pgadmin.org/download/pgadmin-4-windows/
- DBeaver: https://dbeaver.io/download/

Alternative if you'd rather stay in the terminal (works once Week 1's `docker-compose.yml` exists):

```powershell
docker exec -it <container_name> psql -U user -d secureship
```

---

### 1.8 VS Code + extensions

Download: https://code.visualstudio.com/download

Install extensions via command line once VS Code's `code` CLI is on PATH:

```powershell
code --install-extension ms-python.python
code --install-extension ms-python.vscode-pylance
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension mrmlnc.vscode-scss
```

---

### 1.9 Auth0 account — not needed yet

Free sign-up: https://auth0.com

**Hold off until Week 4.** `DEV_PLAN.md` is explicit: create the tenant + application right before installing Auth0's Agent Skills, not before — no reason to have idle config sitting around.

Week 4 setup (for reference, do not run yet):

```powershell
npx skills add auth0/agent-skills
```

---

### Not needed

- No standalone virtualenv tool — Python's built-in `venv` covers it.
- No standalone Postgres install — it runs as a Docker container defined in Week 1's `docker-compose.yml`.
- No Zustand or other state library — React Query only (HTTP-only architecture, see `DEV_PLAN.md` §1).

---

## 2. Project dependencies (later — after Week 1 scaffolding)

These aren't needed today. Listed here so every install command for this project lives in one file.

### 2.1 Backend (Python / FastAPI)

From `backend/`, once `requirements.txt` exists:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Core packages this project locks in (`DEV_PLAN.md` §1):

```powershell
pip install fastapi "pydantic>=2" sqlalchemy alembic "uvicorn[standard]"
```

Run the dev server:

```powershell
uvicorn main:app --reload
```

### 2.2 Frontend (Vite + React + TypeScript)

From `frontend/`, scaffold (Week 1):

```powershell
npm create vite@latest . -- --template react-ts
npm install
```

Add Orval (generates React Query hooks from FastAPI's `/openapi.json` — never hand-write fetch calls, per `CLAUDE.md`):

```powershell
npm install --save-dev orval
```

Run the dev server:

```powershell
npm run dev
```

### 2.3 Docker Compose (Week 1)

Once `docker-compose.yml` exists at the repo root:

```powershell
docker compose up --build
```

Brings up `frontend`, `backend`, and `postgres` containers. Ollama stays on the host and is reached via `host.docker.internal:11434`.

---

## 3. Post-install sanity check

Run once Docker and Ollama are installed:

```powershell
docker --version
docker compose version
ollama --version
ollama show qwen3:8b
```

All four should return version/capability info with no errors before starting Week 1.
