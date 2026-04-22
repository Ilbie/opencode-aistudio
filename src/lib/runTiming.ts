import { useEffect, useMemo, useState } from "react";
import type { RunResult } from "./playground";

type TimedRun = Pick<RunResult, "id" | "status" | "startedAt" | "completedAt">;

const ELAPSED_TICK_MS = 100;

export function useRunElapsedLabel(run: TimedRun | null | undefined) {
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const isRunning = run?.status === "running";

  useEffect(() => {
    if (!isRunning || !run?.startedAt) {
      return;
    }

    setCurrentTimeMs(Date.now());
    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, ELAPSED_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [isRunning, run?.id, run?.startedAt]);

  return useMemo(() => {
    if (!run?.startedAt) {
      return "";
    }

    if (run.status === "running") {
      return formatElapsedSeconds(run.startedAt, undefined, currentTimeMs);
    }

    if (run.completedAt) {
      return formatElapsedSeconds(run.startedAt, run.completedAt);
    }

    return "";
  }, [currentTimeMs, run?.completedAt, run?.startedAt, run?.status]);
}

export function formatElapsedSeconds(startedAt: string, completedAt?: string, currentTimeMs = Date.now()) {
  const startTimeMs = parseTimeMs(startedAt);
  if (startTimeMs === undefined) {
    return "";
  }

  const endTimeMs = completedAt ? parseTimeMs(completedAt) : currentTimeMs;
  const elapsedMs = Math.max(0, (endTimeMs ?? currentTimeMs) - startTimeMs);

  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

function parseTimeMs(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}
