import type { CatalogPayload, Playground, RunResult } from "./playground";

export type RunStreamEvent =
  | { type: "start"; data?: unknown }
  | { type: "delta"; data: { channel: "thoughts" | "final"; text: string } }
  | { type: "error"; data: unknown }
  | { type: "done"; data: RunResult };

export async function fetchCatalog(signal?: AbortSignal): Promise<CatalogPayload> {
  const response = await fetch("/api/catalog", { signal });
  if (!response.ok) {
    throw new Error(`Catalog request failed with ${response.status}`);
  }
  return (await response.json()) as CatalogPayload;
}

export async function fetchHistory(signal?: AbortSignal): Promise<RunResult[]> {
  const response = await fetch("/api/history", { signal });
  if (!response.ok) {
    throw new Error(`History request failed with ${response.status}`);
  }
  return (await response.json()) as RunResult[];
}

export async function fetchHistoryRun(runId: string, signal?: AbortSignal): Promise<RunResult> {
  const response = await fetch(`/api/history/${encodeURIComponent(runId)}`, { signal });
  if (!response.ok) {
    throw new Error(`History entry request failed with ${response.status}`);
  }
  return (await response.json()) as RunResult;
}

export async function deleteHistoryRun(runId: string, signal?: AbortSignal): Promise<RunResult[]> {
  const response = await fetch(`/api/history/${encodeURIComponent(runId)}`, {
    method: "DELETE",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Delete history request failed with ${response.status}`);
  }

  return (await response.json()) as RunResult[];
}

export async function runPlayground(
  playground: Playground,
  onEvent: (event: RunStreamEvent) => void,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ playground }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(await responseErrorMessage(response, "Run request failed"));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushEvent = (payload: string) => {
    const event = parseSSEEvent(payload);
    if (!event) {
      return;
    }
    onEvent(event);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const chunk = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      if (chunk.trim()) {
        flushEvent(chunk);
      }
      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  const remainder = buffer;
  if (remainder.trim()) {
    flushEvent(remainder);
  }
}

async function responseErrorMessage(response: Response, fallback: string) {
  const statusPrefix = `${fallback} with ${response.status}`;
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      const message = typeof payload?.error === "string" ? payload.error : undefined;
      return message ? `${statusPrefix}: ${message}` : statusPrefix;
    }

    const text = await response.text();
    return text.trim() ? `${statusPrefix}: ${text.trim()}` : statusPrefix;
  } catch {
    return statusPrefix;
  }
}

function parseSSEEvent(payload: string): RunStreamEvent | null {
  const lines = payload.split(/\r?\n/);
  let eventName = "";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }

  if (!eventName || dataLines.length === 0) {
    return null;
  }

  const rawData = dataLines.join("\n");

  try {
    const data = JSON.parse(rawData);

    if (eventName === "start") {
      return { type: "start", data };
    }

    if (eventName === "delta") {
      return { type: "delta", data };
    }

    if (eventName === "error") {
      return { type: "error", data };
    }

    if (eventName === "done") {
      return { type: "done", data };
    }
  } catch {
    if (eventName === "error") {
      return { type: "error", data: rawData };
    }
  }

  return null;
}
