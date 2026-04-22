import express from "express";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import {
  collectStreamingPromptResponse,
  getOpenCodeCatalog,
  type Playground,
} from "../packages/gateway-opencode/src/index";
import {
  appendHistory,
  deleteHistoryEntry,
  readHistoryEntry,
  readHistorySummary,
  trimStoredRun,
} from "./history-store";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === "production";
const SSE_FINAL_TEXT_LIMIT = Number(process.env.REPOVERA_SSE_FINAL_TEXT_LIMIT ?? 200_000);
const SSE_THOUGHTS_TEXT_LIMIT = Number(process.env.REPOVERA_SSE_THOUGHTS_TEXT_LIMIT ?? 80_000);

const app = express();
const httpServer = createHttpServer(app);
app.disable("x-powered-by");
app.use(express.json({ limit: process.env.REPOVERA_BODY_LIMIT ?? "100mb" }));

function writeSse(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function hasRunnableInput(playground: Playground | undefined) {
  return Boolean(
    playground?.prompt?.trim() ||
      playground?.attachments?.some((attachment) => attachment.content || attachment.name),
  );
}

app.get("/api/catalog", async (_req, res) => {
  const catalog = await getOpenCodeCatalog();
  res.json(catalog);
});

app.get("/favicon.ico", (_req, res) => {
  res.status(204).end();
});

app.get("/api/history", async (_req, res, next) => {
  try {
    res.json(await readHistorySummary());
  } catch (error) {
    next(error);
  }
});

app.get("/api/history/:runId", async (req, res, next) => {
  try {
    const entry = await readHistoryEntry(req.params.runId);
    if (!entry) {
      res.status(404).json({ error: "History entry not found" });
      return;
    }
    res.json(entry);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/history/:runId", async (req, res, next) => {
  try {
    res.json(await deleteHistoryEntry(req.params.runId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/run", async (req, res) => {
  const playground = req.body?.playground as Playground | undefined;
  if (!hasRunnableInput(playground)) {
    res.status(400).json({ error: "Prompt or attachment is required" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  let clientConnected = true;
  const heartbeat = setInterval(() => {
    if (!clientConnected || res.destroyed || res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }

    try {
      res.write(": heartbeat\n\n");
    } catch {
      clientConnected = false;
      clearInterval(heartbeat);
    }
  }, 15_000);

  const markClientDisconnected = () => {
    clientConnected = false;
    clearInterval(heartbeat);
  };

  req.on("aborted", markClientDisconnected);
  res.on("close", markClientDisconnected);

  const writeIfConnected = (event: string, data: unknown) => {
    if (!clientConnected || res.destroyed || res.writableEnded) {
      return false;
    }

    try {
      writeSse(res, event, data);
      return true;
    } catch {
      markClientDisconnected();
      return false;
    }
  };

  try {
    const sentChars = {
      final: 0,
      thoughts: 0,
    };
    const writeLimitedDelta = (delta: { channel: "thoughts" | "final"; text: string }) => {
      const limit = delta.channel === "final" ? SSE_FINAL_TEXT_LIMIT : SSE_THOUGHTS_TEXT_LIMIT;
      const remaining = Math.max(0, limit - sentChars[delta.channel]);
      if (remaining <= 0) {
        return;
      }

      const text = delta.text.slice(0, remaining);
      sentChars[delta.channel] += text.length;
      writeIfConnected("delta", { ...delta, text });
    };

    const result = await collectStreamingPromptResponse({
      playground,
      onStart: (data) => writeIfConnected("start", data),
      onDelta: writeLimitedDelta,
      onError: (message) => writeIfConnected("error", { message }),
    });

    const storedResult = trimStoredRun({ ...result, playground });
    await appendHistory(storedResult);
    writeIfConnected("done", storedResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeIfConnected("error", { message });
  } finally {
    clearInterval(heartbeat);
    if (clientConnected && !res.destroyed && !res.writableEnded) {
      res.end();
    }
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  const status = typeof error === "object" && error && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 500;
  res.status(Number.isFinite(status) && status >= 400 ? status : 500).json({ error: message });
});

if (!isProduction) {
  const vite = await createViteServer({
    root,
    server: {
      middlewareMode: true,
      hmr: {
        server: httpServer,
      },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, "dist")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(root, "dist", "index.html"));
  });
}

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Repovera AI Studio listening on http://localhost:${port}`);
});
