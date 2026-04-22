import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createOpencodeClient,
  type Event as OpenCodeEvent,
  type OpencodeClient,
} from "@opencode-ai/sdk/v2";
import { selectOpenCodePort } from "./port-selection";
import {
  DEFAULT_GATEWAY_TIMEOUT_MS,
  finalizeGatewayResponses,
  waitForStreamCompletion,
} from "./stream-completion";

export type ContextAttachment = {
  id: string;
  name: string;
  type: "text" | "xml" | "json" | "markdown" | "code" | "image" | "audio" | "video" | "pdf" | "unknown";
  sizeBytes: number;
  tokenCount: number;
  content: string;
  mimeType?: string;
  createdAt: string;
};

export type RunSettings = {
  modelVariant: string;
  codeExecution: boolean;
  urlContext: boolean;
};

export type Playground = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  provider: string;
  systemInstruction?: string;
  prompt: string;
  attachments: ContextAttachment[];
  runSettings: RunSettings;
};

export type RunResult = {
  id: string;
  playgroundId: string;
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  thoughtsText: string;
  finalText: string;
  error?: string;
  partial: boolean;
  startedAt: string;
  completedAt?: string;
  compact?: boolean;
  outputTruncated?: boolean;
  thoughtsTruncated?: boolean;
};

export type ProviderOption = {
  id: string;
  provider: string;
  name: string;
  label: string;
  source?: string;
  connected: boolean;
  defaultModel?: string;
};

export type ModelOption = {
  id: string;
  model: string;
  name: string;
  label: string;
  provider: string;
  providerName: string;
  connected: boolean;
  default: boolean;
  capabilities: {
    reasoning: boolean;
    temperature: boolean;
    attachment: boolean;
    toolCall: boolean;
    input: {
      text: boolean;
      image: boolean;
      audio: boolean;
      video: boolean;
      pdf: boolean;
    };
  };
  limit: {
    context: number;
    output?: number;
  };
  variants: string[];
};

export type OpenCodeCatalog = {
  providers: ProviderOption[];
  models: ModelOption[];
  defaultModel?: {
    provider: string;
    model: string;
  };
  connected: boolean;
  cachedAt: string;
  error?: string;
};

export type PromptStreamDelta = {
  channel: "thoughts" | "final";
  text: string;
};

export type CollectStreamingPromptResponseOptions = {
  playground: Playground;
  timeoutMs?: number;
  onStart?: (data: { runId: string; sessionId?: string }) => void;
  onDelta?: (delta: PromptStreamDelta) => void;
  onError?: (message: string) => void;
};

export type CollectStreamingPromptResponseResult = RunResult & {
  sessionId?: string;
};

const GATEWAY_FINAL_TEXT_LIMIT = Number(process.env.REPOVERA_GATEWAY_FINAL_TEXT_LIMIT ?? 200_000);
const GATEWAY_THOUGHTS_TEXT_LIMIT = Number(process.env.REPOVERA_GATEWAY_THOUGHTS_TEXT_LIMIT ?? 80_000);
const GATEWAY_TRIM_NOTICE = "\n\n[Trimmed to reduce memory use.]";

type ManagedRuntime = {
  rootDir: string;
  homeDir: string;
  configDir: string;
  stateDir: string;
  cacheDir: string;
  appDataDir: string;
  localAppDataDir: string;
  workspaceDir: string;
  serverUsername: string;
  serverPassword: string;
  env: NodeJS.ProcessEnv;
};

type OpenCodeMessageRole = "user" | "assistant";

type TextLikePart = {
  id: string;
  messageID: string;
  type: "text" | "reasoning";
  text: string;
  ignored?: boolean;
};

type TextPartDelta = {
  messageID: string;
  partID: string;
  field: string;
  delta: string;
};

type ManagedServer = {
  runtime: ManagedRuntime;
  port: number;
  url: string;
  process: ChildProcessWithoutNullStreams;
  client: OpencodeClient;
};

let managedServer: ManagedServer | undefined;
let managedServerStart: Promise<ManagedServer> | undefined;
let cachedCatalog: { expiresAt: number; value: OpenCodeCatalog } | undefined;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

function runtimeRoot() {
  return (
    process.env.REPOVERA_OPENCODE_RUNTIME_DIR ??
    path.join(os.homedir(), ".repovera", "opencode-runtime")
  );
}

function resolveOpenCodeCommand() {
  if (process.env.REPOVERA_OPENCODE_BIN) {
    return process.env.REPOVERA_OPENCODE_BIN;
  }

  return path.join(
    PROJECT_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "opencode.cmd" : "opencode"
  );
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(source: string, destinations: string[]) {
  if (!(await exists(source))) {
    return false;
  }

  for (const destination of destinations) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination).catch(() => undefined);
  }

  return true;
}

function findAuthCandidates(originalEnv = process.env) {
  const home = os.homedir();
  return uniqueStrings([
    process.env.REPOVERA_OPENCODE_AUTH_JSON,
    path.join(home, ".config", "opencode", "auth.json"),
    path.join(home, ".local", "share", "opencode", "auth.json"),
    path.join(home, ".opencode", "auth.json"),
    originalEnv.APPDATA ? path.join(originalEnv.APPDATA, "opencode", "auth.json") : undefined,
    originalEnv.LOCALAPPDATA
      ? path.join(originalEnv.LOCALAPPDATA, "opencode", "auth.json")
      : undefined,
    originalEnv.XDG_CONFIG_HOME
      ? path.join(originalEnv.XDG_CONFIG_HOME, "opencode", "auth.json")
      : undefined,
    originalEnv.XDG_STATE_HOME
      ? path.join(originalEnv.XDG_STATE_HOME, "opencode", "auth.json")
      : undefined,
  ]);
}

export async function prepareManagedRuntime(): Promise<ManagedRuntime> {
  const rootDir = runtimeRoot();
  const homeDir = path.join(rootDir, "home");
  const configDir = path.join(rootDir, "config");
  const stateDir = path.join(rootDir, "state");
  const cacheDir = path.join(rootDir, "cache");
  const appDataDir = path.join(rootDir, "AppData", "Roaming");
  const localAppDataDir = path.join(rootDir, "AppData", "Local");
  const workspaceDir = path.join(rootDir, "workspace");

  await Promise.all(
    [homeDir, configDir, stateDir, cacheDir, appDataDir, localAppDataDir, workspaceDir].map(
      (dir) => fs.mkdir(dir, { recursive: true })
    )
  );

  const authDestinations = [
    path.join(configDir, "opencode", "auth.json"),
    path.join(stateDir, "opencode", "auth.json"),
    path.join(homeDir, ".config", "opencode", "auth.json"),
    path.join(homeDir, ".local", "share", "opencode", "auth.json"),
    path.join(appDataDir, "opencode", "auth.json"),
    path.join(localAppDataDir, "opencode", "auth.json"),
  ];

  for (const candidate of findAuthCandidates(process.env)) {
    if (await copyIfExists(candidate, authDestinations)) {
      break;
    }
  }

  const serverUsername = process.env.OPENCODE_SERVER_USERNAME || "opencode";
  const serverPassword =
    process.env.OPENCODE_SERVER_PASSWORD || crypto.randomBytes(24).toString("base64url");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_CONFIG_HOME: configDir,
    XDG_STATE_HOME: stateDir,
    XDG_CACHE_HOME: cacheDir,
    APPDATA: appDataDir,
    LOCALAPPDATA: localAppDataDir,
    OPENCODE_SERVER_USERNAME: serverUsername,
    OPENCODE_SERVER_PASSWORD: serverPassword,
  };

  return {
    rootDir,
    homeDir,
    configDir,
    stateDir,
    cacheDir,
    appDataDir,
    localAppDataDir,
    workspaceDir,
    serverUsername,
    serverPassword,
    env,
  };
}

function parseServerUrl(output: string) {
  const match = output.match(/opencode server listening on\s+(https?:\/\/[^\s]+)/i);
  return match?.[1];
}

export async function startManagedOpencodeServer() {
  if (managedServer) {
    return managedServer;
  }

  if (managedServerStart) {
    return managedServerStart;
  }

  managedServerStart = startManagedOpencodeServerProcess().finally(() => {
    managedServerStart = undefined;
  });

  return managedServerStart;
}

async function startManagedOpencodeServerProcess() {
  const runtime = await prepareManagedRuntime();
  const command = resolveOpenCodeCommand();
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const port = await selectOpenCodePort();
    try {
      return await launchManagedOpencodeServer(runtime, command, port);
    } catch (error) {
      lastError = error;
      if (!/Failed to start server on port|EADDRINUSE|address already in use/i.test(stringifyUnknown(error))) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(stringifyUnknown(lastError));
}

async function launchManagedOpencodeServer(runtime: ManagedRuntime, command: string, port: number) {
  const args = ["serve", "--hostname=127.0.0.1", `--port=${port}`];
  const child = spawn(command, args, {
    cwd: runtime.workspaceDir,
    env: runtime.env,
    shell: process.platform === "win32",
  });

  const url = await new Promise<string>((resolve, reject) => {
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      reject(new Error(`Timeout waiting for OpenCode server on port ${port}\n${output}`));
    }, Number(process.env.REPOVERA_OPENCODE_START_TIMEOUT_MS ?? 15_000));

    const appendOutput = (chunk: Buffer) => {
      output += chunk.toString();
      const parsedUrl = parseServerUrl(output);
      if (!parsedUrl || settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(parsedUrl);
    };

    child.stdout.on("data", appendOutput);
    child.stderr.on("data", appendOutput);
    child.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      if (settled) {
        if (managedServer?.process === child) {
          managedServer = undefined;
        }
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`OpenCode server exited with code ${code}\n${output}`));
    });
  });

  const basicAuth = Buffer.from(`${runtime.serverUsername}:${runtime.serverPassword}`).toString("base64");
  const client = createOpencodeClient({
    baseUrl: url,
    directory: runtime.workspaceDir,
    headers: {
      Authorization: `Basic ${basicAuth}`,
    },
  });

  const server = { runtime, port, url, process: child, client };
  managedServer = server;
  return server;
}

function isRequestError(result: unknown): result is { error: unknown; data: undefined } {
  return Boolean(result && typeof result === "object" && "error" in result && (result as { error?: unknown }).error);
}

function unwrapSdkData<T>(result: { data?: T; error?: unknown }, label: string): T {
  if (isRequestError(result)) {
    throw new Error(`${label} failed: ${stringifyUnknown(result.error)}`);
  }

  if (result.data === undefined) {
    throw new Error(`${label} returned no data`);
  }

  return result.data;
}

function stringifyUnknown(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function extractProviderErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return extractProviderErrorMessage(error.message);
  }

  const source = typeof error === "string" ? parseJsonObject(error) : error;
  const record = asRecord(source);
  if (!record) {
    return undefined;
  }

  const nestedError = asRecord(record.error);
  const message =
    typeof nestedError?.message === "string"
      ? nestedError.message
      : typeof record.message === "string"
        ? record.message
        : undefined;

  if (!message) {
    return undefined;
  }

  const code =
    typeof nestedError?.code === "string"
      ? nestedError.code
      : typeof record.code === "string"
        ? record.code
        : undefined;
  const type =
    typeof nestedError?.type === "string"
      ? nestedError.type
      : typeof record.type === "string"
        ? record.type
        : undefined;

  if (code === "server_error" || type === "server_error") {
    return `OpenAI server error: ${message}`;
  }

  return code || type ? `${code ?? type}: ${message}` : message;
}

function normalizeGatewayMessage(error: unknown) {
  return extractProviderErrorMessage(error) ?? stringifyUnknown(error);
}

export function formatGatewayAuthGuidance(error: unknown) {
  const message = normalizeGatewayMessage(error);
  if (
    /token refresh failed:\s*401/i.test(message) ||
    /providerautherror/i.test(message) ||
    /unauthorized/i.test(message)
  ) {
    return "OpenCode 인증이 만료되었습니다.\n터미널에서 `opencode auth login`을 실행한 뒤 다시 시도하세요.";
  }

  return message;
}

function normalizeProviderName(id: string, name?: string) {
  return name || id.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractModelVariants(model: { variants?: Record<string, unknown> }) {
  return Object.entries(model.variants ?? {})
    .filter(([, value]) => {
      if (!value || typeof value !== "object") {
        return true;
      }
      return (value as { disabled?: unknown }).disabled !== true;
    })
    .map(([key]) => key);
}

export async function queryOpenCodeProviders(client: OpencodeClient) {
  const [configProviders, providerList] = await Promise.all([
    client.config.providers(),
    client.provider.list(),
  ]);

  return {
    configured: unwrapSdkData(configProviders, "config.providers"),
    listed: unwrapSdkData(providerList, "provider.list"),
  };
}

export async function getOpenCodeCatalog(ttlMs = 60_000): Promise<OpenCodeCatalog> {
  const now = Date.now();
  if (cachedCatalog && cachedCatalog.expiresAt > now) {
    return cachedCatalog.value;
  }

  try {
    const { client } = await startManagedOpencodeServer();
    const { configured, listed } = await queryOpenCodeProviders(client);
    const connectedIds = new Set(listed.connected ?? []);
    const providersById = new Map((listed.all ?? []).map((provider) => [provider.id, provider]));
    const configuredById = new Map((configured.providers ?? []).map((provider) => [provider.id, provider]));
    const allProviderIds = new Set([...providersById.keys(), ...configuredById.keys()]);

    const providers: ProviderOption[] = [...allProviderIds].map((id) => {
      const provider = providersById.get(id) ?? configuredById.get(id);
      return {
        id,
        provider: id,
        name: normalizeProviderName(id, provider?.name),
        label: normalizeProviderName(id, provider?.name),
        source: provider?.source,
        connected: connectedIds.has(id),
        defaultModel: listed.default?.[id] ?? configured.default?.[id],
      };
    });

    const models: ModelOption[] = [];
    for (const providerOption of providers) {
      const provider = providersById.get(providerOption.id) ?? configuredById.get(providerOption.id);
      const providerModels = provider?.models ?? {};
      for (const [modelId, model] of Object.entries(providerModels)) {
        const capabilities = model.capabilities as typeof model.capabilities & { tool_call?: boolean };
        models.push({
          id: modelId,
          model: modelId,
          name: model.name ?? modelId,
          label: model.name ?? modelId,
          provider: providerOption.id,
          providerName: providerOption.name,
          connected: providerOption.connected,
          default: providerOption.defaultModel === modelId,
          capabilities: {
            reasoning: Boolean(capabilities?.reasoning),
            temperature: Boolean(capabilities?.temperature),
            attachment: Boolean(capabilities?.attachment),
            toolCall: Boolean(capabilities?.toolcall || capabilities?.tool_call),
            input: {
              text: capabilities?.input?.text !== false,
              image: Boolean(capabilities?.input?.image),
              audio: Boolean(capabilities?.input?.audio),
              video: Boolean(capabilities?.input?.video),
              pdf: Boolean(capabilities?.input?.pdf),
            },
          },
          limit: {
            context: Number(model.limit?.context ?? 0),
            output: Number(model.limit?.output ?? 0),
          },
          variants: extractModelVariants(model),
        });
      }
    }

    const connectedProviders = providers.filter((provider) => provider.connected);
    const connectedProviderIds = new Set(connectedProviders.map((provider) => provider.id));
    const connectedModels = models.filter(
      (model) => model.connected && connectedProviderIds.has(model.provider)
    );
    const defaultProvider =
      connectedProviders.find((provider) => provider.defaultModel)?.id ??
      connectedProviders.find((provider) => listed.default?.[provider.id])?.id ??
      connectedProviders[0]?.id;
    const defaultModel = defaultProvider
      ? {
          provider: defaultProvider,
          model:
            listed.default?.[defaultProvider] ??
            connectedProviders.find((provider) => provider.id === defaultProvider)?.defaultModel ??
            connectedModels.find((model) => model.provider === defaultProvider)?.model ??
            "",
        }
      : undefined;

    const value: OpenCodeCatalog = {
      providers: connectedProviders,
      models: connectedModels,
      defaultModel: defaultModel?.model ? defaultModel : undefined,
      connected: connectedProviders.length > 0,
      cachedAt: new Date().toISOString(),
    };
    cachedCatalog = { expiresAt: now + ttlMs, value };
    return value;
  } catch (error) {
    const fallback = fallbackCatalog(formatGatewayAuthGuidance(error));
    cachedCatalog = { expiresAt: now + 10_000, value: fallback };
    return fallback;
  }
}

function fallbackCatalog(error?: string): OpenCodeCatalog {
  return {
    providers: [],
    models: [],
    connected: false,
    cachedAt: new Date().toISOString(),
    error,
  };
}

function buildContextBlock(attachments: ContextAttachment[]) {
  const textAttachments = attachments.filter((attachment) => !isMediaAttachmentType(attachment.type));

  if (!textAttachments.length) {
    return "";
  }

  return textAttachments
    .map((attachment, index) => {
      return [
        `<context_file index="${index + 1}" name="${attachment.name}" type="${attachment.type}" tokens="${attachment.tokenCount}">`,
        attachment.content,
        "</context_file>",
      ].join("\n");
    })
    .join("\n\n");
}

function buildMediaContextBlock(attachments: ContextAttachment[]) {
  const mediaAttachments = attachments.filter((attachment) => isMediaAttachmentType(attachment.type));

  if (!mediaAttachments.length) {
    return "";
  }

  return mediaAttachments
    .map((attachment, index) => {
      return `<media_file index="${index + 1}" name="${attachment.name}" type="${attachment.type}" mime="${attachment.mimeType ?? "application/octet-stream"}" size_bytes="${attachment.sizeBytes}" />`;
    })
    .join("\n");
}

function buildRunSettingsBlock(settings: RunSettings) {
  return [
    "Run settings:",
    `- model_variant: ${settings.modelVariant || "opencode-default"}`,
    `- shell_tool: ${settings.codeExecution}`,
    `- url_fetch: ${settings.urlContext}`,
  ].join("\n");
}

function buildPrompt(playground: Playground) {
  const contextBlock = buildContextBlock(playground.attachments);
  const mediaContextBlock = buildMediaContextBlock(playground.attachments);
  const userTask =
    playground.prompt.trim() ||
    "Analyze the attached context and provide a concise, useful Markdown response.";
  return [
    contextBlock ? "<attached_context>" : "",
    contextBlock,
    contextBlock ? "</attached_context>" : "",
    mediaContextBlock ? "<attached_media>" : "",
    mediaContextBlock,
    mediaContextBlock ? "</attached_media>" : "",
    "<user_task>",
    userTask,
    "</user_task>",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildPromptParts(playground: Playground) {
  const mediaParts = playground.attachments
    .filter((attachment) => isMediaAttachmentType(attachment.type) && attachment.content)
    .map((attachment) => ({
      type: "file" as const,
      mime: attachment.mimeType || mimeTypeFromDataUrl(attachment.content) || fallbackMimeType(attachment.type),
      filename: attachment.name,
      url: attachment.content,
    }));

  return [
    { type: "text" as const, text: buildPrompt(playground) },
    ...mediaParts,
  ];
}

function isMediaAttachmentType(type: ContextAttachment["type"]) {
  return type === "image" || type === "audio" || type === "video" || type === "pdf";
}

function mimeTypeFromDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+)[;,]/);
  return match?.[1];
}

function fallbackMimeType(type: ContextAttachment["type"]) {
  if (type === "audio") {
    return "audio/mpeg";
  }

  if (type === "video") {
    return "video/mp4";
  }

  if (type === "pdf") {
    return "application/pdf";
  }

  return "image/png";
}

function buildSystem(playground: Playground) {
  return [
    playground.systemInstruction?.trim(),
    "You are running inside a large-context opencode-aistudio playground. Analyze only the attached context and the user task unless the user asks otherwise.",
    "Keep internal reasoning separate from final Markdown output when the model exposes reasoning parts.",
    buildRunSettingsBlock(playground.runSettings),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function toolsForSettings(settings: RunSettings) {
  return {
    bash: settings.codeExecution,
    webfetch: settings.urlContext,
  };
}

function channelForPartType(type?: string, field?: string): "thoughts" | "final" {
  if (type === "reasoning" || field?.toLowerCase().includes("reason")) {
    return "thoughts";
  }

  return "final";
}

function textLimitForChannel(channel: "thoughts" | "final") {
  return channel === "thoughts" ? GATEWAY_THOUGHTS_TEXT_LIMIT : GATEWAY_FINAL_TEXT_LIMIT;
}

function limitRetainedText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const retainedLength = Math.max(0, maxLength - GATEWAY_TRIM_NOTICE.length);
  return `${value.slice(0, retainedLength)}${GATEWAY_TRIM_NOTICE}`;
}

function appendRetainedText(previous: string, delta: string, maxLength: number) {
  if (previous.length >= maxLength) {
    return {
      retainedText: previous,
      streamedDelta: "",
    };
  }

  const remaining = Math.max(0, maxLength - previous.length);
  return {
    retainedText: limitRetainedText(`${previous}${delta}`, maxLength),
    streamedDelta: delta.slice(0, remaining),
  };
}

function sessionIdForEvent(event: OpenCodeEvent) {
  const rawEvent = event as unknown as {
    type?: string;
    data?: { sessionID?: unknown };
    properties?: { sessionID?: unknown };
  };

  if ("properties" in event && event.properties && "sessionID" in event.properties) {
    return String(event.properties.sessionID);
  }

  if (rawEvent.type === "sync" && rawEvent.data && "sessionID" in rawEvent.data) {
    return String(rawEvent.data.sessionID);
  }

  return undefined;
}

function messageRoleUpdateForEvent(event: OpenCodeEvent): { messageID: string; role: OpenCodeMessageRole } | undefined {
  const rawEvent = event as unknown as {
    type?: string;
    name?: string;
    data?: { info?: { id?: unknown; role?: unknown } };
  };

  if (event.type === "message.updated") {
    const role = event.properties.info.role;
    if (role !== "user" && role !== "assistant") {
      return undefined;
    }

    return {
      messageID: event.properties.info.id,
      role,
    };
  }

  if (rawEvent.type === "sync" && rawEvent.name === "message.updated.1") {
    const info = rawEvent.data?.info;
    if (typeof info.id === "string" && (info.role === "user" || info.role === "assistant")) {
      return {
        messageID: info.id,
        role: info.role,
      };
    }
  }

  return undefined;
}

function textPartUpdateForEvent(event: OpenCodeEvent): TextLikePart | undefined {
  const rawEvent = event as unknown as {
    type?: string;
    name?: string;
    data?: { part?: unknown };
  };
  const part = event.type === "message.part.updated"
    ? event.properties.part
    : rawEvent.type === "sync" && rawEvent.name === "message.part.updated.1"
      ? rawEvent.data?.part
      : undefined;

  const textPart = part as Partial<TextLikePart> | undefined;
  if (
    !textPart ||
    (textPart.type !== "text" && textPart.type !== "reasoning") ||
    typeof textPart.id !== "string" ||
    typeof textPart.messageID !== "string" ||
    typeof textPart.text !== "string"
  ) {
    return undefined;
  }

  return {
    id: textPart.id,
    messageID: textPart.messageID,
    type: textPart.type,
    text: textPart.text,
    ignored: textPart.ignored,
  };
}

function textPartDeltaForEvent(event: OpenCodeEvent): TextPartDelta | undefined {
  if (event.type !== "message.part.delta") {
    return undefined;
  }

  const { messageID, partID, field, delta } = event.properties;
  if (field !== "text" && !field.toLowerCase().includes("reason")) {
    return undefined;
  }

  return { messageID, partID, field, delta };
}

function extractSessionError(event: OpenCodeEvent) {
  if (event.type !== "session.error") {
    return undefined;
  }

  const error = event.properties.error;
  if (!error) {
    return "OpenCode session failed";
  }

  if ("data" in error && error.data && typeof error.data === "object" && "message" in error.data) {
    return String(error.data.message);
  }

  return stringifyUnknown(error);
}

async function runCustomCommandFallback({
  playground,
  timeoutMs = DEFAULT_GATEWAY_TIMEOUT_MS,
  onStart,
  onDelta,
}: CollectStreamingPromptResponseOptions): Promise<CollectStreamingPromptResponseResult> {
  const command = process.env.REPOVERA_OPENCODE_COMMAND;
  if (!command) {
    throw new Error("REPOVERA_OPENCODE_COMMAND is not configured");
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  onStart?.({ runId });

  const prompt = [buildSystem(playground), buildPrompt(playground)].join("\n\n");
  let finalText = "";
  let errorText = "";

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      cwd: PROJECT_ROOT,
      env: process.env,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Custom command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      const next = appendRetainedText(finalText, text, GATEWAY_FINAL_TEXT_LIMIT);
      finalText = next.retainedText;
      if (next.streamedDelta) {
        onDelta?.({ channel: "final", text: next.streamedDelta });
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorText += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code && code !== 0) {
        reject(new Error(errorText || `Custom command exited with code ${code}`));
        return;
      }
      resolve();
    });
    child.stdin.end(prompt);
  });

  return {
    id: runId,
    playgroundId: playground.id,
    status: "completed",
    thoughtsText: "",
    finalText,
    partial: false,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

export async function collectStreamingPromptResponse({
  playground,
  timeoutMs = DEFAULT_GATEWAY_TIMEOUT_MS,
  onStart,
  onDelta,
  onError,
}: CollectStreamingPromptResponseOptions): Promise<CollectStreamingPromptResponseResult> {
  if (process.env.REPOVERA_OPENCODE_COMMAND) {
    return runCustomCommandFallback({ playground, timeoutMs, onStart, onDelta, onError });
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const messageRoles = new Map<string, OpenCodeMessageRole>();
  const pendingPartUpdates = new Map<string, TextLikePart>();
  let pendingPartDeltas: TextPartDelta[] = [];
  const partTypes = new Map<string, string>();
  const thoughtParts = new Map<string, string>();
  const finalParts = new Map<string, string>();
  let sessionId: string | undefined;
  let capturedError: string | undefined;

  try {
    const { client, runtime } = await startManagedOpencodeServer();
    const sessionResult = await client.session.create({
      title: `opencode-aistudio Run ${new Date().toLocaleString()}`,
      directory: runtime.workspaceDir,
    });
    const session = unwrapSdkData(sessionResult, "session.create");
    sessionId = session.id;
    onStart?.({ runId, sessionId });

    const abortController = new AbortController();
    const subscription = await client.event.subscribe(
      { directory: runtime.workspaceDir },
      { signal: abortController.signal, sseMaxRetryAttempts: 1 }
    );

    const promptCompletion = client.session.promptAsync({
      sessionID: session.id,
      directory: runtime.workspaceDir,
      model:
        playground.provider && playground.model
          ? {
              providerID: playground.provider,
              modelID: playground.model,
            }
          : undefined,
      system: buildSystem(playground),
      variant: playground.runSettings.modelVariant || undefined,
      tools: toolsForSettings(playground.runSettings),
      format: { type: "text" },
      parts: buildPromptParts(playground),
    });

    const applyDelta = (partId: string, nextText: string, channel: "thoughts" | "final") => {
      const target = channel === "thoughts" ? thoughtParts : finalParts;
      const previous = target.get(partId) ?? "";
      const limit = textLimitForChannel(channel);
      const rawDelta = nextText.startsWith(previous) ? nextText.slice(previous.length) : nextText;
      const next = appendRetainedText(previous, rawDelta, limit);
      const delta = next.streamedDelta;
      target.set(partId, next.retainedText);
      if (delta) {
        onDelta?.({ channel, text: delta });
      }
    };

    const processPartUpdate = (part: TextLikePart) => {
      const messageRole = messageRoles.get(part.messageID);
      if (messageRole !== "assistant") {
        if (!messageRole) {
          pendingPartUpdates.set(part.id, part);
        }
        return;
      }

      if (part.ignored) {
        return;
      }

      const providerError = extractProviderErrorMessage(part.text);
      if (providerError) {
        capturedError = formatGatewayAuthGuidance(part.text);
        onError?.(capturedError);
        return;
      }
      partTypes.set(part.id, part.type);
      applyDelta(part.id, part.text, channelForPartType(part.type));
    };

    const processPartDelta = (partDelta: TextPartDelta) => {
      const messageRole = messageRoles.get(partDelta.messageID);
      if (messageRole !== "assistant") {
        if (!messageRole) {
          pendingPartDeltas.push(partDelta);
        }
        return;
      }

      const channel = channelForPartType(partTypes.get(partDelta.partID), partDelta.field);
      const target = channel === "thoughts" ? thoughtParts : finalParts;
      const previous = target.get(partDelta.partID) ?? "";
      const next = appendRetainedText(previous, partDelta.delta, textLimitForChannel(channel));
      const nextText = next.retainedText;
      const providerError = extractProviderErrorMessage(nextText);
      if (providerError) {
        target.delete(partDelta.partID);
        capturedError = formatGatewayAuthGuidance(nextText);
        onError?.(capturedError);
        return;
      }
      target.set(partDelta.partID, nextText);
      if (next.streamedDelta) {
        onDelta?.({ channel, text: next.streamedDelta });
      }
    };

    const recordMessageRole = (messageID: string, role: OpenCodeMessageRole) => {
      messageRoles.set(messageID, role);

      if (role !== "assistant") {
        for (const [partId, part] of pendingPartUpdates) {
          if (part.messageID === messageID) {
            pendingPartUpdates.delete(partId);
          }
        }
        pendingPartDeltas = pendingPartDeltas.filter((partDelta) => partDelta.messageID !== messageID);
        return;
      }

      for (const [partId, part] of pendingPartUpdates) {
        if (part.messageID === messageID) {
          pendingPartUpdates.delete(partId);
          processPartUpdate(part);
        }
      }

      const remainingDeltas: TextPartDelta[] = [];
      for (const partDelta of pendingPartDeltas) {
        if (partDelta.messageID === messageID) {
          processPartDelta(partDelta);
        } else {
          remainingDeltas.push(partDelta);
        }
      }
      pendingPartDeltas = remainingDeltas;
    };

    const handleEvent = (event: OpenCodeEvent) => {
      const eventSessionId = sessionIdForEvent(event);
      if (eventSessionId && eventSessionId !== session.id) {
        return;
      }

      if (event.type === "session.error") {
        capturedError = formatGatewayAuthGuidance(extractSessionError(event));
        onError?.(capturedError);
        return;
      }

      const messageRole = messageRoleUpdateForEvent(event);
      if (messageRole) {
        recordMessageRole(messageRole.messageID, messageRole.role);
        return;
      }

      const partUpdate = textPartUpdateForEvent(event);
      if (partUpdate) {
        processPartUpdate(partUpdate);
        return;
      }

      const partDelta = textPartDeltaForEvent(event);
      if (partDelta) {
        processPartDelta(partDelta);
      }
    };

    const completion = await waitForStreamCompletion({
      stream: subscription.stream,
      promptCompletion,
      sessionId: session.id,
      timeoutMs,
      onEvent: handleEvent,
    }).finally(() => abortController.abort());

    const promptResult = await promptCompletion.catch((error) => {
      capturedError = formatGatewayAuthGuidance(error);
      onError?.(capturedError);
      return undefined;
    });
    if (promptResult && isRequestError(promptResult)) {
      capturedError = formatGatewayAuthGuidance(promptResult.error);
      onError?.(capturedError);
    }

    const thoughtsText = finalizeGatewayResponses(thoughtParts);
    const finalText = finalizeGatewayResponses(finalParts);
    const finalTextProviderError = extractProviderErrorMessage(finalText);
    if (finalTextProviderError && !capturedError) {
      capturedError = formatGatewayAuthGuidance(finalText);
      onError?.(capturedError);
    }
    const cleanFinalText = finalTextProviderError ? "" : finalText;
    const hasPartialText = Boolean(thoughtsText || cleanFinalText);

    return {
      id: runId,
      playgroundId: playground.id,
      sessionId,
      status: capturedError ? "failed" : "completed",
      thoughtsText,
      finalText: cleanFinalText,
      error: capturedError,
      partial: Boolean(hasPartialText && (capturedError || completion.partial)),
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = formatGatewayAuthGuidance(error);
    onError?.(message);
    const thoughtsText = finalizeGatewayResponses(thoughtParts);
    const finalText = finalizeGatewayResponses(finalParts);
    const finalTextProviderError = extractProviderErrorMessage(finalText);
    return {
      id: runId,
      playgroundId: playground.id,
      sessionId,
      status: "failed",
      thoughtsText,
      finalText: finalTextProviderError ? "" : finalText,
      error: finalTextProviderError ? formatGatewayAuthGuidance(finalText) : message,
      partial: Boolean(thoughtsText || (finalTextProviderError ? "" : finalText)),
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}
