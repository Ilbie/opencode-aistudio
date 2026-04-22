import { ConversationView } from "../features/ConversationView";
import { PromptComposer } from "../features/PromptComposer";
import { ContextAttachmentsPanel } from "../features/ContextAttachmentsPanel";
import { Playground, RunResult } from "../../lib/playground";
import { useI18n } from "../../lib/i18n";
import { useRunElapsedLabel } from "../../lib/runTiming";

type MainPaneProps = {
  playground: Playground;
  displayedRun: RunResult | null;
  totalTokens: number;
  contextLimit: number;
  attachmentNotice: string;
  selectedAttachmentId: string | null;
  onSelectAttachment: (id: string | null) => void;
  onRemoveAttachment: (id: string) => void;
  onPreviewAttachment: (id: string | null) => void;
  onTitleChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onPasteFiles: (files: File[]) => void;
  onRun: () => void;
  onDeleteRun: (runId: string) => void;
  onBranchRun: (runId: string) => void;
  onOpenUpload: () => void;
};

export function MainPane({
  playground,
  displayedRun,
  totalTokens,
  contextLimit,
  attachmentNotice,
  selectedAttachmentId,
  onSelectAttachment,
  onRemoveAttachment,
  onPreviewAttachment,
  onTitleChange,
  onPromptChange,
  onPasteFiles,
  onRun,
  onDeleteRun,
  onBranchRun,
  onOpenUpload,
}: MainPaneProps) {
  return (
    <main className="flex-1 flex flex-col h-full bg-[#201d1d] relative">
      <PlaygroundHeader
        playground={playground}
        displayedRun={displayedRun}
        totalTokens={totalTokens}
        contextLimit={contextLimit}
        onTitleChange={onTitleChange}
      />

      <div className="flex-1 overflow-y-auto w-full px-6 py-6 pb-24 relative outline-none flex flex-col gap-6" tabIndex={-1}>
        <ContextAttachmentsPanel
          attachments={playground.attachments}
          notice={attachmentNotice}
          selectedAttachmentId={selectedAttachmentId}
          onSelectAttachment={onSelectAttachment}
          onPreviewAttachment={onPreviewAttachment}
          onRemoveAttachment={onRemoveAttachment}
          onUpload={onOpenUpload}
        />
        <ConversationView
          playground={playground}
          displayedRun={displayedRun}
          onRun={onRun}
          onDeleteRun={onDeleteRun}
          onBranchRun={onBranchRun}
        />
      </div>

      <PromptComposer
        prompt={playground.prompt}
        isRunning={displayedRun?.status === "running"}
        onPromptChange={onPromptChange}
        onAttachFiles={onOpenUpload}
        onPasteFiles={onPasteFiles}
        onRun={onRun}
      />
    </main>
  );
}

function PlaygroundHeader({
  playground,
  displayedRun,
  totalTokens,
  contextLimit,
  onTitleChange,
}: Pick<MainPaneProps, "playground" | "displayedRun" | "totalTokens" | "contextLimit" | "onTitleChange">) {
  const { t } = useI18n();
  const status = displayedRun?.status ?? "idle";
  const elapsedLabel = useRunElapsedLabel(displayedRun);
  const statusLabel =
    status === "running"
      ? t("status.running")
      : status === "failed"
        ? t("status.error")
        : status === "completed"
          ? t("status.ready")
          : t("status.idle");
  return (
    <header className="h-14 border-b border-[#646262] flex items-center justify-between gap-6 px-6 flex-shrink-0">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <input
          value={playground.title}
          onChange={(event) => onTitleChange(event.target.value)}
          className="text-[16px] font-bold underline decoration-[#646262] bg-transparent outline-none min-w-0 w-[360px] max-w-[52vw]"
        />
      </div>

      <div className="flex items-center gap-6 shrink-0">
        <span className="max-w-[220px] truncate rounded-[4px] border border-[#646262] bg-[#302c2c] px-2 py-0.5 text-[11px] text-brand-light">
          {playground.provider && playground.model
            ? `${playground.provider} / ${playground.model}`
            : t("main.noModel")}
        </span>
        <ContextUsageBar totalTokens={totalTokens} contextLimit={contextLimit} />
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              status === "running"
                ? "bg-brand-warning animate-pulse"
                : status === "failed"
                  ? "bg-brand-danger"
                  : "bg-brand-success"
            }`}
          />
          <span className="text-[12px] opacity-80 uppercase tracking-tighter">{statusLabel}</span>
          {elapsedLabel ? (
            <span className="text-[12px] text-brand-mid tabular-nums">{elapsedLabel}</span>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function ContextUsageBar({
  totalTokens,
  contextLimit,
}: {
  totalTokens: number;
  contextLimit: number;
}) {
  const { t } = useI18n();
  const hasLimit = contextLimit > 0;
  const ratio = hasLimit ? Math.min(totalTokens / contextLimit, 1) : 0;
  const percent = Math.round(ratio * 100);
  const fillClass =
    percent >= 90 ? "bg-brand-danger" : percent >= 70 ? "bg-brand-warning" : "bg-brand-success";

  return (
    <div className="w-[240px] min-w-[160px] max-w-[24vw] flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 text-[11px] leading-none">
        <span className="text-brand-mid">{t("main.contextWindow")}</span>
        <span className="text-brand-light">
          {hasLimit
            ? `${formatWholeNumber(totalTokens)} / ${formatWholeNumber(contextLimit)}`
            : t("main.contextUnknown")}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#302c2c] border border-[#646262] overflow-hidden">
        <div
          className={`h-full ${fillClass} transition-[width] duration-300`}
          style={{ width: `${hasLimit ? percent : 0}%` }}
        />
      </div>
    </div>
  );
}

function formatWholeNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}
