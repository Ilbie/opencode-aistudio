<div align="center">
  <h1>opencode-aistudio</h1>
  <p><strong>AI Studio-style codebase analysis for any OpenCode-backed provider.</strong></p>
  <p>Paste Repomix output, attach project context, pick a model, and inspect streamed results locally.</p>
</div>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6.svg">
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb.svg">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646cff.svg">
  <img alt="OpenCode" src="https://img.shields.io/badge/OpenCode-backed-111827.svg">
  <img alt="Languages" src="https://img.shields.io/badge/docs-EN%20%7C%20KO-0f766e.svg">
</p>

<p align="center">
  <a href="./README.en.md"><strong>English</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="./README.ko.md"><strong>한국어</strong></a>
</p>

---

## Overview

opencode-aistudio is a local playground for the workflow many developers use with **Google AI Studio + Repomix**:

1. Package a repository into one large context.
2. Paste or attach that context.
3. Ask an AI model to analyze architecture, bugs, implementation details, or migration plans.

That flow is useful, but other AI playgrounds can make it awkward to switch providers, keep local history, attach large context, or inspect reasoning output. opencode-aistudio brings that workflow into an **OpenCode-based local app**.

## Highlights

- Large-context code analysis workflow
- Repomix output and file attachment friendly
- OpenCode provider/model catalog integration
- Streaming final output and separated thoughts
- Local run history
- English/Korean UI
- Root YAML configuration

## Quick Start

```bash
git clone https://github.com/Ilbie/opencode-aistudio.git
cd opencode-aistudio
```

If OpenCode auth has expired:

```bash
opencode auth login
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

Default local URL:

```text
http://localhost:3000
```

## Documentation

Choose a language:

| Language | README |
| --- | --- |
| English | [README.en.md](./README.en.md) |
| 한국어 | [README.ko.md](./README.ko.md) |

## Configuration

Edit [`opencode-aistudio.yml`](./opencode-aistudio.yml) to change server, history, gateway, and managed OpenCode runtime settings.
