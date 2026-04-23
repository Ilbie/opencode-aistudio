import type { Event as OpenCodeEvent } from "@opencode-ai/sdk/v2";
import { appConfig } from "../../../app-config";

export const DEFAULT_GATEWAY_TIMEOUT_MS = appConfig.gateway.timeoutMs;
export const DEFAULT_POST_PROMPT_IDLE_GRACE_MS = appConfig.gateway.postPromptIdleGraceMs;

export type StreamCompletionReason = "idle" | "prompt-grace" | "stream-ended";

export type WaitForStreamCompletionOptions = {
  stream: AsyncGenerator<OpenCodeEvent, unknown, unknown>;
  promptCompletion: Promise<unknown>;
  sessionId: string;
  timeoutMs?: number;
  postPromptIdleGraceMs?: number;
  onEvent: (event: OpenCodeEvent) => void;
};

export type StreamCompletionResult = {
  reason: StreamCompletionReason;
  partial: boolean;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Gateway timed out after ${ms}ms`)), ms);
  });
}

export async function waitForStreamCompletion({
  stream,
  promptCompletion,
  sessionId,
  timeoutMs = DEFAULT_GATEWAY_TIMEOUT_MS,
  postPromptIdleGraceMs = DEFAULT_POST_PROMPT_IDLE_GRACE_MS,
  onEvent,
}: WaitForStreamCompletionOptions): Promise<StreamCompletionResult> {
  let promptSettled = false;
  const trackedPromptCompletion = promptCompletion.finally(() => {
    promptSettled = true;
  });

  const streamLoop = (async (): Promise<StreamCompletionResult> => {
    for await (const event of stream) {
      onEvent(event);
      if (event.type === "session.idle" && event.properties.sessionID === sessionId) {
        return { reason: "idle", partial: false };
      }
    }

    return { reason: "stream-ended", partial: !promptSettled };
  })();

  const promptGrace = trackedPromptCompletion.then(async () => {
    await delay(postPromptIdleGraceMs);
    return { reason: "prompt-grace", partial: false } satisfies StreamCompletionResult;
  });

  return Promise.race([
    streamLoop,
    promptGrace,
    timeoutAfter(timeoutMs).catch((error) => {
      throw Object.assign(error, { partial: true });
    }),
  ]);
}

export function finalizeGatewayResponses(parts: Map<string, string>) {
  return [...parts.values()].join("");
}
