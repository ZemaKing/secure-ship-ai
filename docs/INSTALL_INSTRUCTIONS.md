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

### 1.9 Auth0 account (Week 4)

Free sign-up: https://auth0.com — **Personal** account type is fine for this project (not a company signup).

**Create the application and API** (Dashboard → manage.auth0.com):

1. **Applications → Applications → Create Application**
   - Name: `SecureShip Admin`
   - Type: **Single Page Web Applications**
2. In that application's **Settings** tab, set:
   - Allowed Callback URLs: `http://localhost:5173, http://localhost:5173/admin`
   - Allowed Logout URLs: `http://localhost:5173`
   - Allowed Web Origins: `http://localhost:5173`
   - Save Changes
3. Note the **Domain** and **Client ID** from the top of that Settings tab.
4. **Applications → APIs → Create API**
   - Name: `SecureShip Admin API`
   - Identifier: `https://secureship-admin-api` (becomes `AUTH0_AUDIENCE` — a URI-shaped string that's never actually called, just needs to be unique within the tenant)
   - Signing Algorithm: RS256 (default)
5. **Grant the application access to the API** — open the API → **Application Access** tab (older Auth0 UI: "Machine to Machine Applications", despite the name it also covers the Authorization Code/PKCE flow a SPA uses) → find the SPA application → toggle **User-Delegated Access** to Authorized → Save.
   - Skipping this step fails login immediately with `invalid_request: Client "..." is not authorized to access resource server "..."`.

No client secret is needed anywhere — the SPA uses PKCE, and the backend only ever *validates* tokens (never issues them), so it stays a stateless JWT validator.

**Install the Auth0 Agent Skill** (drives the actual integration code — see `CLAUDE.md` §4.5):

```powershell
npx skills add auth0/agent-skills --full-depth --skill auth0 -y
```

The `--full-depth --skill auth0` flags matter — the bare `npx skills add auth0/agent-skills` installs the wrong skill (`author-auth0-skill`, Auth0's own internal meta-skill for authoring their skill docs, not one for building an app against).

**Environment variables** — add to `backend/.env`:

```
AUTH0_DOMAIN=<your-tenant>.us.auth0.com
AUTH0_AUDIENCE=https://secureship-admin-api
```

and to `frontend/.env`:

```
VITE_AUTH0_DOMAIN=<your-tenant>.us.auth0.com
VITE_AUTH0_CLIENT_ID=<the SPA application's Client ID>
VITE_AUTH0_AUDIENCE=https://secureship-admin-api
```

The same three values also go into `docker-compose.yml`'s `backend.environment`/`frontend.environment` blocks for the containerized path (already wired in — just swap in a new tenant's values if setting this up fresh).

**Known gotcha, already fixed in code:** `Auth0Provider` must be given an explicit `redirect_uri` — leaving it to the SDK's default caused a real, 100%-reproducible `Unable to issue redirect for OAuth 2.0 transaction` error on Auth0's own login page (confirmed across two separate freshly-created tenants before the cause was found). Fixed in `frontend/src/auth/Auth0ProviderWithNavigate.tsx`; noted here in case a future SDK upgrade reintroduces it. Full debugging trail in `CHANGE_LOG.md`'s 2026-08-07 entry.

**Not yet locked down (planned for Week 4, Chunk E):** right now, anyone who signs up on the Universal Login screen gets full admin access — there's no role/permission check yet, and public self-service Sign Up is still enabled on the connection. Chunk E adds an `admin:access` RBAC permission check and disables public Sign Up.

Verify:

```powershell
curl -i http://localhost:8000/admin/me
```

Expected: `400 invalid_request` with no `Authorization` header — confirms the backend is validating against the real tenant, not just returning a generic error.

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

### 2.4 Testing tools (added Week 2)

No separate install step — both are already pinned in `requirements.txt`/`package.json`, so they come in with the installs in 2.1/2.2 above.

**Backend — pytest.** Runs against the real dev Postgres (a transaction-per-test rollback keeps it clean, no separate test DB) and never calls the real Ollama model. From `backend/`, venv active, dev Postgres up and migrated:

```powershell
pytest
```

**Frontend — Vitest + Testing Library.** No backend/Postgres/Ollama needed — the only thing mocked is `global.fetch`. From `frontend/`:

```powershell
npm test
```

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
