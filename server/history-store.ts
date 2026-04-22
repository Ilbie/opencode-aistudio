import fs from "node:fs/promises";
import path from "node:path";
import type { Playground, RunResult } from "../packages/gateway-opencode/src/index";

export type StoredRunResult = RunResult & {
  playground: Playground;
};

const DATA_DIR = path.resolve(process.cwd(), ".repovera-data");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const MAX_HISTORY_ENTRIES = Number(process.env.REPOVERA_MAX_HISTORY_ENTRIES ?? 30);
const STORED_FINAL_TEXT_LIMIT = Number(process.env.REPOVERA_STORED_FINAL_TEXT_LIMIT ?? 200_000);
const STORED_THOUGHTS_TEXT_LIMIT = Number(process.env.REPOVERA_STORED_THOUGHTS_TEXT_LIMIT ?? 80_000);
const STORED_ATTACHMENT_CONTENT_LIMIT = Number(process.env.REPOVERA_STORED_ATTACHMENT_CONTENT_LIMIT ?? 120_000);
const HISTORY_PROMPT_PREVIEW_LIMIT = 2_000;
const TRIM_NOTICE = "\n\n[Trimmed to reduce memory use.]";

let historyWriteQueue = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readHistory(): Promise<StoredRunResult[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf8");
    const parsed = parseHistoryJson(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function readHistorySummary(): Promise<StoredRunResult[]> {
  const history = await readHistory();
  return history.map(compactHistoryEntry);
}

export async function readHistoryEntry(runId: string): Promise<StoredRunResult | null> {
  const history = await readHistory();
  const entry = history.find((item) => item.id === runId);
  return entry ? trimStoredRun(entry) : null;
}

export async function appendHistory(result: StoredRunResult) {
  return enqueueHistoryWrite(async () => {
    const history = await readHistory();
    const next = [trimStoredRun(result), ...history.map(trimStoredRun)].slice(0, MAX_HISTORY_ENTRIES);
    await writeHistory(next);
    return next;
  });
}

export async function deleteHistoryEntry(runId: string) {
  return enqueueHistoryWrite(async () => {
    const history = await readHistory();
    const next = history.filter((item) => item.id !== runId).map(trimStoredRun);
    await writeHistory(next);
    return next.map(compactHistoryEntry);
  });
}

async function writeHistory(history: StoredRunResult[]) {
  await ensureDataDir();
  const tempFile = `${HISTORY_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(history, null, 2), "utf8");
  await fs.rename(tempFile, HISTORY_FILE);
}

function enqueueHistoryWrite<T>(operation: () => Promise<T>) {
  const nextWrite = historyWriteQueue.then(operation, operation);
  historyWriteQueue = nextWrite.then(
    () => undefined,
    () => undefined,
  );
  return nextWrite;
}

function parseHistoryJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    const position = /position\s+(\d+)/i.exec(error.message)?.[1];
    if (!position || !/after JSON/i.test(error.message)) {
      throw error;
    }

    const recovered = raw.slice(0, Number(position)).trimEnd();
    return JSON.parse(recovered);
  }
}

function compactHistoryEntry(entry: StoredRunResult): StoredRunResult {
  return {
    ...entry,
    finalText: "",
    thoughtsText: "",
    playground: {
      ...entry.playground,
      prompt: limitText(entry.playground.prompt, HISTORY_PROMPT_PREVIEW_LIMIT),
      systemInstruction: limitText(entry.playground.systemInstruction ?? "", HISTORY_PROMPT_PREVIEW_LIMIT),
      attachments: entry.playground.attachments.map((attachment) => ({
        ...attachment,
        content: "",
      })),
    },
    compact: true,
  } as StoredRunResult;
}

export function trimStoredRun(entry: StoredRunResult): StoredRunResult {
  const finalText = stripEchoedPrompt(limitText(entry.finalText, STORED_FINAL_TEXT_LIMIT));
  const thoughtsText = limitText(entry.thoughtsText, STORED_THOUGHTS_TEXT_LIMIT);
  const outputTruncated = entry.outputTruncated || finalText.length < entry.finalText.length;
  const thoughtsTruncated = entry.thoughtsTruncated || thoughtsText.length < entry.thoughtsText.length;

  return {
    ...entry,
    finalText,
    thoughtsText,
    partial: entry.partial || outputTruncated || thoughtsTruncated,
    outputTruncated,
    thoughtsTruncated,
    playground: {
      ...entry.playground,
      prompt: limitText(entry.playground.prompt, STORED_ATTACHMENT_CONTENT_LIMIT),
      systemInstruction: limitText(entry.playground.systemInstruction ?? "", STORED_ATTACHMENT_CONTENT_LIMIT),
      attachments: entry.playground.attachments.map((attachment) => ({
        ...attachment,
        content: limitText(attachment.content, STORED_ATTACHMENT_CONTENT_LIMIT),
      })),
    },
    compact: false,
  } as StoredRunResult;
}

function limitText(value: string | undefined, maxLength: number) {
  const text = value ?? "";
  if (text.length <= maxLength) {
    return text;
  }

  const suffix = TRIM_NOTICE;
  const retainedLength = Math.max(0, maxLength - suffix.length);
  return `${text.slice(0, retainedLength)}${suffix}`;
}

function stripEchoedPrompt(value: string) {
  const trimmedStart = value.trimStart();
  if (!trimmedStart.startsWith("<attached_context>") && !trimmedStart.startsWith("<user_task>")) {
    return value;
  }

  const userTaskEnd = value.indexOf("</user_task>");
  if (userTaskEnd === -1) {
    return "";
  }

  return value.slice(userTaskEnd + "</user_task>".length).trimStart();
}
