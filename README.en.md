# opencode-aistudio

AI Studio-style codebase analysis for any OpenCode-backed provider.

## Why This Exists

I often analyzed code by combining **Google AI Studio** with **Repomix**: package a repository into a large context, paste it into the playground, and ask the model to inspect architecture, bugs, implementation details, or migration plans.

That workflow was convenient in Google AI Studio, but trying to do the same thing with other AI providers was awkward. Their playgrounds often made it harder to switch models, attach large context, keep run history, or inspect reasoning output cleanly.

opencode-aistudio was created as an **OpenCode-based local playground** for that same large-context code analysis workflow, with more control over providers and local behavior.

## Features

- Large-context prompt workflow for code analysis
- File attachments and pasted repository context
- OpenCode provider/model catalog integration
- Model/provider selection from the UI
- Streaming output
- Final answer and thoughts rendered separately
- Local run history stored under `.repovera-data/history.json`
- English and Korean UI support
- Root YAML configuration with inline comments

## Requirements

- Node.js 20+
- npm
- OpenCode authentication on the local machine

If OpenCode auth has expired, run:

```bash
opencode auth login
```

## Quick Start

```bash
git clone https://github.com/Ilbie/opencode-aistudio.git
cd opencode-aistudio
```

Run the app. The wrapper script installs npm dependencies automatically when `node_modules` is missing.

Linux/macOS:

```bash
./run.sh
```

Windows PowerShell:

```powershell
.\run.ps1
```

Windows Command Prompt:

```bat
run.cmd
```

The default server URL is [http://localhost:47831](http://localhost:47831). You can change the port in [`opencode-aistudio.yml`](./opencode-aistudio.yml).

## Configuration

App settings live in [`opencode-aistudio.yml`](./opencode-aistudio.yml) at the repository root.

Use this file to configure:

- Web server port and request body size
- SSE streaming text limits
- Local history retention and storage limits
- Gateway timeouts and retained output limits
- Managed OpenCode runtime paths, port range, auth path, and optional command fallback

After changing the YAML file, restart the dev/start server.

## Script Modes

The run wrappers accept the same modes on every OS:

```bash
./run.sh dev
./run.sh build
./run.sh preview
./run.sh lint
./run.sh start
```

On Windows, use `.\run.ps1 <mode>` or `run.cmd <mode>`.

You can also use npm directly. If you use npm directly on a fresh clone, install dependencies first:

```bash
npm install
npm run dev
npm run build
npm run preview
npm run lint
npm run clean
```

## Architecture

```text
src/                                  React playground UI
server/index.ts                       Express + Vite server, API routes, SSE streaming
server/history-store.ts               Local run history persistence
packages/gateway-opencode/src/        Managed OpenCode runtime and streaming gateway
app-config.ts                         Root YAML configuration loader
opencode-aistudio.yml                 User-editable app configuration
```

The server exposes:

- `GET /api/catalog`
- `GET /api/history`
- `GET /api/history/:runId`
- `DELETE /api/history/:runId`
- `POST /api/run`

## Product Scope

opencode-aistudio is not an autonomous agent interface. It is a focused playground for:

1. Uploading or pasting large context
2. Choosing a provider and model
3. Adjusting supported run settings
4. Running a prompt
5. Reviewing thoughts separately from the final Markdown answer
6. Reopening past runs from local history

## Languages

- [Main README](./README.md)
- [한국어](./README.ko.md)
