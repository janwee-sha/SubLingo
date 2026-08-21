<div align="center">

# SubLingo

**Real-time bilingual subtitle translation for IINA**

[![Release](https://img.shields.io/github/v/release/janwee-sha/SubLingo?label=release&style=for-the-badge)](https://github.com/janwee-sha/SubLingo/releases)
[![IINA](https://img.shields.io/badge/IINA-1.4%2B-8c5cff?style=for-the-badge)](https://iina.io/)
[![macOS](https://img.shields.io/badge/macOS-12%2B-000000?style=for-the-badge)](https://www.apple.com/macos/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=for-the-badge)](https://github.com/janwee-sha/SubLingo/blob/main/LICENSE)

**English** · [简体中文](docs/readme/README.zh-CN.md) · [한국어](docs/readme/README.ko.md) · [日本語](docs/readme/README.ja.md) · [Русский](docs/readme/README.ru.md) · [العربية](docs/readme/README.ar.md) · [Français](docs/readme/README.fr.md)

</div>

---

SubLingo translates the local embedded text subtitle or external SRT/ASS subtitle currently selected in [IINA](https://iina.io/) and renders the translation itself in an independent overlay. It looks only a short distance ahead of playback, translates in bounded batches, and keeps the original subtitle selection and video playing when a translation is delayed or fails.

## ✨ Features

- **Live bilingual subtitles:** Keep the original subtitle selected in IINA while SubLingo renders translations at the top center of the video without occupying another subtitle track.
- **Embedded and external text subtitles:** Works with local Matroska SubRip/ASS/SSA, local MOV/MP4 `mov_text`, and readable external SRT/ASS tracks selected in IINA. The release includes the required extractor; no external `ffmpeg` or `ffprobe` is needed.
- **Your choice of translation service:** Use an OpenAI Chat Completions-compatible endpoint or a local/remote Ollama server.
- **Playback-first behavior:** Translation work never pauses the video or hides the original subtitle.
- **Bounded requests:** SubLingo translates only nearby cues, limits concurrent work per player window, and caches successful results only for the current video session.
- **Multiple profiles:** Save translation service profiles, test them, and explicitly select the exact endpoint allowed to receive subtitle text.
- **Proxy control:** Use macOS proxy settings or opt into a direct connection for each profile.

## ✅ Requirements

- macOS 12 or later
- IINA 1.4.0 or later
- A supported local embedded text subtitle or readable external SRT/ASS/SSA track
- One of the following translation services:
  - An OpenAI endpoint, model ID, and an API key when required by the service
  - An Ollama server with a compatible model already installed and an API key when required

SubLingo does not download or start translation models.

## 🚀 Installation

Open IINA and go to **Settings → Plugins**. The plugin manager supports both installation methods below.

<div align="center">

![IINA plugin manager showing Install from GitHub and Install Package](docs/readme/assets/plugin-manager.webp)

</div>

### Install from GitHub (recommended)

1. Click **Install from GitHub…**.
2. Enter `janwee-sha/SubLingo` in the `user/repo` field, then confirm the installation.
3. Wait for SubLingo to appear in the installed plugins list.

Starting with SubLingo 0.3.3, IINA can check for and install later releases. Version 0.3.2 and earlier do not contain update metadata, so upgrade to 0.3.3 once by installing from GitHub or a downloaded package.

### Install a downloaded package

1. Open the [Releases](https://github.com/janwee-sha/SubLingo/releases) page and download the latest `SubLingo-X.Y.Z.iinaplgz` package.
2. Return to **Settings → Plugins** and click **Install Package…**.
3. Select the downloaded `.iinaplgz` file and confirm the installation.

After either method, approve the requested plugin permissions if prompted, make sure the checkbox next to SubLingo is enabled, and restart IINA. Then play a video, open IINA's sidebar, and select the **SubLingo** tab.

## 🌍 Quick Start

1. Load a local video and select a supported embedded text subtitle or external SRT/ASS subtitle as the primary subtitle in IINA.
2. Under **Languages**, select your mother language. Confirm the subtitle language if IINA cannot identify it, then save the language settings.
3. Under **Translation service**, create an OpenAI or Ollama profile. Refresh and select a model returned by the endpoint, or enter an exact custom Model ID.
4. Save and test the profile, then click **Select**. Selecting a profile explicitly authorizes SubLingo to send nearby subtitle text to the displayed endpoint.
5. Turn on **Translate**. The original subtitle remains selected in IINA; translated cues appear in SubLingo's top-center overlay.

If the endpoint, model, key, or network route changes, save the updated profile and select it again before translating.

## ⚙️ Translation Services

### OpenAI

- Enter the API root, for example `https://example.com/v1`, not a complete `/chat/completions` URL.
- SubLingo appends `/chat/completions` and previews the resulting request URL in the sidebar.
- Refresh the endpoint's model list and choose a returned identifier, or enter an exact custom Model ID.
- The bearer API key is optional only when the endpoint accepts unauthenticated requests. The field is write-only after saving.
- Remote endpoints must use HTTPS.

### Ollama

- The default server root is `http://127.0.0.1:11434`.
- Refresh the server's model list and choose a returned tag, or enter an exact custom Model ID.
- The bearer API key is optional when the Ollama server accepts unauthenticated requests. The field is write-only after saving.
- SubLingo checks the server, installed tags, and structured-output chat support during the connection test.

For either service, start with **Use macOS proxy settings**. Choose **Connect directly** only when a configured system proxy prevents access to that service.

## 🔒 Privacy, Credentials, and Cost

- SubLingo sends only nearby subtitle cue text, language direction, opaque cue identifiers, and limited neighboring context to the profile you explicitly select. It does not send video or audio content.
- OpenAI and Ollama keys are stored as local plaintext in the plugin's private `credentials.json` file. Its directory uses mode `0700` and the file uses mode `0600`. Keys are not written to IINA preferences, logs, diagnostics, the sidebar state, or the plugin package, and are not shown again after saving.
- File permissions protect the key from other macOS accounts and ordinary accidental access. They cannot protect it from a process that can already read files as your current macOS user.
- The bundled transport helper listens only on a temporary `127.0.0.1` port. A configured or currently edited endpoint may receive a subtitle-free model-list request before Select; only the explicitly selected profile receives nearby subtitle text for translation. Cross-origin redirects and credentials embedded in URLs are rejected.
- For embedded text subtitles, the bundled extractor reads only the selected stream from the current local media into a session-only temporary SRT. It does not support remote media or image-based subtitles, and removes temporary extraction data after parsing, cancellation, timeout, or shutdown.
- Translations are cached only for the current video session and are cleared when the video changes, playback ends, or the window closes.
- Your translation provider may charge for requests and apply its own data and content policies. Batching and caching reduce calls but do not guarantee a maximum cost.

## 📌 Current Scope

SubLingo does not perform audio transcription, OCR or extraction of image-based subtitles, embedded subtitle extraction from remote media, whole-video pretranslation, translation export, cloud sync, or persistent translation caching.

## 🛠️ Troubleshooting

- **Select a supported text subtitle:** Select a local embedded SubRip/ASS/SSA/`mov_text` track or an external SRT/ASS track as IINA's primary subtitle. Remote embedded and image-based tracks are not supported; use the displayed state to reselect a text track or retry a failed preparation.
- **Confirm the subtitle language:** Enter a BCP 47 language tag such as `en-US`, then save the language settings.
- **Translation service unavailable:** Test the profile and check its endpoint, model, key, network route, or Ollama process. Playback and the original subtitle continue normally.
- **Credential could not be saved:** Install the release package rather than using an incomplete development copy, make sure the plugin data directory is writable, and fully restart IINA.
- **No rendered translation:** Confirm that the profile is tested and selected, the source and mother languages differ, and **Translate** is enabled. Playback must also be within the time range of an available translated cue.
- **A proxy blocks the service:** Try the default macOS proxy route first. If it rejects the service, switch that profile to **Connect directly**, save it, and select/test it again.

## ☕ Support SubLingo

If SubLingo helps you, you can voluntarily buy its creator a coffee through [Afdian](https://www.ifdian.net/item/ea1ff37a97ed11f19a9f52540025c377?utm_source=copylink&utm_medium=link) or [Ko-fi](https://ko-fi.com/ianhsia).

SubLingo remains free and fully featured for everyone. Support does not unlock extra features, priority translation, or exclusive builds, and it does not include translation service API credits. Your selected provider may charge separately under its own terms and content policies.
