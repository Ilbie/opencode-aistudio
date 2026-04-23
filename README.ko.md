# opencode-aistudio

OpenCode 기반 프로바이더를 위한 AI Studio 스타일 코드베이스 분석 플레이그라운드입니다.

## 왜 만들었나요?

코드 분석을 할 때 **Google AI Studio**와 **Repomix**를 조합해서 쓰는 경우가 많았습니다. 저장소를 Repomix로 하나의 큰 컨텍스트로 만들고, Google AI Studio에 넣은 뒤 구조 분석, 버그 탐색, 구현 방향 검토, 마이그레이션 계획 등을 요청하는 방식입니다.

이 흐름은 Google AI Studio에서는 편했지만, 다른 AI 제공자에서도 똑같이 하려고 하면 플레이그라운드가 불편했습니다. 모델 전환, 대용량 컨텍스트 첨부, 실행 기록 확인, reasoning 출력 분리 같은 작업이 매끄럽지 않았습니다.

그래서 같은 대용량 코드 분석 워크플로를 여러 제공자에서 더 편하게 쓰기 위해 **OpenCode 기반 로컬 플레이그라운드**로 opencode-aistudio를 만들었습니다.

## 주요 기능

- 대용량 코드 컨텍스트 분석 워크플로
- 파일 첨부 및 Repomix 결과 붙여넣기 지원
- OpenCode provider/model catalog 연동
- UI에서 모델과 프로바이더 선택
- 스트리밍 출력
- 최종 답변과 thoughts 분리 렌더링
- `.repovera-data/history.json` 기반 로컬 실행 기록
- 영어/한국어 UI 지원
- 루트 YAML 설정 파일과 인라인 주석 제공

## 요구 사항

- Node.js 20+
- npm
- 로컬 머신의 OpenCode 인증

OpenCode 인증이 만료되었다면 다음을 실행하세요.

```bash
opencode auth login
```

## 빠른 시작

```bash
git clone https://github.com/Ilbie/opencode-aistudio.git
cd opencode-aistudio
```

앱을 실행하세요. 실행 래퍼는 `node_modules`가 없으면 npm 의존성을 자동으로 설치합니다.

Linux/macOS:

```bash
./run.sh
```

Windows PowerShell:

```powershell
.\run.ps1
```

Windows Command Prompt:

```bat
run.cmd
```

기본 서버 주소는 [http://localhost:47831](http://localhost:47831)입니다. 포트는 [`opencode-aistudio.yml`](./opencode-aistudio.yml)에서 바꿀 수 있습니다.

## 설정

앱 설정은 루트의 [`opencode-aistudio.yml`](./opencode-aistudio.yml)에서 관리합니다.

이 파일에서 다음 항목을 조정할 수 있습니다.

- 웹 서버 포트와 요청 본문 크기
- SSE 스트리밍 텍스트 제한
- 로컬 히스토리 보관 개수와 저장 크기 제한
- 게이트웨이 타임아웃과 출력 보관 제한
- 관리형 OpenCode 런타임 경로, 포트 범위, 인증 파일 경로, 선택적 command fallback

YAML 값을 바꾼 뒤에는 실행 중인 dev/start 서버를 다시 시작하세요.

## 스크립트 모드

모든 OS의 실행 래퍼는 같은 모드를 받습니다.

```bash
./run.sh dev
./run.sh build
./run.sh preview
./run.sh lint
./run.sh start
```

Windows에서는 `.\run.ps1 <mode>` 또는 `run.cmd <mode>`를 사용하세요.

npm으로 직접 실행할 수도 있습니다. fresh clone에서 npm을 직접 쓴다면 의존성을 먼저 설치하세요.

```bash
npm install
npm run dev
npm run build
npm run preview
npm run lint
npm run clean
```

## 구조

```text
src/                                  React 플레이그라운드 UI
server/index.ts                       Express + Vite 서버, API 라우트, SSE 스트리밍
server/history-store.ts               로컬 실행 기록 저장
packages/gateway-opencode/src/        관리형 OpenCode 런타임과 스트리밍 게이트웨이
app-config.ts                         루트 YAML 설정 로더
opencode-aistudio.yml                 사용자가 수정하는 앱 설정 파일
```

서버 API:

- `GET /api/catalog`
- `GET /api/history`
- `GET /api/history/:runId`
- `DELETE /api/history/:runId`
- `POST /api/run`

## 제품 범위

opencode-aistudio는 자율 에이전트 인터페이스가 아닙니다. 핵심 목적은 다음 흐름을 빠르게 수행하는 것입니다.

1. 대용량 컨텍스트 업로드 또는 붙여넣기
2. 프로바이더와 모델 선택
3. 지원되는 실행 설정 조정
4. 프롬프트 실행
5. 최종 Markdown 답변과 thoughts를 분리해서 검토
6. 로컬 히스토리에서 이전 실행 다시 열기

## 언어

- [Main README](./README.md)
- [English](./README.en.md)
