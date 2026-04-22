import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CatalogPayload,
  ContextAttachment,
  Playground,
  RunResult,
  RunSettings,
  createId,
  classifyAttachmentType,
  estimateTokens,
  isMediaAttachmentType,
  modelSupportsAttachmentType,
  normalizeModelLabel,
  unsupportedMediaAttachments,
} from "../../lib/playground";
import {
  deleteHistoryRun,
  fetchCatalog,
  fetchHistory,
  fetchHistoryRun,
  runPlayground as runPlaygroundRequest,
} from "../../lib/playgroundApi";
import { useI18n, type TranslationKey } from "../../lib/i18n";

type CatalogState = {
  status: "loading" | "ready" | "fallback";
  error?: string;
};

const now = () => new Date().toISOString();

const emptyCatalog: CatalogPayload = {
  models: [],
  providers: [],
};

const defaultSettings: RunSettings = {
  modelVariant: "",
  codeExecution: false,
  urlContext: false,
};
const RECENT_MODEL_STORAGE_KEY = "repovera-recent-model";
const CLIENT_FINAL_TEXT_LIMIT = 120_000;
const CLIENT_THOUGHTS_TEXT_LIMIT = 60_000;
const CLIENT_HISTORY_ATTACHMENT_LIMIT = 120_000;
const CLIENT_TRIM_NOTICE = "\n\n[Trimmed to reduce memory use.]";

type RecentModelSelection = {
  provider: string;
  model: string;
};

function normalizeRunSettings(settings: Partial<RunSettings> | undefined): RunSettings {
  return {
    ...defaultSettings,
    modelVariant: typeof settings?.modelVariant === "string" ? settings.modelVariant : "",
    codeExecution: Boolean(settings?.codeExecution),
    urlContext: Boolean(settings?.urlContext),
  };
}

function normalizePlayground(playground: Playground): Playground {
  return {
    ...playground,
    runSettings: normalizeRunSettings(playground.runSettings),
  };
}

function normalizeRunForClient(run: RunResult): RunResult {
  const rawFinalText = run.finalText ?? "";
  const rawThoughtsText = run.thoughtsText ?? "";
  const finalText = stripEchoedPrompt(limitText(rawFinalText, CLIENT_FINAL_TEXT_LIMIT));
  const thoughtsText = limitText(rawThoughtsText, CLIENT_THOUGHTS_TEXT_LIMIT);
  const outputTruncated = run.outputTruncated || finalText.length < rawFinalText.length;
  const thoughtsTruncated = run.thoughtsTruncated || thoughtsText.length < rawThoughtsText.length;

  return {
    ...run,
    finalText,
    thoughtsText,
    partial: run.partial || outputTruncated || thoughtsTruncated,
    outputTruncated,
    thoughtsTruncated,
    playground: run.playground ? normalizePlaygroundForHistory(run.playground) : run.playground,
  };
}

function normalizePlaygroundForHistory(playground: Playground): Playground {
  return normalizePlayground({
    ...playground,
    prompt: limitText(playground.prompt, CLIENT_HISTORY_ATTACHMENT_LIMIT),
    systemInstruction: limitText(playground.systemInstruction ?? "", CLIENT_HISTORY_ATTACHMENT_LIMIT),
    attachments: playground.attachments.map((attachment) => {
      const content = limitText(attachment.content, CLIENT_HISTORY_ATTACHMENT_LIMIT);
      return {
        ...attachment,
        content,
        contentTruncated: attachment.contentTruncated || content.length < attachment.content.length,
      };
    }),
  });
}

function limitText(value: string | undefined, maxLength: number) {
  const text = value ?? "";
  if (text.length <= maxLength) {
    return text;
  }

  const suffix = CLIENT_TRIM_NOTICE;
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

function appendWithLimit(current: string, delta: string, maxLength: number) {
  if (current.length >= maxLength) {
    return { text: current, truncated: true };
  }

  const next = `${current}${delta}`;
  if (next.length <= maxLength) {
    return { text: next, truncated: false };
  }

  return {
    text: limitText(next, maxLength),
    truncated: true,
  };
}

function onlyAuthenticatedCatalog(catalog: CatalogPayload): CatalogPayload {
  const providers = catalog.providers.filter((item) => item.connected);
  const providerIds = new Set(providers.map((item) => item.provider));
  const models = catalog.models.filter((item) => item.connected && providerIds.has(item.provider));
  const defaultModel =
    catalog.defaultModel && models.some((item) => (
      item.provider === catalog.defaultModel?.provider && item.model === catalog.defaultModel?.model
    ))
      ? catalog.defaultModel
      : models.find((item) => item.default) ?? models[0];

  return {
    ...catalog,
    providers,
    models,
    defaultModel: defaultModel
      ? {
          provider: defaultModel.provider,
          model: defaultModel.model,
        }
      : undefined,
  };
}

function createEmptyPlayground(): Playground {
  const createdAt = now();
  return {
    id: createId("playground"),
    title: "Untitled Playground",
    createdAt,
    updatedAt: createdAt,
    model: "",
    provider: "",
    systemInstruction: "",
    prompt: "",
    attachments: [],
    runSettings: defaultSettings,
  };
}

function readRecentModelSelection(): RecentModelSelection | null {
  try {
    const raw = localStorage.getItem(RECENT_MODEL_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<RecentModelSelection>;
    if (typeof parsed.provider === "string" && typeof parsed.model === "string") {
      return {
        provider: parsed.provider,
        model: parsed.model,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function writeRecentModelSelection(provider: string, model: string) {
  if (!provider || !model) {
    return;
  }

  localStorage.setItem(RECENT_MODEL_STORAGE_KEY, JSON.stringify({ provider, model }));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

export function usePlaygroundController() {
  const { t } = useI18n();
  const [playground, setPlayground] = useState<Playground>(createEmptyPlayground);
  const [history, setHistory] = useState<RunResult[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [currentRun, setCurrentRun] = useState<RunResult | null>(null);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [attachmentNotice, setAttachmentNotice] = useState<string>("");
  const [catalog, setCatalog] = useState<CatalogPayload>(emptyCatalog);
  const [catalogState, setCatalogState] = useState<CatalogState>({ status: "loading" });

  const runControllerRef = useRef<AbortController | null>(null);
  const catalogAppliedRef = useRef(false);
  const playgroundRef = useRef(playground);
  const selectedRunIdRef = useRef(selectedRunId);

  useEffect(() => {
    playgroundRef.current = playground;
  }, [playground]);

  useEffect(() => {
    selectedRunIdRef.current = selectedRunId;
  }, [selectedRunId]);

  useEffect(() => {
    writeRecentModelSelection(playground.provider, playground.model);
  }, [playground.model, playground.provider]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function load() {
      const [catalogResult, historyResult] = await Promise.allSettled([
        fetchCatalog(controller.signal),
        fetchHistory(controller.signal),
      ]);

      if (!active) {
        return;
      }

      if (catalogResult.status === "fulfilled") {
        const payload = onlyAuthenticatedCatalog(catalogResult.value);
        const error = payload.error ? normalizeGatewayError(payload.error, t) : undefined;
        setCatalog(error ? { ...payload, error } : payload);
        setCatalogState({
          status: error ? "fallback" : "ready",
          error,
        });

        if (!catalogAppliedRef.current) {
          const recentModel = readRecentModelSelection();
          const recentModelExists = recentModel
            ? payload.models.some(
                (item) => item.provider === recentModel.provider && item.model === recentModel.model,
              )
            : false;
          const preferredModel =
            recentModel && recentModelExists
              ? recentModel
              : payload.defaultModel ?? payload.models.find((item) => item.default) ?? payload.models[0];

          if (preferredModel) {
            setPlayground((prev) => ({
              ...prev,
              provider: preferredModel.provider,
              model: preferredModel.model,
              runSettings: {
                ...prev.runSettings,
                modelVariant: "",
              },
            }));
          }
          catalogAppliedRef.current = true;
        }
      } else {
        setCatalog(emptyCatalog);
        setCatalogState({
          status: "fallback",
          error: t("errors.catalogUnavailable"),
        });
      }

      if (historyResult.status === "fulfilled" && historyResult.value.length > 0) {
        const normalizedHistory = historyResult.value.map(normalizeRunForClient);
        setHistory(normalizedHistory);
        setSelectedRunId(historyResult.value[0].id);
      } else if (historyResult.status === "rejected") {
        setHistory([]);
        setSelectedRunId("");
      } else {
        setHistory([]);
        setSelectedRunId("");
      }
    }

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [t]);

  const selectedHistoryRun = useMemo(
    () => history.find((item) => item.id === selectedRunId) ?? null,
    [history, selectedRunId],
  );

  const displayedRun = currentRun ?? selectedHistoryRun ?? null;

  useEffect(() => {
    if (!selectedHistoryRun?.compact || currentRun) {
      return;
    }

    const controller = new AbortController();
    void fetchHistoryRun(selectedHistoryRun.id, controller.signal)
      .then((entry) => {
        const normalized = normalizeRunForClient(entry);
        setHistory((previous) => previous.map((item) => (item.id === normalized.id ? normalized : item)));

        if (selectedRunIdRef.current === normalized.id && normalized.playground) {
          setPlayground(normalizePlayground(normalized.playground));
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [currentRun, selectedHistoryRun?.compact, selectedHistoryRun?.id]);

  const totalTokens = useMemo(() => {
    const attachmentTokens = playground.attachments.reduce((sum, attachment) => sum + attachment.tokenCount, 0);
    const promptTokens = estimateTokens(playground.prompt);
    const systemTokens = estimateTokens(playground.systemInstruction ?? "");
    return attachmentTokens + promptTokens + systemTokens;
  }, [playground.attachments, playground.prompt, playground.systemInstruction]);

  const modelOptions = useMemo(() => {
    return catalog.models;
  }, [catalog.models]);

  const providerOptions = useMemo(() => {
    return catalog.providers;
  }, [catalog.providers]);

  const providerNames = useMemo(() => {
    const values = providerOptions.map((item) => item.provider);
    return Array.from(new Set(values));
  }, [providerOptions]);

  const modelOptionsForProvider = useMemo(() => {
    const matches = modelOptions.filter((item) => item.provider === playground.provider);
    return matches.length > 0 ? matches : modelOptions;
  }, [modelOptions, playground.provider]);

  const currentModel = useMemo(() => {
    return modelOptions.find((item) => item.provider === playground.provider && item.model === playground.model);
  }, [modelOptions, playground.model, playground.provider]);

  const updatePlayground = useCallback((updater: (previous: Playground) => Playground) => {
    setPlayground((previous) => ({
      ...updater(previous),
      updatedAt: now(),
    }));
  }, []);

  const setPrompt = useCallback(
    (value: string) => {
      const previousValue = playgroundRef.current.prompt;
      if (value !== previousValue) {
        setCurrentRun((run) => (run?.status === "running" ? run : null));
        setSelectedRunId("");
      }
      updatePlayground((previous) => ({ ...previous, prompt: value }));
    },
    [updatePlayground],
  );

  const setTitle = useCallback(
    (value: string) => {
      updatePlayground((previous) => ({ ...previous, title: value }));
    },
    [updatePlayground],
  );

  const setSystemInstruction = useCallback(
    (value: string) => {
      updatePlayground((previous) => ({ ...previous, systemInstruction: value }));
    },
    [updatePlayground],
  );

  const setProvider = useCallback(
    (provider: string) => {
      updatePlayground((previous) => {
        const providerModels = modelOptions.filter((item) => item.provider === provider);
        const nextModel = providerModels.find((item) => item.model === previous.model) ?? providerModels[0];
        if (nextModel) {
          writeRecentModelSelection(provider, nextModel.model);
        }

        return {
          ...previous,
          provider,
          model: nextModel?.model ?? previous.model,
          runSettings: {
            ...previous.runSettings,
            modelVariant: "",
          },
        };
      });
    },
    [modelOptions, updatePlayground],
  );

  const setModel = useCallback(
    (model: string) => {
      updatePlayground((previous) => ({
        ...previous,
        model,
        runSettings: {
          ...previous.runSettings,
          modelVariant: "",
        },
      }));
      writeRecentModelSelection(playgroundRef.current.provider, model);
    },
    [updatePlayground],
  );

  const setRunSettings = useCallback(
    <K extends keyof RunSettings>(key: K, value: RunSettings[K]) => {
      updatePlayground((previous) => ({
        ...previous,
        runSettings: {
          ...previous.runSettings,
          [key]: value,
        },
      }));
    },
    [updatePlayground],
  );

  const createNewChat = useCallback(() => {
    runControllerRef.current?.abort();
    const createdAt = now();

    setPlayground((previous) => ({
      ...previous,
      id: createId("playground"),
      title: "Untitled Playground",
      createdAt,
      updatedAt: createdAt,
      prompt: "",
      attachments: [],
    }));
    setCurrentRun(null);
    setSelectedRunId("");
    setSelectedAttachmentId(null);
    setAttachmentNotice("");
  }, []);

  const updateHistoryEntry = useCallback((entry: RunResult, replaceId = entry.id) => {
    const entryWithPlayground = normalizeRunForClient(
      entry.playground
        ? entry
        : { ...entry, playground: playgroundRef.current },
    );
    setHistory((previous) => [
      entryWithPlayground,
      ...previous.filter((item) => item.id !== replaceId && item.id !== entryWithPlayground.id),
    ]);
  }, []);

  const appendAttachment = useCallback((attachment: ContextAttachment) => {
    updatePlayground((previous) => ({
      ...previous,
      attachments: [...previous.attachments, attachment],
    }));
    setSelectedAttachmentId(attachment.id);
  }, [updatePlayground]);

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      updatePlayground((previous) => ({
        ...previous,
        attachments: previous.attachments.filter((attachment) => attachment.id !== attachmentId),
      }));

      setSelectedAttachmentId((current) => (current === attachmentId ? null : current));
    },
    [updatePlayground],
  );

  const handleFilesSelected = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) {
        return;
      }

      const selectedModel = modelOptions.find(
        (item) => item.provider === playgroundRef.current.provider && item.model === playgroundRef.current.model,
      );
      const skippedFiles: string[] = [];
      const attachments = await Promise.all(
        list.map(async (file) => {
          const initialType = classifyAttachmentType(file.name, "", file.type);
          const isMedia = isMediaAttachmentType(initialType);
          if (isMedia && !modelSupportsAttachmentType(selectedModel, initialType)) {
            skippedFiles.push(file.name || initialType);
            return null;
          }

          let content = "";

          try {
            content = isMedia ? await readFileAsDataUrl(file) : await file.text();
          } catch {
            content = "";
          }

          const attachmentType = isMedia ? initialType : classifyAttachmentType(file.name, content, file.type);

          const attachment: ContextAttachment = {
            id: createId("attachment"),
            name: file.name,
            type: attachmentType,
            sizeBytes: file.size,
            tokenCount: isMedia ? 0 : estimateTokens(content),
            content,
            mimeType: file.type || undefined,
            createdAt: now(),
          };

          return attachment;
        }),
      );

      const validAttachments = attachments.filter((attachment): attachment is ContextAttachment => Boolean(attachment));
      validAttachments.forEach(appendAttachment);

      if (skippedFiles.length > 0) {
        setAttachmentNotice(`${t("attachments.unsupportedMedia")}: ${skippedFiles.join(", ")}`);
      } else if (validAttachments.length > 0) {
        setAttachmentNotice("");
      }
    },
    [appendAttachment, modelOptions, t],
  );

  const finalizeRun = useCallback(
    (result: RunResult, replaceId = result.id) => {
      setCurrentRun(null);
      setSelectedRunId(result.id);
      updateHistoryEntry(result, replaceId);
    },
    [updateHistoryEntry],
  );

  const showTransientRun = useCallback((result: RunResult) => {
    const normalized = normalizeRunForClient(result);
    setCurrentRun(normalized);
    setSelectedRunId(normalized.id);
  }, []);

  const run = useCallback(async () => {
    if (currentRun?.status === "running") {
      return;
    }

    if (!playgroundRef.current.prompt.trim() && playgroundRef.current.attachments.length === 0) {
      const failedRun: RunResult = {
        id: createId("run"),
        playgroundId: playgroundRef.current.id,
        status: "failed",
        thoughtsText: "",
        finalText: "",
        error: t("errors.inputRequired"),
        partial: false,
        startedAt: now(),
        completedAt: now(),
      };
      showTransientRun(failedRun);
      return;
    }

    const selectedModel = modelOptions.find(
      (item) => item.provider === playgroundRef.current.provider && item.model === playgroundRef.current.model,
    );
    const contextLimit = selectedModel?.limit?.context ?? 0;
    const currentTokenEstimate =
      playgroundRef.current.attachments.reduce((sum, attachment) => sum + attachment.tokenCount, 0) +
      estimateTokens(playgroundRef.current.prompt) +
      estimateTokens(playgroundRef.current.systemInstruction ?? "");
    if (contextLimit > 0 && currentTokenEstimate > contextLimit) {
      setAttachmentNotice(
        `Context is too large: ${currentTokenEstimate.toLocaleString()} / ${contextLimit.toLocaleString()} tokens. Remove or split attachments before running.`,
      );
      return;
    }

    const unsupportedAttachments = unsupportedMediaAttachments(playgroundRef.current.attachments, selectedModel);
    if (unsupportedAttachments.length > 0) {
      setAttachmentNotice(
        `${t("attachments.unsupportedMedia")}: ${unsupportedAttachments.map((attachment) => attachment.name).join(", ")}`,
      );
      return;
    }

    runControllerRef.current?.abort();
    const controller = new AbortController();
    runControllerRef.current = controller;

    const startedAt = now();
    const tempId = createId("run");

    const pending: RunResult = {
      id: tempId,
      playgroundId: playgroundRef.current.id,
      status: "running",
      thoughtsText: "",
      finalText: "",
      partial: false,
      startedAt,
    };

    setCurrentRun(pending);
    setSelectedRunId(tempId);

    let hasStreamedContent = false;
    const streamState = {
      thoughtsText: "",
      finalText: "",
      thoughtsTruncated: false,
      finalTruncated: false,
    };

    try {
      let finalized = false;
      let streamError = "";

      await runPlaygroundRequest(
        {
          ...playgroundRef.current,
          updatedAt: startedAt,
        },
        (event) => {
          if (finalized) {
            return;
          }

          if (event.type === "start") {
            return;
          }

          if (event.type === "delta") {
            if (event.data.channel === "thoughts") {
              const next = appendWithLimit(streamState.thoughtsText, event.data.text, CLIENT_THOUGHTS_TEXT_LIMIT);
              streamState.thoughtsText = next.text;
              streamState.thoughtsTruncated = streamState.thoughtsTruncated || next.truncated;
            } else {
              const next = appendWithLimit(streamState.finalText, event.data.text, CLIENT_FINAL_TEXT_LIMIT);
              streamState.finalText = next.text;
              streamState.finalTruncated = streamState.finalTruncated || next.truncated;
            }

            hasStreamedContent = true;
            const nextValue: RunResult = {
              ...pending,
              thoughtsText: streamState.thoughtsText,
              finalText: streamState.finalText,
              partial: streamState.thoughtsTruncated || streamState.finalTruncated,
              thoughtsTruncated: streamState.thoughtsTruncated,
              outputTruncated: streamState.finalTruncated,
            };
            setCurrentRun(nextValue);
            return;
          }

          if (event.type === "error") {
            const message = normalizeGatewayError(event.data, t) ?? t("errors.unknownGateway");
            streamError = message;
            const finalText = extractProviderErrorMessage(streamState.finalText) ? "" : streamState.finalText;
            const failedRun: RunResult = {
              ...pending,
              status: "failed",
              thoughtsText: streamState.thoughtsText,
              finalText,
              error: message,
              partial: Boolean(finalText || streamState.thoughtsText || streamState.thoughtsTruncated || streamState.finalTruncated),
              thoughtsTruncated: streamState.thoughtsTruncated,
              outputTruncated: streamState.finalTruncated,
              completedAt: now(),
            };
            setCurrentRun(failedRun);
            return;
          }

          if (event.type === "done") {
            const doneRun = normalizeRunForClient({
              ...event.data,
              thoughtsText: event.data.thoughtsText || streamState.thoughtsText,
              finalText: event.data.finalText,
              partial:
                streamState.thoughtsTruncated ||
                streamState.finalTruncated ||
                (event.data.status === "completed" && !event.data.error ? false : event.data.partial),
              thoughtsTruncated: streamState.thoughtsTruncated || event.data.thoughtsTruncated,
              outputTruncated: streamState.finalTruncated || event.data.outputTruncated,
            });
            finalized = true;
            finalizeRun(doneRun, tempId);
          }
        },
        controller.signal,
      );

      if (!finalized && !controller.signal.aborted) {
        const status = streamError ? "failed" : "completed";
        const result: RunResult = {
          ...pending,
          status,
          thoughtsText: streamState.thoughtsText,
          finalText: streamState.finalText,
          error: streamError || undefined,
          partial: Boolean((streamError && hasStreamedContent) || streamState.thoughtsTruncated || streamState.finalTruncated),
          thoughtsTruncated: streamState.thoughtsTruncated,
          outputTruncated: streamState.finalTruncated,
          completedAt: now(),
        };

        if (streamError) {
          showTransientRun(result);
        } else {
          finalizeRun(result, tempId);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      const failedRun: RunResult = {
        ...pending,
        status: "failed",
        thoughtsText: streamState.thoughtsText,
        finalText: streamState.finalText,
        partial: hasStreamedContent || streamState.thoughtsTruncated || streamState.finalTruncated,
        thoughtsTruncated: streamState.thoughtsTruncated,
        outputTruncated: streamState.finalTruncated,
        error: normalizeGatewayError(error, t),
        completedAt: now(),
      };
      showTransientRun(failedRun);
    } finally {
      if (runControllerRef.current === controller) {
        runControllerRef.current = null;
      }
      setCurrentRun((value) => (value?.status === "running" ? null : value));
    }
  }, [currentRun?.status, finalizeRun, modelOptions, showTransientRun, t]);

  const selectRun = useCallback(
    (runId: string) => {
      setSelectedRunId(runId);
      setCurrentRun(null);

      const selected = history.find((item) => item.id === runId);
      if (selected?.playground) {
        setPlayground(normalizePlayground(selected.playground));
      }
    },
    [history],
  );

  const deleteRun = useCallback(async (runId: string) => {
    await deleteHistoryRun(runId).catch(() => undefined);
    setCurrentRun((value) => (value?.id === runId ? null : value));
    setHistory((previous) => {
      const next = previous.filter((item) => item.id !== runId);
      setSelectedRunId((current) => (current === runId ? next[0]?.id ?? "" : current));
      return next;
    });
  }, []);

  const branchRun = useCallback(
    (runId: string) => {
      const sourceRun =
        currentRun?.id === runId ? currentRun : history.find((item) => item.id === runId) ?? null;
      const sourcePlayground = sourceRun?.playground ?? playgroundRef.current;
      const createdAt = now();

      setPlayground({
        ...normalizePlayground(sourcePlayground),
        id: createId("playground"),
        title: `${sourcePlayground.title || "Untitled Playground"} Branch`,
        createdAt,
        updatedAt: createdAt,
      });
      setCurrentRun(null);
      setSelectedRunId("");
    },
    [currentRun, history],
  );

  return {
    playground,
    setPrompt,
    setTitle,
    setSystemInstruction,
    setProvider,
    setModel,
    setRunSettings,
    createNewChat,
    handleFilesSelected,
    removeAttachment,
    selectedAttachmentId,
    setSelectedAttachmentId,
    attachmentNotice,
    history,
    selectedRunId,
    selectRun,
    deleteRun,
    branchRun,
    currentRun,
    displayedRun,
    run,
    totalTokens,
    catalog,
    catalogState,
    modelOptions,
    providerOptions,
    providerNames,
    modelOptionsForProvider,
    currentModel,
    normalizeModelLabel,
  };
}

function extractErrorMessage(error: unknown) {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return extractProviderErrorMessage(error) ?? error;
  }

  if (typeof error === "object") {
    if ("error" in error && typeof (error as { error?: unknown }).error === "string") {
      const message = (error as { error?: string }).error ?? null;
      return message ? (extractProviderErrorMessage(message) ?? message) : null;
    }

    if ("message" in error && typeof (error as { message?: unknown }).message === "string") {
      const message = (error as { message?: string }).message ?? null;
      return message ? (extractProviderErrorMessage(message) ?? message) : null;
    }
  }

  return null;
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

function extractProviderErrorMessage(value: string) {
  const parsed = parseJsonObject(value);
  if (!parsed || typeof parsed !== "object") {
    return undefined;
  }

  const record = parsed as Record<string, unknown>;
  const nested = record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : undefined;
  const message =
    typeof nested?.message === "string"
      ? nested.message
      : typeof record.message === "string"
        ? record.message
        : undefined;

  if (!message) {
    return undefined;
  }

  const code =
    typeof nested?.code === "string"
      ? nested.code
      : typeof record.code === "string"
        ? record.code
        : undefined;
  const type =
    typeof nested?.type === "string"
      ? nested.type
      : typeof record.type === "string"
        ? record.type
        : undefined;

  if (code === "server_error" || type === "server_error") {
    return `OpenAI server error: ${message}`;
  }

  return code || type ? `${code ?? type}: ${message}` : message;
}

function normalizeGatewayError(error: unknown, t: (key: TranslationKey) => string) {
  const message = extractErrorMessage(error);

  if (!message) {
    return t("errors.gatewayRun");
  }

  if (/401|token refresh failed|auth|opencode auth login/i.test(message)) {
    return t("errors.authExpired");
  }

  if (/prompt or attachment is required|prompt is required|run request failed with 400/i.test(message)) {
    return t("errors.inputRequired");
  }

  return message;
}
