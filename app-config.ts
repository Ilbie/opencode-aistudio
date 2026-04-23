import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type PlainObject = Record<string, unknown>;

export type AppConfig = {
  server: {
    port: number;
    bodyLimit: string;
    sseFinalTextLimit: number;
    sseThoughtsTextLimit: number;
  };
  history: {
    maxEntries: number;
    storedFinalTextLimit: number;
    storedThoughtsTextLimit: number;
    storedAttachmentContentLimit: number;
  };
  gateway: {
    finalTextLimit: number;
    thoughtsTextLimit: number;
    timeoutMs: number;
    postPromptIdleGraceMs: number;
  };
  opencode: {
    runtimeDir?: string;
    binaryPath?: string;
    authJsonPath?: string;
    command?: string;
    startTimeoutMs: number;
    portStart: number;
    portEnd: number;
    serverUsername: string;
    serverPassword?: string;
  };
};

const DEFAULT_CONFIG: AppConfig = {
  server: {
    port: 3000,
    bodyLimit: "100mb",
    sseFinalTextLimit: 200_000,
    sseThoughtsTextLimit: 80_000,
  },
  history: {
    maxEntries: 30,
    storedFinalTextLimit: 200_000,
    storedThoughtsTextLimit: 80_000,
    storedAttachmentContentLimit: 120_000,
  },
  gateway: {
    finalTextLimit: 200_000,
    thoughtsTextLimit: 80_000,
    timeoutMs: 5 * 60 * 1000,
    postPromptIdleGraceMs: 5 * 60 * 1000,
  },
  opencode: {
    startTimeoutMs: 15_000,
    portStart: 4097,
    portEnd: 4197,
    serverUsername: "opencode",
  },
};

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(PROJECT_ROOT, "opencode-aistudio.yml");

export const appConfig = loadAppConfig();

function loadAppConfig(): AppConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    return DEFAULT_CONFIG;
  }

  const parsed = parseSimpleYaml(fs.readFileSync(CONFIG_FILE, "utf8"));
  return normalizeConfig(parsed);
}

function normalizeConfig(raw: PlainObject): AppConfig {
  return {
    server: {
      port: readNumber(raw, ["server", "port"], DEFAULT_CONFIG.server.port, {
        integer: true,
        min: 1,
        max: 65_535,
      }),
      bodyLimit: readString(raw, ["server", "bodyLimit"], DEFAULT_CONFIG.server.bodyLimit),
      sseFinalTextLimit: readNumber(
        raw,
        ["server", "sseFinalTextLimit"],
        DEFAULT_CONFIG.server.sseFinalTextLimit,
        { integer: true, min: 1 },
      ),
      sseThoughtsTextLimit: readNumber(
        raw,
        ["server", "sseThoughtsTextLimit"],
        DEFAULT_CONFIG.server.sseThoughtsTextLimit,
        { integer: true, min: 1 },
      ),
    },
    history: {
      maxEntries: readNumber(raw, ["history", "maxEntries"], DEFAULT_CONFIG.history.maxEntries, {
        integer: true,
        min: 1,
      }),
      storedFinalTextLimit: readNumber(
        raw,
        ["history", "storedFinalTextLimit"],
        DEFAULT_CONFIG.history.storedFinalTextLimit,
        { integer: true, min: 1 },
      ),
      storedThoughtsTextLimit: readNumber(
        raw,
        ["history", "storedThoughtsTextLimit"],
        DEFAULT_CONFIG.history.storedThoughtsTextLimit,
        { integer: true, min: 1 },
      ),
      storedAttachmentContentLimit: readNumber(
        raw,
        ["history", "storedAttachmentContentLimit"],
        DEFAULT_CONFIG.history.storedAttachmentContentLimit,
        { integer: true, min: 1 },
      ),
    },
    gateway: {
      finalTextLimit: readNumber(
        raw,
        ["gateway", "finalTextLimit"],
        DEFAULT_CONFIG.gateway.finalTextLimit,
        { integer: true, min: 1 },
      ),
      thoughtsTextLimit: readNumber(
        raw,
        ["gateway", "thoughtsTextLimit"],
        DEFAULT_CONFIG.gateway.thoughtsTextLimit,
        { integer: true, min: 1 },
      ),
      timeoutMs: readNumber(raw, ["gateway", "timeoutMs"], DEFAULT_CONFIG.gateway.timeoutMs, {
        integer: true,
        min: 1,
      }),
      postPromptIdleGraceMs: readNumber(
        raw,
        ["gateway", "postPromptIdleGraceMs"],
        DEFAULT_CONFIG.gateway.postPromptIdleGraceMs,
        { integer: true, min: 1 },
      ),
    },
    opencode: normalizeOpenCodeConfig(raw),
  };
}

function normalizeOpenCodeConfig(raw: PlainObject): AppConfig["opencode"] {
  const portStart = readNumber(raw, ["opencode", "portStart"], DEFAULT_CONFIG.opencode.portStart, {
    integer: true,
    min: 1,
    max: 65_535,
  });
  const portEnd = readNumber(raw, ["opencode", "portEnd"], DEFAULT_CONFIG.opencode.portEnd, {
    integer: true,
    min: portStart,
    max: 65_535,
  });

  return {
    runtimeDir: readOptionalString(raw, ["opencode", "runtimeDir"]),
    binaryPath: readOptionalString(raw, ["opencode", "binaryPath"]),
    authJsonPath: readOptionalString(raw, ["opencode", "authJsonPath"]),
    command: readOptionalString(raw, ["opencode", "command"]),
    startTimeoutMs: readNumber(
      raw,
      ["opencode", "startTimeoutMs"],
      DEFAULT_CONFIG.opencode.startTimeoutMs,
      { integer: true, min: 1 },
    ),
    portStart,
    portEnd,
    serverUsername: readString(
      raw,
      ["opencode", "serverUsername"],
      DEFAULT_CONFIG.opencode.serverUsername,
    ),
    serverPassword: readOptionalString(raw, ["opencode", "serverPassword"]),
  };
}

function parseSimpleYaml(raw: string): PlainObject {
  const root: PlainObject = {};
  const stack: Array<{ indent: number; value: PlainObject }> = [{ indent: -1, value: root }];

  raw.split(/\r?\n/).forEach((sourceLine, index) => {
    const line = stripYamlComment(sourceLine).trimEnd();
    if (!line.trim()) {
      return;
    }

    if (line.includes("\t")) {
      throw new Error(`Tabs are not supported in ${CONFIG_FILE}:${index + 1}`);
    }

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    const separatorIndex = trimmed.indexOf(":");

    if (separatorIndex <= 0) {
      throw new Error(`Invalid YAML entry in ${CONFIG_FILE}:${index + 1}`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const valueText = trimmed.slice(separatorIndex + 1).trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].value;
    if (valueText === "") {
      const child: PlainObject = {};
      parent[key] = child;
      stack.push({ indent, value: child });
      return;
    }

    parent[key] = parseYamlScalar(valueText);
  });

  return root;
}

function stripYamlComment(line: string) {
  let quote: string | undefined;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];

    if ((char === '"' || char === "'") && previous !== "\\") {
      quote = quote === char ? undefined : quote ?? char;
    }

    if (char === "#" && !quote && (index === 0 || /\s/.test(previous))) {
      return line.slice(0, index);
    }
  }

  return line;
}

function parseYamlScalar(valueText: string) {
  if (valueText === "true") {
    return true;
  }

  if (valueText === "false") {
    return false;
  }

  if (valueText === "null" || valueText === "~") {
    return null;
  }

  if (valueText.startsWith('"') && valueText.endsWith('"')) {
    return JSON.parse(valueText);
  }

  if (valueText.startsWith("'") && valueText.endsWith("'")) {
    return valueText.slice(1, -1).replace(/''/g, "'");
  }

  if (/^[+-]?\d[\d_]*(\.\d[\d_]*)?$/.test(valueText)) {
    return Number(valueText.replaceAll("_", ""));
  }

  return valueText;
}

function readValue(raw: PlainObject, keys: string[]) {
  let current: unknown = raw;

  for (const key of keys) {
    if (!isPlainObject(current) || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

function readString(raw: PlainObject, keys: string[], fallback: string) {
  const value = readValue(raw, keys);
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value);
}

function readOptionalString(raw: PlainObject, keys: string[]) {
  const value = readValue(raw, keys);
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return String(value);
}

function readNumber(
  raw: PlainObject,
  keys: string[],
  fallback: number,
  options: { integer?: boolean; min?: number; max?: number } = {},
) {
  const value = readValue(raw, keys);
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const numberValue = Number(value);
  const keyPath = keys.join(".");
  if (!Number.isFinite(numberValue)) {
    throw new Error(`Configuration value "${keyPath}" must be a number.`);
  }

  if (options.integer && !Number.isInteger(numberValue)) {
    throw new Error(`Configuration value "${keyPath}" must be an integer.`);
  }

  if (options.min !== undefined && numberValue < options.min) {
    throw new Error(`Configuration value "${keyPath}" must be at least ${options.min}.`);
  }

  if (options.max !== undefined && numberValue > options.max) {
    throw new Error(`Configuration value "${keyPath}" must be at most ${options.max}.`);
  }

  return numberValue;
}

function isPlainObject(value: unknown): value is PlainObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
