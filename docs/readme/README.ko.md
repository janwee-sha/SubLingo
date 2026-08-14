# SubLingo

**IINA를 위한 실시간 이중 언어 자막 번역**

[![Release](https://img.shields.io/github/v/release/janwee-sha/SubLingo?label=release)](https://github.com/janwee-sha/SubLingo/releases)
[![IINA](https://img.shields.io/badge/IINA-1.4%2B-8c5cff)](https://iina.io/)
[![macOS](https://img.shields.io/badge/macOS-12%2B-000000)](https://www.apple.com/macos/)

[English](../../README.md) · [简体中文](README.zh-CN.md) · **한국어** · [日本語](README.ja.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [Français](README.fr.md)

---

SubLingo는 [IINA](https://iina.io/)에서 현재 선택한 외부 SRT 또는 ASS 자막을 번역해 보조 자막으로 표시합니다. 재생 위치에서 가까운 구간만 제한적으로 미리 살펴보고 묶음 단위로 번역하며, 번역이 늦어지거나 실패해도 원본 자막과 영상 재생은 계속됩니다.

## ✨ 주요 기능

- **실시간 이중 언어 자막:** 원본 자막은 주 자막으로 유지하고 번역문은 IINA의 보조 자막으로 표시합니다.
- **외부 SRT 및 ASS 지원:** IINA에서 선택한 읽기 가능한 외부 SRT 및 ASS/SSA 텍스트 자막을 지원합니다.
- **번역 서비스 선택:** OpenAI-compatible Chat Completions endpoint 또는 로컬/원격 Ollama 서버를 사용할 수 있습니다.
- **재생 우선 동작:** 번역 작업 때문에 영상이 일시 정지되거나 원본 자막이 숨겨지지 않습니다.
- **제한된 요청:** 재생 위치 주변의 자막만 번역하고 플레이어 창마다 동시 작업을 제한하며, 성공한 결과는 현재 영상 세션에만 캐시합니다.
- **여러 Profile:** 번역 서비스 Profile을 저장하고 테스트한 뒤, 자막 텍스트를 받을 정확한 endpoint를 명시적으로 선택할 수 있습니다.
- **프록시 제어:** Profile별로 macOS 프록시 설정을 사용하거나 직접 연결을 선택할 수 있습니다.

## ✅ 요구 사항

- macOS 12 이상
- IINA 1.4.0 이상
- 읽을 수 있는 외부 SRT 또는 ASS/SSA 텍스트 자막
- 다음 번역 서비스 중 하나:
  - OpenAI-compatible endpoint, Model ID, 그리고 서비스에서 요구하는 경우 API key
  - 호환 모델이 이미 설치된 Ollama 서버

SubLingo는 번역 모델을 다운로드하거나 실행하지 않습니다.

## 🚀 설치

1. [Releases](https://github.com/janwee-sha/SubLingo/releases) 페이지에서 최신 `SubLingo-X.Y.Z.iinaplgz` 패키지를 다운로드합니다.
2. 다운로드한 패키지를 IINA로 열고 요청되는 플러그인 권한을 승인합니다.
3. IINA를 다시 시작하고 **Settings → Plugins**에서 SubLingo가 활성화되어 있는지 확인합니다.
4. 영상을 재생하고 IINA 사이드바를 연 다음 **SubLingo** 탭을 선택합니다.

## 🌍 빠른 시작

1. 영상을 열고 외부 SRT 또는 ASS 자막을 주 자막으로 선택합니다.
2. **Languages**에서 모국어를 선택합니다. IINA가 자막 언어를 식별하지 못하면 직접 확인한 뒤 언어 설정을 저장합니다.
3. **Translation service**에서 OpenAI-compatible 또는 Ollama Profile을 만들고 정확한 Model ID를 입력합니다.
4. Profile을 저장하고 테스트한 다음 **Select**를 클릭합니다. Profile 선택은 화면에 표시된 endpoint로 재생 위치 주변의 자막 텍스트를 전송하도록 SubLingo에 명시적으로 허용하는 동작입니다.
5. **Translate**를 켭니다. 원본 자막은 주 자막으로 유지되고 번역된 cue는 보조 자막으로 표시됩니다.

Endpoint, 모델, API key 또는 네트워크 경로가 바뀌면 Profile을 다시 저장하고 번역 전에 다시 선택해야 합니다.

## ⚙️ 번역 서비스

### OpenAI-compatible

- 완전한 `/chat/completions` URL이 아니라 `https://example.com/v1`과 같은 API root를 입력합니다.
- SubLingo가 `/chat/completions`를 덧붙이고 최종 요청 URL을 사이드바에 미리 표시합니다.
- 서비스가 제공하는 정확한 모델 식별자를 입력합니다.
- Endpoint가 인증 없는 요청을 허용하는 경우에만 Bearer API key를 생략할 수 있습니다. 저장 후 key 입력란은 쓰기 전용이며 다시 표시되지 않습니다.
- 원격 endpoint는 HTTPS를 사용해야 합니다.

### Ollama

- 기본 서버 root는 `http://127.0.0.1:11434`입니다.
- `translategemma:12b` 또는 `qwen3:14b`처럼 설치된 모델의 정확한 tag를 입력합니다.
- Ollama Profile은 API 자격 증명을 저장하거나 사용하지 않습니다.
- 연결 테스트에서 서버, 설치된 tag, structured-output chat 지원 여부를 확인합니다.

어느 서비스를 사용하든 먼저 **Use macOS proxy settings**를 권장합니다. 구성된 시스템 프록시 때문에 서비스에 접근할 수 없을 때만 **Connect directly**를 선택하세요.

## 🔒 개인정보, 자격 증명 및 비용

- SubLingo는 명시적으로 선택한 Profile에만 재생 위치 주변의 자막 텍스트, 언어 방향, 불투명한 cue ID와 소량의 인접 문맥을 보냅니다. 영상이나 오디오 내용은 보내지 않습니다.
- OpenAI-compatible API key는 플러그인 전용 `credentials.json` 파일에 로컬 평문으로 저장됩니다. 디렉터리는 `0700`, 파일은 `0600` 권한을 사용합니다. Key는 IINA preferences, 로그, 진단, Sidebar 상태 또는 플러그인 패키지에 기록되지 않으며 저장 후 다시 표시되지 않습니다.
- 파일 권한은 다른 macOS 계정과 일반적인 우발적 접근으로부터 key를 보호하지만, 현재 macOS 사용자 권한으로 파일을 읽을 수 있는 프로세스로부터는 보호하지 못합니다.
- 번들 transport helper는 임시 `127.0.0.1` 포트에서만 수신하고 선택한 endpoint로만 원격 요청을 보냅니다. 교차 출처 redirect와 URL에 포함된 자격 증명은 거부됩니다.
- 번역 결과는 현재 영상 세션에만 캐시되며 영상 변경, 재생 종료 또는 창 닫기 시 삭제됩니다.
- 번역 Provider는 요청 비용을 청구하고 자체 데이터 및 콘텐츠 정책을 적용할 수 있습니다. 묶음 처리와 캐시는 호출 횟수를 줄이지만 최대 비용을 보장하지 않습니다.

## 📌 현재 지원 범위

SubLingo는 오디오 전사, 이미지 기반/내장 자막의 OCR 또는 추출, 전체 영상 사전 번역, 번역 내보내기, 클라우드 동기화, 영구 번역 캐시를 제공하지 않습니다.

## 🛠️ 문제 해결

- **Select a readable external SRT or ASS subtitle:** IINA에서 외부 텍스트 자막을 주 자막으로 선택하세요. 이미지 기반 및 내장 자막 track은 지원하지 않습니다.
- **Confirm the subtitle language:** `en-US`와 같은 BCP 47 언어 tag를 입력하고 언어 설정을 저장하세요.
- **Translation service unavailable:** Profile을 테스트하고 endpoint, 모델, API key, 네트워크 경로 또는 Ollama 프로세스를 확인하세요. 영상과 원본 자막은 계속 정상 재생됩니다.
- **Credential could not be saved:** 불완전한 개발 사본 대신 Release 패키지를 설치하고 플러그인 데이터 디렉터리가 쓰기 가능한지 확인한 뒤 IINA를 완전히 종료하고 다시 시작하세요.
- **번역된 보조 자막이 표시되지 않음:** Profile을 테스트하고 선택했는지, 원본 언어와 모국어가 다른지, **Translate**가 켜져 있는지 확인하세요. SubLingo가 자막을 불러온 뒤 IINA에서 보조 자막을 수동으로 변경하지 않았는지도 확인하세요.
- **프록시가 서비스를 차단함:** 먼저 기본 macOS 프록시 경로를 사용하세요. 프록시가 서비스를 거부하면 해당 Profile을 **Connect directly**로 바꾸고 저장한 뒤 다시 Select/Test하세요.

## 🧑‍💻 개발

빌드, 자동 검사, 패키징 및 IINA 승인 절차는 [개발 가이드](../engineering/development.md)를 참고하세요.
