# Repovera AI Studio Playground

Repovera AI Studio is a local large-context playground for OpenCode-backed model runs. It supports file attachments, model/provider selection, streaming output, separate thoughts rendering, and local run history.

The UI supports English and Korean through the sidebar language toggle.

## Prerequisites

- Node.js 20+
- npm
- OpenCode authentication on the local machine

If OpenCode auth is expired, run:

```bash
opencode auth login
```

No `.env` file is required.

## Run

Install dependencies once:

```bash
npm install
```

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

The server listens on [http://localhost:3000](http://localhost:3000) by default.

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

You can also use npm directly:

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run clean
```

## Architecture

- `src/` contains the React playground UI.
- `server/index.ts` serves the Vite app and exposes `/api/catalog`, `/api/history`, and `/api/run`.
- `server/history-store.ts` persists local run history under `.repovera-data/history.json`.
- `packages/gateway-opencode/src/index.ts` manages the isolated OpenCode runtime, starts `opencode serve`, queries providers/models, and streams prompt results.
- `packages/gateway-opencode/src/stream-completion.ts` handles idle events, timeout handling, and partial response recovery.

## Product Scope

Repovera AI Studio is not an autonomous agent interface. The main workflow is:

1. Upload or paste a large context.
2. Pick a provider/model.
3. Adjust supported run settings.
4. Run the prompt.
5. Review thoughts separately from the final Markdown answer.
6. Reopen past runs from History.
