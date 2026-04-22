import { Paperclip, Send } from "lucide-react";
import { useI18n } from "../../lib/i18n";

const LARGE_PASTE_CHAR_THRESHOLD = 8_000;

type PromptComposerProps = {
  prompt: string;
  isRunning: boolean;
  onPromptChange: (value: string) => void;
  onAttachFiles: () => void;
  onPasteFiles: (files: File[]) => void;
  onRun: () => void;
};

export function PromptComposer({
  prompt,
  isRunning,
  onPromptChange,
  onAttachFiles,
  onPasteFiles,
  onRun,
}: PromptComposerProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-2 relative bg-[#1a1818] p-6 border-t border-[#646262]">
      <div className="relative rounded-[4px] border border-[#646262] bg-[#302c2c] focus-within:border-brand-accent transition-colors overflow-hidden group">
        <textarea
          className="w-full h-[120px] max-h-[300px] resize-y p-5 text-[16px] text-brand-light placeholder:text-[#9a9898] bg-transparent outline-none focus:outline-none focus:ring-0 leading-[1.5]"
          placeholder={t("prompt.placeholder")}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onPaste={(event) => {
            const files = filesFromClipboard(event.clipboardData);
            const pastedText = event.clipboardData.getData("text/plain");
            const shouldAttachText = pastedText.length >= LARGE_PASTE_CHAR_THRESHOLD;

            if (files.length === 0 && !shouldAttachText) {
              return;
            }

            event.preventDefault();

            if (files.length > 0) {
              onPasteFiles(files);
            }

            if (shouldAttachText) {
              onPasteFiles([textFileFromPaste(pastedText)]);
            }
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onRun();
            }
          }}
        />

        <div className="absolute bottom-3 left-4 flex gap-2">
          <button
            type="button"
            onClick={onAttachFiles}
            className="p-2 text-brand-mid hover:text-brand-light bg-transparent border border-transparent hover:bg-[#3a3636] rounded-[4px] transition-colors"
            title={t("prompt.attach")}
          >
            <Paperclip size={18} />
          </button>
        </div>

        <div className="absolute bottom-3 right-3 flex items-center gap-3">
          <span className="text-[10px] opacity-60 uppercase text-brand-mid">{t("prompt.shortcut")}</span>
          <button
            type="button"
            onClick={onRun}
            disabled={isRunning}
            className="bg-brand-accent text-brand-light font-bold px-5 py-1.5 rounded-[4px] text-[13px] hover:bg-brand-accent-hover transition-colors outline-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={14} />
            {isRunning ? t("prompt.running") : t("prompt.run")}
          </button>
        </div>
      </div>
    </div>
  );
}

function filesFromClipboard(data: DataTransfer) {
  return Array.from(data.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .filter(isSupportedClipboardFile)
    .map((file, index) => {
      const extension = extensionForMime(file.type);
      const kind = kindForMime(file.type);
      const fallbackName = `pasted-${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}-${index + 1}.${extension}`;
      return new File([file], file.name || fallbackName, {
        type: file.type,
      });
    });
}

function textFileFromPaste(text: string) {
  return new File([text], `pasted-context-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`, {
    type: "text/plain",
  });
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  if (mimeType === "application/pdf") {
    return "pdf";
  }

  const subtype = mimeType.split("/")[1]?.replace("+xml", "") || "png";
  return subtype === "svg" ? "svg" : subtype;
}

function isSupportedClipboardFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    file.type.startsWith("audio/") ||
    file.type.startsWith("video/") ||
    file.type === "application/pdf"
  );
}

function kindForMime(mimeType: string) {
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType === "application/pdf") {
    return "pdf";
  }

  return "image";
}
