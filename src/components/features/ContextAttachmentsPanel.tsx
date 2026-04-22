import {
  Eye,
  FileAudio,
  FileCode,
  FileJson,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Plus,
  X,
} from "lucide-react";
import { ContextAttachment, formatBytes } from "../../lib/playground";
import { useI18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";

type ContextAttachmentsPanelProps = {
  attachments: ContextAttachment[];
  notice?: string;
  selectedAttachmentId: string | null;
  onSelectAttachment: (id: string | null) => void;
  onPreviewAttachment: (id: string | null) => void;
  onRemoveAttachment: (id: string) => void;
  onUpload: () => void;
};

export function ContextAttachmentsPanel({
  attachments,
  notice,
  selectedAttachmentId,
  onSelectAttachment,
  onPreviewAttachment,
  onRemoveAttachment,
  onUpload,
}: ContextAttachmentsPanelProps) {
  const { t } = useI18n();
  const selectedAttachment = attachments.find((attachment) => attachment.id === selectedAttachmentId) ?? null;

  return (
    <section className="px-6 py-3 border-b border-[rgba(15,0,0,0.12)] -mx-6 -mt-6 mb-2">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {attachments.map((attachment) => (
          <AttachmentCard
            key={attachment.id}
            attachment={attachment}
            active={attachment.id === selectedAttachmentId}
            onSelect={() => onSelectAttachment(attachment.id)}
            onPreview={() => onPreviewAttachment(attachment.id)}
            onRemove={() => onRemoveAttachment(attachment.id)}
          />
        ))}
        <button
          type="button"
          onClick={onUpload}
          className="flex-shrink-0 w-12 border border-dashed border-[#646262] rounded flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity min-h-[96px]"
          title={t("attachments.add")}
        >
          <Plus size={18} />
        </button>
      </div>

      {notice ? (
        <div className="mt-2 rounded-[4px] border border-brand-warning/40 bg-[rgba(255,159,10,0.08)] px-3 py-2 text-[12px] leading-relaxed text-brand-warning">
          {notice}
        </div>
      ) : null}

      {selectedAttachment ? (
        <div className="mt-3 border border-[#646262] rounded-[4px] bg-[#1a1818] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-bold text-brand-light truncate">{selectedAttachment.name}</div>
              <div className="text-[11px] text-brand-mid">
                {selectedAttachment.type} / {selectedAttachment.tokenCount.toLocaleString()} {t("attachments.tokens")} / {formatBytes(selectedAttachment.sizeBytes)}
              </div>
            </div>
            <button
              type="button"
              className="text-[11px] text-brand-mid hover:text-brand-light"
              onClick={() => onSelectAttachment(null)}
            >
              {t("attachments.close")}
            </button>
          </div>
          {selectedAttachment.type === "image" ? (
            <div className="mt-3 max-h-60 overflow-auto rounded-[4px] border border-[#646262] bg-[#302c2c] p-3">
              <img
                src={selectedAttachment.content}
                alt={selectedAttachment.name}
                className="max-h-52 max-w-full rounded-[4px] object-contain"
              />
            </div>
          ) : selectedAttachment.type === "audio" ? (
            <div className="mt-3 rounded-[4px] border border-[#646262] bg-[#302c2c] p-3">
              <audio controls src={selectedAttachment.content} className="w-full" />
            </div>
          ) : selectedAttachment.type === "video" ? (
            <div className="mt-3 max-h-72 overflow-auto rounded-[4px] border border-[#646262] bg-[#302c2c] p-3">
              <video controls src={selectedAttachment.content} className="max-h-64 w-full rounded-[4px]" />
            </div>
          ) : selectedAttachment.type === "pdf" ? (
            <div className="mt-3 rounded-[4px] border border-[#646262] bg-[#302c2c] p-3 text-[12px] text-brand-mid">
              {selectedAttachment.name}
            </div>
          ) : (
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[12px] leading-relaxed text-brand-light bg-[#302c2c] border border-[#646262] rounded-[4px] p-3">
              {selectedAttachment.content.slice(0, 1500) || t("attachments.empty")}
            </pre>
          )}
        </div>
      ) : null}
    </section>
  );
}

function AttachmentCard({
  attachment,
  active,
  onSelect,
  onPreview,
  onRemove,
}: {
  attachment: ContextAttachment;
  active?: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const Icon = iconForAttachmentType(attachment.type);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex-shrink-0 w-52 bg-[#302c2c] p-2 rounded-[4px] border flex flex-col gap-1 text-left",
        active ? "border-brand-accent" : "border-[rgba(15,0,0,0.12)]",
      )}
    >
      <div className="flex justify-between items-center gap-2">
        <span className="text-[10px] text-brand-success font-bold uppercase tracking-widest">
          {attachment.type}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onPreview();
            }}
            className="text-[10px] opacity-70 hover:opacity-100 text-brand-light"
            title={t("attachments.preview")}
          >
            <Eye size={14} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className="text-[10px] opacity-70 hover:opacity-100 text-brand-light"
            title={t("attachments.remove")}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-brand-light">
          <Icon size={15} />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] truncate font-bold text-brand-light">{attachment.name}</div>
          <div className="text-[10px] opacity-50 text-brand-light">
            {attachment.tokenCount.toLocaleString()} {t("attachments.tokens")} / {formatBytes(attachment.sizeBytes)}
          </div>
        </div>
      </div>
    </div>
  );
}

function iconForAttachmentType(type: ContextAttachment["type"]) {
  if (type === "json") {
    return FileJson;
  }

  if (type === "code") {
    return FileCode;
  }

  if (type === "image") {
    return ImageIcon;
  }

  if (type === "audio") {
    return FileAudio;
  }

  if (type === "video") {
    return FileVideo;
  }

  return FileText;
}
