import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Copy,
  FileText,
  GitBranch,
  MoreVertical,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import Markdown from "react-markdown";
import { Playground, RunResult, formatTime } from "../../lib/playground";
import { useI18n } from "../../lib/i18n";

const USER_PREVIEW_LIMIT = 1_200;
const THOUGHTS_PREVIEW_LIMIT = 2_000;
const FINAL_PREVIEW_LIMIT = 12_000;

type ConversationViewProps = {
  playground: Playground;
  displayedRun: RunResult | null;
  onRun: () => void;
  onDeleteRun: (runId: string) => void;
  onBranchRun: (runId: string) => void;
};

export function ConversationView({
  playground,
  displayedRun,
  onRun,
  onDeleteRun,
  onBranchRun,
}: ConversationViewProps) {
  const { t } = useI18n();
  const finalText = displayedRun?.finalText ?? "";
  const thoughtsText = displayedRun?.thoughtsText ?? "";
  const hasPrompt = Boolean(playground.prompt.trim());
  const isDraftOnly = hasPrompt && !displayedRun;
  const markdownContent = useMemo(() => finalText.trim(), [finalText]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowOutputRef = useRef(false);

  useEffect(() => {
    const scrollContainer = getScrollContainer(endRef.current);
    if (!scrollContainer) {
      return;
    }

    const updateFollowState = () => {
      shouldFollowOutputRef.current = isNearScrollBottom(scrollContainer);
    };

    updateFollowState();
    scrollContainer.addEventListener("scroll", updateFollowState, { passive: true });

    return () => {
      scrollContainer.removeEventListener("scroll", updateFollowState);
    };
  }, [displayedRun?.id, hasPrompt]);

  useEffect(() => {
    if ((!hasPrompt && !displayedRun) || !shouldFollowOutputRef.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: "end" });
    });

    return () => cancelAnimationFrame(frame);
  }, [displayedRun?.id, displayedRun?.status, finalText.length, thoughtsText.length, hasPrompt]);

  if (!displayedRun && !hasPrompt) {
    return <div className="flex flex-1 pb-10" />;
  }

  return (
    <div className={`mx-auto flex w-full max-w-[980px] flex-col gap-6 flex-1 pb-10 ${isDraftOnly ? "justify-end" : ""}`}>
      {hasPrompt ? (
        <UserMessage
          title={t("conversation.user")}
          time={displayedRun?.startedAt ?? playground.updatedAt}
          content={playground.prompt}
        />
      ) : null}

      {displayedRun ? (
        <>
          <ThoughtsPanel thoughtsText={thoughtsText} running={displayedRun.status === "running"} />
          <AssistantMessage
            run={displayedRun}
            markdownContent={markdownContent}
            onRun={onRun}
            onDeleteRun={onDeleteRun}
            onBranchRun={onBranchRun}
          />
        </>
      ) : null}
      <div ref={endRef} aria-hidden="true" />
    </div>
  );
}

function UserMessage({
  title,
  time,
  content,
}: {
  title: string;
  time: string;
  content: string;
}) {
  const { language, t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const { text, truncated } = truncateMiddle(content, USER_PREVIEW_LIMIT);

  return (
    <section className="w-full max-w-[860px] self-center rounded-[4px] border border-[#646262] bg-[#262323]">
      <div className="flex items-center justify-between border-b border-[#3a3636] px-4 py-3 text-[13px] text-brand-text-muted">
        <div className="flex items-center gap-3">
          <span className="font-bold text-brand-light">{title}</span>
          <span>{formatTime(time, language)}</span>
        </div>
      </div>
      <div className="max-h-[220px] overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] px-4 py-4 text-[15px] font-medium leading-[1.6] text-brand-light">
        {expanded ? content : text}
        {truncated && !expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-3 block text-[12px] font-bold text-brand-accent hover:text-brand-light"
          >
            {t("conversation.showFull")}
          </button>
        ) : null}
        {truncated && expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-3 block text-[12px] font-bold text-brand-accent hover:text-brand-light"
          >
            {t("conversation.showLess")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function AssistantMessage({
  run,
  markdownContent,
  onRun,
  onDeleteRun,
  onBranchRun,
}: {
  run: RunResult;
  markdownContent: string;
  onRun: () => void;
  onDeleteRun: (runId: string) => void;
  onBranchRun: (runId: string) => void;
}) {
  const { language, t } = useI18n();
  const status = run.status;
  const [expanded, setExpanded] = useState(false);
  const visibleMarkdown = expanded ? markdownContent : truncateAtBoundary(markdownContent, FINAL_PREVIEW_LIMIT).text;
  const isTruncated = markdownContent.length > visibleMarkdown.length;
  const hasPartialContent = Boolean(run.finalText.trim() || run.thoughtsText.trim());

  return (
    <section className="w-full max-w-[960px] self-center rounded-[4px] border border-[#646262] bg-[#1a1818]">
      <div className="flex items-center justify-between border-b border-[#302c2c] px-4 py-3 text-[13px] text-brand-text-muted">
        <div className="flex items-center gap-3">
          <span className="font-bold text-brand-accent flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-brand-accent" />
            {t("conversation.modelResponse")}
          </span>
          <span>{formatTime(run.completedAt ?? run.startedAt, language)}</span>
          {status === "running" ? (
            <span className="text-brand-warning">{t("conversation.streaming")}</span>
          ) : null}
        </div>
        <MessageMenu
          markdownContent={markdownContent}
          onDelete={() => onDeleteRun(run.id)}
          onBranch={() => onBranchRun(run.id)}
        />
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {run.error ? (
          <div className="rounded-[4px] border border-brand-danger/40 bg-[rgba(255,59,48,0.08)] px-4 py-3 text-[13px] text-brand-light">
            {run.error}
          </div>
        ) : null}

        <div className="markdown-body prose prose-invert max-w-none text-[15px] leading-[1.7] text-brand-light">
          {visibleMarkdown ? (
            <>
              <Markdown>{visibleMarkdown}</Markdown>
              {isTruncated ? (
                <div className="mt-4 rounded-[4px] border border-[#302c2c] bg-[#161515] px-4 py-3 text-[13px] text-brand-mid">
                  {t("conversation.responseTruncated")}
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="ml-3 font-bold text-brand-accent hover:text-brand-light"
                  >
                    {t("conversation.showFull")}
                  </button>
                </div>
              ) : expanded && markdownContent.length > FINAL_PREVIEW_LIMIT ? (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="mt-4 text-[13px] font-bold text-brand-accent hover:text-brand-light"
                >
                  {t("conversation.showLess")}
                </button>
              ) : null}
            </>
          ) : (
            <div className="text-brand-mid">{t("conversation.waiting")}</div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-[rgba(100,98,98,0.3)] pt-3">
          {run.partial && run.status !== "completed" && hasPartialContent ? (
            <div className="text-[11px] uppercase tracking-widest text-brand-warning">
              {t("conversation.partial")}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onRun}
            className="ml-auto flex items-center gap-1.5 rounded-[4px] border border-transparent px-3 py-1.5 text-[13px] text-brand-mid transition-colors hover:border-[#646262] hover:bg-[#302c2c] hover:text-brand-light"
          >
            <RotateCcw size={14} />
            {t("conversation.retry")}
          </button>
        </div>
      </div>
    </section>
  );
}

function ThoughtsPanel({ thoughtsText, running }: { thoughtsText: string; running: boolean }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const hasThoughts = Boolean(thoughtsText.trim());
  const [showFullThoughts, setShowFullThoughts] = useState(false);
  const visibleThoughts = showFullThoughts ? thoughtsText : truncateAtBoundary(thoughtsText, THOUGHTS_PREVIEW_LIMIT).text;
  const thoughtsTruncated = thoughtsText.length > visibleThoughts.length;

  return (
    <section className="w-full max-w-[860px] self-center overflow-hidden rounded-[4px] border border-[#302c2c] bg-[#161515]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-[14px] font-bold text-brand-light">
          <Sparkles size={14} className="text-brand-accent" />
          {t("conversation.thoughts")}
        </span>
        <ChevronDown
          size={16}
          className={`text-brand-mid transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <div className="border-t border-[#302c2c] px-4 py-3">
        {expanded ? (
          hasThoughts ? (
            <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-[13px] leading-relaxed text-brand-mid">
              {visibleThoughts}
              {thoughtsTruncated ? (
                <>
                  {"\n\n..."}
                  {"\n"}
                  <button
                    type="button"
                    onClick={() => setShowFullThoughts(true)}
                    className="text-[12px] font-bold text-brand-accent hover:text-brand-light"
                  >
                    {t("conversation.showFull")}
                  </button>
                </>
              ) : showFullThoughts && thoughtsText.length > THOUGHTS_PREVIEW_LIMIT ? (
                <>
                  {"\n\n"}
                  <button
                    type="button"
                    onClick={() => setShowFullThoughts(false)}
                    className="text-[12px] font-bold text-brand-accent hover:text-brand-light"
                  >
                    {t("conversation.showLess")}
                  </button>
                </>
              ) : null}
            </pre>
          ) : (
            <div className="text-[13px] font-bold text-brand-light">
              {running ? t("conversation.thoughtsWaiting") : t("conversation.noThoughts")}
            </div>
          )
        ) : (
          <div className="text-[13px] font-bold text-brand-light">
            {hasThoughts ? t("conversation.expandThoughts") : running ? t("conversation.thoughtsWaiting") : t("conversation.noThoughts")}
          </div>
        )}
      </div>
    </section>
  );
}

function getScrollContainer(element: HTMLElement | null) {
  let parent = element?.parentElement ?? null;

  while (parent) {
    const overflowY = window.getComputedStyle(parent).overflowY;
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return parent;
    }
    parent = parent.parentElement;
  }

  return null;
}

function isNearScrollBottom(element: HTMLElement) {
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceFromBottom <= 96;
}

function MessageMenu({
  markdownContent,
  onDelete,
  onBranch,
}: {
  markdownContent: string;
  onDelete: () => void;
  onBranch: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const runAndClose = (action: () => void | Promise<void>) => {
    setOpen(false);
    void action();
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("conversation.moreActions")}
        onClick={() => setOpen((value) => !value)}
        className="rounded-[4px] p-1.5 text-brand-mid transition-colors hover:bg-[#302c2c] hover:text-brand-light"
      >
        <MoreVertical size={16} />
      </button>

      {open ? (
        <div className="absolute right-0 top-8 z-20 w-48 rounded-[6px] border border-[#302c2c] bg-[#1f1d1d] py-1 shadow-2xl">
          <MenuItem
            icon={<Trash2 size={14} />}
            label={t("conversation.delete")}
            onClick={() => runAndClose(onDelete)}
          />
          <MenuItem
            icon={<GitBranch size={14} />}
            label={t("conversation.branchFromHere")}
            onClick={() => runAndClose(onBranch)}
          />
          <MenuItem
            icon={<Copy size={14} />}
            label={t("conversation.copyAsText")}
            onClick={() => runAndClose(() => navigator.clipboard.writeText(markdownToPlainText(markdownContent)))}
          />
          <MenuItem
            icon={<FileText size={14} />}
            label={t("conversation.copyAsMarkdown")}
            onClick={() => runAndClose(() => navigator.clipboard.writeText(markdownContent))}
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] font-bold text-brand-mid transition-colors hover:bg-[#302c2c] hover:text-brand-light"
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-zA-Z0-9_-]*\n?|```/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>#-]/g, "")
    .trim();
}

function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return { text: value, truncated: false };
  }

  const headLength = Math.floor(maxLength * 0.7);
  const tailLength = Math.max(0, maxLength - headLength);
  return {
    text: `${value.slice(0, headLength)}\n\n...\n\n${value.slice(value.length - tailLength)}`,
    truncated: true,
  };
}

function truncateAtBoundary(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return { text: value, truncated: false };
  }

  const nextBoundary = value.lastIndexOf("\n\n", maxLength);
  const cutAt = nextBoundary > maxLength * 0.5 ? nextBoundary : maxLength;
  return {
    text: value.slice(0, cutAt),
    truncated: true,
  };
}
