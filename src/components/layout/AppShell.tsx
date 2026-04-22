import { useRef } from "react";
import { Sidebar } from "./Sidebar";
import { MainPane } from "./MainPane";
import { RightSettingsPanel } from "./RightSettingsPanel";
import { usePlaygroundController } from "./usePlaygroundController";
import { I18nProvider } from "../../lib/i18n";
import { acceptedFileTypesForModel } from "../../lib/playground";

export function AppShell() {
  return (
    <I18nProvider>
      <AppShellContent />
    </I18nProvider>
  );
}

function AppShellContent() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const controller = usePlaygroundController();

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFileTypesForModel(controller.currentModel)}
        multiple
        className="hidden"
        onChange={async (event) => {
          const files = event.target.files;
          if (files && files.length > 0) {
            await controller.handleFilesSelected(files);
          }
          event.target.value = "";
        }}
      />

      <div className="flex h-screen w-full bg-brand-dark text-brand-light font-mono overflow-hidden">
        <Sidebar
          history={controller.history}
          selectedRunId={controller.selectedRunId}
          onSelectRun={controller.selectRun}
          onDeleteRun={controller.deleteRun}
          onNewChat={controller.createNewChat}
          providerStatus={controller.catalogState}
          tokens={controller.totalTokens}
          tokenLimit={controller.currentModel?.limit?.context ?? 0}
        />
        <MainPane
          playground={controller.playground}
          displayedRun={controller.displayedRun}
          totalTokens={controller.totalTokens}
          contextLimit={controller.currentModel?.limit?.context ?? 0}
          attachmentNotice={controller.attachmentNotice}
          selectedAttachmentId={controller.selectedAttachmentId}
          onSelectAttachment={controller.setSelectedAttachmentId}
          onRemoveAttachment={controller.removeAttachment}
          onPreviewAttachment={controller.setSelectedAttachmentId}
          onTitleChange={controller.setTitle}
          onPromptChange={controller.setPrompt}
          onPasteFiles={(files) => void controller.handleFilesSelected(files)}
          onRun={controller.run}
          onDeleteRun={controller.deleteRun}
          onBranchRun={controller.branchRun}
          onOpenUpload={openFilePicker}
        />
        <RightSettingsPanel
          playground={controller.playground}
          catalogState={controller.catalogState}
          catalog={controller.catalog}
          providerOptions={controller.providerOptions}
          modelOptions={controller.modelOptionsForProvider}
          onProviderChange={controller.setProvider}
          onModelChange={controller.setModel}
          onSystemInstructionChange={controller.setSystemInstruction}
          onSettingChange={controller.setRunSettings}
        />
      </div>
    </>
  );
}
