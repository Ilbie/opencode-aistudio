import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "en" | "ko";

const translations = {
  en: {
    "language.en": "EN",
    "language.ko": "KO",
    "sidebar.history": "History",
    "sidebar.newChat": "New chat",
    "sidebar.noRuns": "No runs yet.",
    "sidebar.sessionTokens": "Session Tokens",
    "sidebar.provider": "Provider",
    "sidebar.connected": "Connected",
    "sidebar.loading": "Loading",
    "sidebar.fallback": "Fallback",
    "history.completed": "Completed run",
    "history.failed": "Failed run",
    "history.running": "Running run",
    "history.partial": "partial",
    "history.full": "full",
    "main.tokens": "Tokens",
    "main.contextWindow": "Context",
    "main.contextUnknown": "Unknown",
    "main.noModel": "No model selected",
    "status.running": "Running",
    "status.error": "Error",
    "status.ready": "Ready",
    "status.idle": "Idle",
    "attachments.add": "Add attachment",
    "attachments.preview": "Preview",
    "attachments.remove": "Remove",
    "attachments.close": "Close",
    "attachments.empty": "[Empty file]",
    "attachments.tokens": "tokens",
    "attachments.unsupportedMedia": "Skipped files unsupported by the selected model",
    "conversation.user": "User",
    "conversation.userInput": "User",
    "conversation.assistant": "Assistant",
    "conversation.modelResponse": "AI answer",
    "conversation.thoughts": "Thoughts",
    "conversation.showThoughts": "Show thoughts",
    "conversation.expandThoughts": "Expand to view model thoughts",
    "conversation.thoughtsWaiting": "Waiting for model thoughts.",
    "conversation.noThoughts": "No model thoughts received.",
    "conversation.waiting": "Waiting for a response.",
    "conversation.partial": "Partial response retained",
    "conversation.copy": "Copy",
    "conversation.copyAsText": "Copy as text",
    "conversation.copyAsMarkdown": "Copy as markdown",
    "conversation.delete": "Delete",
    "conversation.branchFromHere": "Branch from here",
    "conversation.moreActions": "More actions",
    "conversation.showFull": "Show full",
    "conversation.showLess": "Show less",
    "conversation.responseTruncated": "Long response is previewed to keep the page responsive.",
    "conversation.retry": "Retry",
    "conversation.streaming": "Streaming...",
    "conversation.updated": "Updated",
    "prompt.placeholder": "Ask the model to analyze, summarize, review, or rewrite the attached context...",
    "prompt.attach": "Attach file",
    "prompt.shortcut": "Ctrl/Command + Enter to run",
    "prompt.run": "Run",
    "prompt.running": "Running",
    "settings.title": "Run Settings",
    "settings.model": "Model",
    "settings.provider": "Provider",
    "settings.system": "System Instructions",
    "settings.systemPlaceholder": "You are an expert analyst for large context files...",
    "settings.reasoning": "Reasoning",
    "settings.modelVariant": "Model Variant",
    "settings.openCodeDefault": "OpenCode default",
    "settings.openCodeDefaultVariant": "This model supports reasoning through its OpenCode default behavior.",
    "settings.noModelVariants": "No model variants reported by OpenCode for this model.",
    "settings.reasoningHelp": "Reasoning controls are shown only when OpenCode reports model variants or reasoning support.",
    "settings.tools": "Tools",
    "settings.codeExecution": "Shell Tool",
    "settings.urlContext": "URL Fetch",
    "settings.catalogLoading": "Loading catalog",
    "settings.catalogReady": "Catalog ready",
    "settings.catalogFallback": "Fallback catalog",
    "settings.connected": "Connected",
    "settings.reasoningCapability": "Reasoning",
    "settings.inputModalities": "Input",
    "settings.modalityText": "Text",
    "settings.modalityImage": "Image",
    "settings.modalityAudio": "Audio",
    "settings.modalityVideo": "Video",
    "settings.modalityPdf": "PDF",
    "settings.noProviders": "No authenticated providers available",
    "settings.noModels": "No authenticated models available",
    "errors.authExpired": "OpenCode authentication expired. Run `opencode auth login` in a terminal, then retry.",
    "errors.gatewayRun": "Unable to run the playground.",
    "errors.unknownGateway": "Unknown gateway error",
    "errors.catalogUnavailable": "Unable to load the live model catalog.",
    "errors.inputRequired": "Add a prompt or attach context before running.",
    "common.yes": "Yes",
    "common.no": "No",
  },
  ko: {
    "language.en": "EN",
    "language.ko": "KO",
    "sidebar.history": "기록",
    "sidebar.newChat": "새 채팅",
    "sidebar.noRuns": "아직 실행 기록이 없습니다.",
    "sidebar.sessionTokens": "세션 토큰",
    "sidebar.provider": "공급사",
    "sidebar.connected": "연결됨",
    "sidebar.loading": "불러오는 중",
    "sidebar.fallback": "대체 모드",
    "history.completed": "완료된 실행",
    "history.failed": "실패한 실행",
    "history.running": "실행 중",
    "history.partial": "부분",
    "history.full": "전체",
    "main.tokens": "토큰",
    "main.contextWindow": "컨텍스트",
    "main.contextUnknown": "알 수 없음",
    "main.noModel": "선택된 모델 없음",
    "status.running": "실행 중",
    "status.error": "오류",
    "status.ready": "준비됨",
    "status.idle": "대기",
    "attachments.add": "컨텍스트 파일 추가",
    "attachments.preview": "미리보기",
    "attachments.remove": "제거",
    "attachments.close": "닫기",
    "attachments.empty": "[빈 파일]",
    "attachments.tokens": "토큰",
    "attachments.unsupportedMedia": "선택한 모델이 지원하지 않아 제외한 파일",
    "conversation.user": "유저",
    "conversation.userInput": "유저",
    "conversation.assistant": "어시스턴트",
    "conversation.modelResponse": "AI 답변",
    "conversation.thoughts": "생각",
    "conversation.showThoughts": "생각 보기",
    "conversation.expandThoughts": "모델 생각을 펼쳐서 보기",
    "conversation.thoughtsWaiting": "모델 생각을 기다리는 중입니다.",
    "conversation.noThoughts": "수신된 모델 생각이 없습니다.",
    "conversation.waiting": "응답을 기다리는 중입니다.",
    "conversation.partial": "부분 응답 보존됨",
    "conversation.copy": "복사",
    "conversation.copyAsText": "텍스트로 복사",
    "conversation.copyAsMarkdown": "Markdown으로 복사",
    "conversation.delete": "삭제",
    "conversation.branchFromHere": "여기서 분기",
    "conversation.moreActions": "더보기",
    "conversation.showFull": "전체 보기",
    "conversation.showLess": "줄여 보기",
    "conversation.responseTruncated": "화면 성능을 위해 긴 응답은 일부만 미리 표시합니다.",
    "conversation.retry": "다시 실행",
    "conversation.streaming": "스트리밍 중...",
    "conversation.updated": "업데이트됨",
    "prompt.placeholder": "첨부한 컨텍스트에 대해 분석, 요약, 검토, 작성, 정리를 요청하세요...",
    "prompt.attach": "파일 첨부",
    "prompt.shortcut": "Ctrl/Command + Enter로 실행",
    "prompt.run": "실행",
    "prompt.running": "실행 중",
    "settings.title": "실행 설정",
    "settings.model": "모델",
    "settings.provider": "공급사",
    "settings.system": "시스템 지시문",
    "settings.systemPlaceholder": "큰 컨텍스트 파일을 분석하는 전문가로 답변하세요...",
    "settings.reasoning": "추론",
    "settings.modelVariant": "모델 Variant",
    "settings.openCodeDefault": "OpenCode 기본값",
    "settings.openCodeDefaultVariant": "이 모델은 OpenCode 기본 동작으로 추론을 지원합니다.",
    "settings.noModelVariants": "OpenCode가 이 모델의 variant를 보고하지 않았습니다.",
    "settings.reasoningHelp": "추론 설정은 OpenCode가 모델 variant 또는 추론 지원을 보고할 때만 표시됩니다.",
    "settings.tools": "도구",
    "settings.codeExecution": "쉘 도구",
    "settings.urlContext": "URL 가져오기",
    "settings.catalogLoading": "카탈로그 불러오는 중",
    "settings.catalogReady": "카탈로그 준비됨",
    "settings.catalogFallback": "대체 카탈로그",
    "settings.connected": "연결",
    "settings.reasoningCapability": "추론 지원",
    "settings.inputModalities": "입력",
    "settings.modalityText": "텍스트",
    "settings.modalityImage": "이미지",
    "settings.modalityAudio": "오디오",
    "settings.modalityVideo": "비디오",
    "settings.modalityPdf": "PDF",
    "settings.noProviders": "인증된 공급사 없음",
    "settings.noModels": "인증된 모델 없음",
    "errors.authExpired": "OpenCode 인증이 만료되었습니다. 터미널에서 `opencode auth login`을 실행한 뒤 다시 시도하세요.",
    "errors.gatewayRun": "Playground를 실행할 수 없습니다.",
    "errors.unknownGateway": "알 수 없는 게이트웨이 오류",
    "errors.catalogUnavailable": "실제 모델 카탈로그를 불러올 수 없습니다.",
    "errors.inputRequired": "실행하려면 프롬프트를 입력하거나 컨텍스트를 첨부하세요.",
    "common.yes": "예",
    "common.no": "아니요",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function initialLanguage(): Language {
  const stored = localStorage.getItem("repovera-language");
  if (stored === "en" || stored === "ko") {
    return stored;
  }

  return navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);

  useEffect(() => {
    localStorage.setItem("repovera-language", language);
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key) => translations[language][key] ?? translations.en[key] ?? key,
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return value;
}
