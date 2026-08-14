<div align="center">

# SubLingo

**Real-time bilingual subtitle translation for IINA**

[![Release](https://img.shields.io/github/v/release/janwee-sha/SubLingo?label=release)](https://github.com/janwee-sha/SubLingo/releases)
[![IINA](https://img.shields.io/badge/IINA-1.4%2B-8c5cff)](https://iina.io/)
[![macOS](https://img.shields.io/badge/macOS-12%2B-000000)](https://www.apple.com/macos/)

**English** · [简体中文](docs/readme/README.zh-CN.md) · [한국어](docs/readme/README.ko.md) · [日本語](docs/readme/README.ja.md) · [Русский](docs/readme/README.ru.md) · [العربية](docs/readme/README.ar.md) · [Français](docs/readme/README.fr.md)

</div>

---

SubLingo translates the external SRT or ASS subtitle currently selected in [IINA](https://iina.io/) and displays the result as a second subtitle track. It looks only a short distance ahead of playback, translates in bounded batches, and keeps the original subtitle and video playing when a translation is delayed or fails.

## ✨ Features

- **Live bilingual subtitles:** Keep the original subtitle as the primary track and show translations as IINA's second subtitle.
- **External SRT and ASS support:** Works with readable external SRT and ASS/SSA text tracks selected in IINA.
- **Your choice of translation service:** Use an OpenAI-compatible Chat Completions endpoint or a local/remote Ollama server.
- **Playback-first behavior:** Translation work never pauses the video or hides the original subtitle.
- **Bounded requests:** SubLingo translates only nearby cues, limits concurrent work per player window, and caches successful results only for the current video session.
- **Multiple profiles:** Save translation service profiles, test them, and explicitly select the exact endpoint allowed to receive subtitle text.
- **Proxy control:** Use macOS proxy settings or opt into a direct connection for each profile.

## ✅ Requirements

- macOS 12 or later
- IINA 1.4.0 or later
- A readable external SRT or ASS/SSA subtitle track
- One of the following translation services:
  - An OpenAI-compatible endpoint, model ID, and an API key when required by the service
  - An Ollama server with a compatible model already installed

SubLingo does not download or start translation models.

## 🚀 Installation

Open IINA and go to **Settings → Plugins**. The plugin manager supports both installation methods below.

![IINA plugin manager showing Install from GitHub and Install Package](docs/readme/assets/plugin-manager.png)

### Install from GitHub (recommended)

1. Click **Install from GitHub…**.
2. Enter `janwee-sha/SubLingo` in the `user/repo` field, then confirm the installation.
3. Wait for SubLingo to appear in the installed plugins list.

Plugins installed from GitHub can be updated automatically by IINA.

### Install a downloaded package

1. Open the [Releases](https://github.com/janwee-sha/SubLingo/releases) page and download the latest `SubLingo-X.Y.Z.iinaplgz` package.
2. Return to **Settings → Plugins** and click **Install Package…**.
3. Select the downloaded `.iinaplgz` file and confirm the installation.

After either method, approve the requested plugin permissions if prompted, make sure the checkbox next to SubLingo is enabled, and restart IINA. Then play a video, open IINA's sidebar, and select the **SubLingo** tab.

## 🌍 Quick Start

1. Load a video and select an external SRT or ASS subtitle as the primary subtitle.
2. Under **Languages**, select your mother language. Confirm the subtitle language if IINA cannot identify it, then save the language settings.
3. Under **Translation service**, create an OpenAI-compatible or Ollama profile and enter the exact model ID.
4. Save and test the profile, then click **Select**. Selecting a profile explicitly authorizes SubLingo to send nearby subtitle text to the displayed endpoint.
5. Turn on **Translate**. The original subtitle remains primary; translated cues appear as the second subtitle.

If the endpoint, model, key, or network route changes, save the updated profile and select it again before translating.

## ⚙️ Translation Services

### OpenAI-compatible

- Enter the API root, for example `https://example.com/v1`, not a complete `/chat/completions` URL.
- SubLingo appends `/chat/completions` and previews the resulting request URL in the sidebar.
- Enter the exact model identifier exposed by your service.
- The bearer API key is optional only when the endpoint accepts unauthenticated requests. The field is write-only after saving.
- Remote endpoints must use HTTPS.

### Ollama

- The default server root is `http://127.0.0.1:11434`.
- Enter the exact installed model tag, such as `translategemma:12b` or `qwen3:14b`.
- Ollama profiles do not store or use an API credential.
- SubLingo checks the server, installed tags, and structured-output chat support during the connection test.

For either service, start with **Use macOS proxy settings**. Choose **Connect directly** only when a configured system proxy prevents access to that service.

## 🔒 Privacy, Credentials, and Cost

- SubLingo sends only nearby subtitle cue text, language direction, opaque cue identifiers, and limited neighboring context to the profile you explicitly select. It does not send video or audio content.
- OpenAI-compatible keys are stored as local plaintext in the plugin's private `credentials.json` file. Its directory uses mode `0700` and the file uses mode `0600`. The key is not written to IINA preferences, logs, diagnostics, the sidebar state, or the plugin package, and is not shown again after saving.
- File permissions protect the key from other macOS accounts and ordinary accidental access. They cannot protect it from a process that can already read files as your current macOS user.
- The bundled transport helper listens only on a temporary `127.0.0.1` port and sends remote requests only to the selected endpoint. Cross-origin redirects and credentials embedded in URLs are rejected.
- Translations are cached only for the current video session and are cleared when the video changes, playback ends, or the window closes.
- Your translation provider may charge for requests and apply its own data and content policies. Batching and caching reduce calls but do not guarantee a maximum cost.

## 📌 Current Scope

SubLingo does not perform audio transcription, OCR or extraction of image-based/embedded subtitles, whole-video pretranslation, translation export, cloud sync, or persistent translation caching.

## 🛠️ Troubleshooting

- **Select a readable external SRT or ASS subtitle:** Select an external text subtitle as IINA's primary subtitle. Image-based and embedded tracks are not supported.
- **Confirm the subtitle language:** Enter a BCP 47 language tag such as `en-US`, then save the language settings.
- **Translation service unavailable:** Test the profile and check its endpoint, model, key, network route, or Ollama process. Playback and the original subtitle continue normally.
- **Credential could not be saved:** Install the release package rather than using an incomplete development copy, make sure the plugin data directory is writable, and fully restart IINA.
- **No translated second subtitle:** Confirm that the profile is tested and selected, the source and mother languages differ, and **Translate** is enabled. Also make sure IINA has not manually switched the second subtitle after SubLingo loaded it.
- **A proxy blocks the service:** Try the default macOS proxy route first. If it rejects the service, switch that profile to **Connect directly**, save it, and select/test it again.

## 🧑‍💻 Development

Build instructions, automated checks, packaging, and IINA acceptance guidance are available in the [development guide](docs/engineering/development.md).
