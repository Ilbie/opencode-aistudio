import { SettingsDropdown } from "../ui/SettingsDropdown";
import {
  CatalogPayload,
  Playground,
  RunSettings,
  normalizeModelLabel,
  ProviderOption,
  ModelOption,
} from "../../lib/playground";
import { useI18n } from "../../lib/i18n";

type CatalogState = {
  status: "loading" | "ready" | "fallback";
  error?: string;
};

type RightSettingsPanelProps = {
  playground: Playground;
  catalogState: CatalogState;
  catalog: CatalogPayload;
  providerOptions: ProviderOption[];
  modelOptions: ModelOption[];
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onSystemInstructionChange: (value: string) => void;
  onSettingChange: <K extends keyof RunSettings>(key: K, value: RunSettings[K]) => void;
};

export function RightSettingsPanel({
  playground,
  catalogState,
  catalog,
  providerOptions,
  modelOptions,
  onProviderChange,
  onModelChange,
  onSystemInstructionChange,
  onSettingChange,
}: RightSettingsPanelProps) {
  const { t } = useI18n();
  const providerDropdownOptions = providerOptions.map((item) => ({
    label: item.label ?? item.provider,
    value: item.provider,
  }));
  const modelDropdownOptions = modelOptions.map((item) => ({
    label: normalizeModelLabel(item),
    value: item.model,
  }));
  const providerSelectOptions =
    providerDropdownOptions.length > 0 ? providerDropdownOptions : [{ label: t("settings.noProviders"), value: "" }];
  const modelSelectOptions =
    modelDropdownOptions.length > 0 ? modelDropdownOptions : [{ label: t("settings.noModels"), value: "" }];
  const currentModel = modelOptions.find((item) => item.model === playground.model);
  const modelVariants = currentModel?.variants ?? [];
  const variantOptions = [
    { label: t("settings.openCodeDefault"), value: "" },
    ...modelVariants.map((value) => ({ label: value, value })),
  ];
  const catalogLabel =
    catalogState.status === "loading"
      ? t("settings.catalogLoading")
      : catalogState.status === "ready"
        ? t("settings.catalogReady")
        : t("settings.catalogFallback");

  return (
    <div className="w-[300px] flex-shrink-0 border-l border-[#646262] bg-[#1a1818] h-full overflow-y-auto flex flex-col">
      <div className="p-4 border-b border-[#646262]">
        <h2 className="text-[11px] uppercase tracking-widest text-[#9a9898] font-bold">{t("settings.title")}</h2>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <h3 className="text-[11px] font-bold text-[#9a9898] uppercase tracking-widest">{t("settings.model")}</h3>
          <SettingsDropdown
            label={t("settings.provider")}
            value={playground.provider}
            options={providerSelectOptions}
            onChange={onProviderChange}
          />
          <SettingsDropdown
            label={t("settings.model")}
            value={playground.model}
            options={modelSelectOptions}
            onChange={onModelChange}
          />
          <div className="text-[12px] text-brand-text-muted space-y-1">
            <p>{catalogLabel}</p>
            <p>
              {t("settings.connected")}: {catalog.providers.some((item) => item.connected) ? t("common.yes") : t("common.no")}
            </p>
            <p>
              {t("settings.reasoningCapability")}:{" "}
              {currentModelCapability(modelOptions, playground.model, "reasoning") ? t("common.yes") : t("common.no")}
            </p>
            <div className="pt-1">
              <p className="mb-2">{t("settings.inputModalities")}</p>
              <div className="flex flex-wrap gap-1.5">
                <CapabilityPill label={t("settings.modalityText")} active={currentModel?.capabilities?.input?.text !== false} />
                <CapabilityPill label={t("settings.modalityImage")} active={Boolean(currentModel?.capabilities?.input?.image || currentModel?.capabilities?.imageInput)} />
                <CapabilityPill label={t("settings.modalityAudio")} active={Boolean(currentModel?.capabilities?.input?.audio)} />
                <CapabilityPill label={t("settings.modalityVideo")} active={Boolean(currentModel?.capabilities?.input?.video)} />
                <CapabilityPill label={t("settings.modalityPdf")} active={Boolean(currentModel?.capabilities?.input?.pdf)} />
              </div>
            </div>
          </div>
          {catalogState.error ? (
            <p className="text-[12px] text-brand-mid leading-relaxed">{catalogState.error}</p>
          ) : null}
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-[11px] font-bold text-[#9a9898] uppercase tracking-widest">{t("settings.system")}</h3>
          <textarea
            className="w-full h-28 bg-[#302c2c] border border-[#646262] rounded-[4px] p-3 text-[14px] text-brand-light placeholder:text-brand-text-muted focus:outline-none focus:border-brand-accent transition-colors resize-none"
            placeholder={t("settings.systemPlaceholder")}
            value={playground.systemInstruction ?? ""}
            onChange={(event) => onSystemInstructionChange(event.target.value)}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-[11px] font-bold text-[#9a9898] uppercase tracking-widest">{t("settings.reasoning")}</h3>
          {modelVariants.length > 0 ? (
            <SettingsDropdown
              label={t("settings.modelVariant")}
              value={playground.runSettings.modelVariant}
              options={variantOptions}
              onChange={(value) => onSettingChange("modelVariant", value)}
            />
          ) : (
            <p className="text-[12px] text-brand-text-muted leading-relaxed">
              {currentModel?.capabilities?.reasoning
                ? t("settings.openCodeDefaultVariant")
                : t("settings.noModelVariants")}
            </p>
          )}
          <p className="text-[12px] text-brand-text-muted leading-relaxed">
            {t("settings.reasoningHelp")}
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-[11px] font-bold text-[#9a9898] uppercase tracking-widest">{t("settings.tools")}</h3>
          <div className="space-y-3 pt-1">
            <ToggleOption
              label={t("settings.codeExecution")}
              checked={playground.runSettings.codeExecution}
              onChange={(checked) => onSettingChange("codeExecution", checked)}
            />
            <ToggleOption
              label={t("settings.urlContext")}
              checked={playground.runSettings.urlContext}
              onChange={(checked) => onSettingChange("urlContext", checked)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ToggleOption({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-[13px] group-hover:text-brand-light text-brand-mid transition-colors">{label}</span>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <div className={`w-8 h-4 rounded-full flex items-center px-[2px] transition-colors ${checked ? "bg-brand-success" : "bg-[#646262]"}`}>
        <div className={`w-3 h-3 bg-brand-light rounded-full transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`}></div>
      </div>
    </label>
  );
}

function currentModelCapability(models: ModelOption[], modelName: string, key: "reasoning") {
  return models.some((item) => item.model === modelName && Boolean(item.capabilities?.[key]));
}

function CapabilityPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-[4px] border px-1.5 py-0.5 text-[10px] uppercase ${
        active
          ? "border-brand-success/50 bg-[rgba(48,209,88,0.08)] text-brand-success"
          : "border-[#646262] text-brand-text-muted"
      }`}
    >
      {label}
    </span>
  );
}
