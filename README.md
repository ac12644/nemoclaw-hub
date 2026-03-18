# NemoClaw Hub

Web dashboard for managing [NemoClaw](https://github.com/NVIDIA/NemoClaw) sandboxed AI agents.

![License](https://img.shields.io/badge/License-Apache_2.0-blue)

## What It Does

NemoClaw Hub wraps the NemoClaw CLI into a REST API + WebSocket backend with a React frontend. Manage multiple sandboxed agents, chat with them, edit network policies, stream logs, and view audit trails — all from one interface.

### Dashboard
Agent grid showing all sandboxes with status, model, provider, and applied policy presets.

### Agent Detail
Three tabs per agent:
- **Chat** — Send messages and view conversation history
- **Logs** — Real-time log streaming via WebSocket
- **Config** — View sandbox config, toggle network policy presets

### Audit Log
Filterable event table with live updates. Tracks sandbox creation/destruction, policy changes, credential updates, and messages.

## Architecture

```
Browser (React + Tailwind)
    │
    ▼
Fastify API Server (TypeScript)
    ├── REST API (sandboxes, policies, NIM, credentials, messages, audit)
    ├── WebSocket (log streaming, live audit feed)
    └── SQLite (messages, audit events, sessions)
    │
    ▼
NemoClaw lib/ modules → openshell CLI → Sandboxes
```

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Fastify + TypeScript |
| Database | SQLite (better-sqlite3) |
| Frontend | React + Vite + Tailwind CSS |
| Auth | Token-based sessions |
| Real-time | WebSocket (log streaming, audit feed) |

## Quick Start

### Prerequisites

- Node.js 20+
- [NemoClaw](https://github.com/NVIDIA/NemoClaw) installed with at least one sandbox created
- [OpenShell](https://github.com/NVIDIA/OpenShell) CLI on your PATH

### Install and Run

```bash
git clone https://github.com/ac12644/nemoclaw-hub.git
cd nemoclaw-hub
npm install

# Build the frontend
npm run build:client

# Start the server
npm run dev
```

The server starts on `http://127.0.0.1:3100`. On first run, an access token is generated at `~/.nemoclaw/hub-token.json`. Use it to log in.

### Development Mode

```bash
# Terminal 1: Backend with hot reload
npm run dev

# Terminal 2: Vite dev server with proxy
npm run dev:client
```

Frontend dev server runs on `http://localhost:5173` and proxies API calls to the backend.

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login with token |
| `GET` | `/api/sandboxes` | List all sandboxes |
| `GET` | `/api/sandboxes/:name` | Sandbox detail + NIM status |
| `DELETE` | `/api/sandboxes/:name` | Destroy sandbox |
| `GET` | `/api/sandboxes/:name/logs` | Recent logs |
| `WS` | `/api/sandboxes/:name/logs/stream` | Stream logs |
| `GET` | `/api/policies/presets` | List policy presets |
| `POST` | `/api/sandboxes/:name/policies` | Apply preset |
| `GET` | `/api/nim/models` | NIM model catalog |
| `GET` | `/api/nim/gpu` | GPU detection |
| `GET` | `/api/messages/:sandbox` | Chat history |
| `POST` | `/api/messages/:sandbox` | Send message to agent |
| `GET` | `/api/audit` | Audit event log |
| `WS` | `/api/activity` | Live audit events |

## Tests

```bash
npm test
```

## License

[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
