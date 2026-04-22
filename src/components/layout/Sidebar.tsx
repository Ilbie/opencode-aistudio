import { History, Plus, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { RunResult, formatDateTime } from "../../lib/playground";
import { useI18n, type Language } from "../../lib/i18n";

type CatalogState = {
  status: "loading" | "ready" | "fallback";
  error?: string;
};

type SidebarProps = {
  history: RunResult[];
  selectedRunId: string;
  onSelectRun: (id: string) => void;
  onDeleteRun: (id: string) => void;
  onNewChat: () => void;
  providerStatus: CatalogState;
  tokens: number;
  tokenLimit: number;
};

export function Sidebar({
  history,
  selectedRunId,
  onSelectRun,
  onDeleteRun,
  onNewChat,
  providerStatus,
  tokens,
  tokenLimit,
}: SidebarProps) {
  const { language, setLanguage, t } = useI18n();
  const statusLabel =
    providerStatus.status === "loading"
      ? t("sidebar.loading")
      : providerStatus.status === "ready"
        ? t("sidebar.connected")
        : t("sidebar.fallback");

  return (
    <div className="w-[260px] flex-shrink-0 flex flex-col border-r border-[#646262] bg-[#1a1818] h-full overflow-y-auto">
      <div className="p-4 border-b border-[#646262]">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[16px] font-bold tracking-tighter uppercase text-brand-light flex items-center gap-2">
            <span className="w-4 h-4 bg-brand-accent rounded-sm inline-block"></span>
            AI Studio
          </h1>
          <LanguageToggle language={language} onChange={setLanguage} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-4 mb-2">
          <button
            type="button"
            onClick={onNewChat}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-[4px] border border-[#646262] bg-[#302c2c] px-3 py-2 text-[13px] font-bold text-brand-light transition-colors hover:border-brand-accent hover:bg-[#3a3636]"
          >
            <Plus size={15} />
            {t("sidebar.newChat")}
          </button>
          <h2 className="text-[10px] text-[#9a9898] font-bold tracking-widest uppercase mb-2 flex items-center gap-2">
            <History size={13} />
            {t("sidebar.history")}
          </h2>
          <div className="space-y-1">
            {history.length > 0 ? (
              history.map((item) => (
                <HistoryItem
                  key={item.id}
                  item={item}
                  active={item.id === selectedRunId}
                  onSelect={() => onSelectRun(item.id)}
                  onDelete={() => onDeleteRun(item.id)}
                />
              ))
            ) : (
              <div className="text-[13px] text-brand-mid px-2 py-1">{t("sidebar.noRuns")}</div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[#646262] text-[14px] space-y-3">
        <div className="flex justify-between items-center text-brand-text-muted">
          <span>{t("sidebar.sessionTokens")}</span>
          <span className="text-brand-light">{tokens.toLocaleString()}</span>
        </div>
        <TokenUsageBar tokens={tokens} tokenLimit={tokenLimit} />
        <div className="flex justify-between items-center text-[12px] text-brand-text-muted">
          <span>{t("sidebar.provider")}</span>
          <span className="text-brand-light">{statusLabel}</span>
        </div>
        {providerStatus.error ? (
          <p className="text-[12px] leading-relaxed text-brand-mid">{providerStatus.error}</p>
        ) : null}
      </div>
    </div>
  );
}

function TokenUsageBar({ tokens, tokenLimit }: { tokens: number; tokenLimit: number }) {
  const hasLimit = tokenLimit > 0;
  const percent = hasLimit ? Math.min(Math.round((tokens / tokenLimit) * 100), 100) : 0;
  const visiblePercent = percent > 0 ? Math.max(percent, 2) : 0;
  const fillClass =
    percent >= 90 ? "bg-brand-danger" : percent >= 70 ? "bg-brand-warning" : "bg-brand-accent";

  return (
    <div
      className="w-full h-1 bg-[#302c2c] rounded-full overflow-hidden"
      title={hasLimit ? `${tokens.toLocaleString()} / ${tokenLimit.toLocaleString()}` : tokens.toLocaleString()}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${fillClass}`}
        style={{ width: `${hasLimit ? visiblePercent : 0}%` }}
      />
    </div>
  );
}

function LanguageToggle({
  language,
  onChange,
}: {
  language: Language;
  onChange: (language: Language) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex rounded-[4px] border border-[#646262] overflow-hidden">
      {(["en", "ko"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={cn(
            "px-2 py-1 text-[11px] font-bold transition-colors",
            language === value
              ? "bg-brand-light text-brand-dark"
              : "bg-[#302c2c] text-brand-mid hover:text-brand-light",
          )}
        >
          {t(`language.${value}`)}
        </button>
      ))}
    </div>
  );
}

function HistoryItem({
  item,
  active,
  onSelect,
  onDelete,
}: {
  item: RunResult;
  active?: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { language, t } = useI18n();
  const hasPartialContent = Boolean(item.finalText.trim() || item.thoughtsText.trim());

  return (
    <div
      className={cn(
        "group flex items-stretch gap-1 rounded-[4px] border transition-colors",
        active
          ? "bg-[#302c2c] border-[#646262]"
          : "border-transparent hover:bg-[#302c2c] hover:border-[#646262]",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 px-2 py-2 text-left outline-none"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[14px] text-brand-light">{runLabel(item.status, t)}</span>
          <span className="text-[10px] uppercase tracking-widest text-brand-mid">
            {item.status}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-brand-mid">
          <span>{formatDateTime(item.startedAt, language)}</span>
          <span>
            {item.partial && item.status !== "completed" && hasPartialContent
              ? t("history.partial")
              : t("history.full")}
          </span>
        </div>
      </button>
      <button
        type="button"
        aria-label={t("conversation.delete")}
        title={t("conversation.delete")}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        className="mr-1 my-1 flex w-8 shrink-0 items-center justify-center rounded-[4px] text-brand-mid opacity-0 transition-colors hover:bg-brand-danger/15 hover:text-brand-danger group-hover:opacity-100 focus:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function runLabel(status: RunResult["status"], t: ReturnType<typeof useI18n>["t"]) {
  if (status === "failed") {
    return t("history.failed");
  }

  if (status === "running") {
    return t("history.running");
  }

  return t("history.completed");
}
