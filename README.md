# Lumen: an on-device accessibility copilot for Chrome

Lumen is a Chrome extension that finds and fixes accessibility barriers on any web page: images with no alt text, links that say "click here", and dense text that is hard to read. It runs **Gemini Nano on your device first**, so page content stays on your computer, and falls back to Gemini in the cloud only when the device can't do the job. You choose which.

Built for the **#BuildHybridAI 2026** hackathon with **Firebase AI Logic** hybrid inference.

## Why

- 95.9% of the top one million home pages have detectable WCAG failures, and missing alt text and vague links are among the most common ([WebAIM Million 2026](https://webaim.org/projects/million/)).
- Screen reader users hear "image" or "link, click here" and have to guess.
- People with cognitive disabilities or low literacy, and people reading in a second language, struggle with long, dense text.

Sending every page you read to a cloud model is a privacy problem, often on exactly the pages that matter most (health, banking, government). On-device AI fixes that, with the cloud as a safety net.

## What it does

Open the Lumen side panel on any page and press **Scan this page**.

| Feature | What happens |
|---|---|
| **Alt text** | Lists images with no text alternative (and, separately, the images that are already fine). Lumen writes short alt text from the image itself. Press **Apply to page** to add it to the live page, so your screen reader reads it right away. |
| **Link text** | Finds links like "click here" and "read more", and links with no text at all, and suggests text that says where the link goes, from the link's surroundings. |
| **Plain language** | Rewrites the page's main text in short sentences and common words. The text streams in as it is written. |
| **Privacy switch** | "On my device first, cloud if needed" (hybrid) or "Only on my device" (nothing leaves the computer). |
| **Where it ran** | Every answer shows a badge: **On device** or **Cloud**, with the time taken. |

Lumen only changes the page in your own browser tab. It never edits the website itself.

## How the hybrid works

```ts
getGenerativeModel(ai, {
  mode: privacy === 'device-only' ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.PREFER_ON_DEVICE,
  onDeviceParams: { createOptions: { expectedInputs: [{ type: 'image' }] } }, // for alt text
  inCloudParams: { model: cloudModel },                                     // gemini-3.5-flash-lite by default
});
```

- **On device:** Chrome's built-in Gemini Nano (the Prompt API), including image input for alt text. Private, works offline, no cost per call.
- **Cloud fallback:** Gemini through Firebase AI Logic, when Nano isn't available on the machine or hasn't downloaded yet.
- **`inferenceSource`** from each response drives the On device / Cloud badge, so the user always knows where their data went.

Firebase products used:

- **Firebase AI Logic:** hybrid inference (`firebase/ai`), with `generateContent` and `generateContentStream`.
- **App Check:** protects the Gemini API from abuse. Firebase AI Logic requires it. A Manifest V3 extension can't load reCAPTCHA's remote script, so development uses a registered debug token.
- **Remote Config:** the prompts and the cloud model name can be tuned without shipping a new version.

## Accessibility of Lumen itself

An accessibility tool has to be accessible. The side panel:

- uses real headings, a labelled privacy fieldset and native buttons;
- announces scan results, applied fixes and finished rewrites through one polite live region, without stealing focus;
- moves focus to the results heading after a scan and to the plain-language result when it's ready, and keeps the streaming progress line out of the live region so it doesn't chatter;
- is built from native controls, so everything works with the keyboard alone, with visible focus.

The person who built it is a Section 508 Trusted Tester.

## Try it

**Requirements:** Chrome 138 or newer (desktop). For on-device mode, a computer that meets Chrome's [built-in AI hardware requirements](https://developer.chrome.com/docs/ai/get-started). Without it, Lumen uses the cloud.

```bash
npm install
cp .env.example .env.local   # fill in your Firebase web app config
npm run build
```

1. Create a Firebase project, add a web app, and enable **Firebase AI Logic** (Gemini Developer API).
2. Turn on **App Check** and register a debug token (Firebase console → App Check → Apps → Manage debug tokens). Put it in `VITE_APPCHECK_DEBUG_TOKEN`.
3. Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and pick the `dist` folder.
4. Click the Lumen icon to open the side panel, then **Scan this page**.

A test page with known problems is in `test-page/`:

```bash
python -m http.server 8765 --directory test-page
```

## Development

```bash
npm test          # Vitest: page scanning and answer tidying (18 tests)
npm run typecheck
npm run dev       # rebuild on change
```

| Path | What it is |
|---|---|
| `src/lib/ai.ts` | Hybrid model setup, `generate` and `generateStream` |
| `src/lib/firebase.ts` | Firebase app, App Check, Remote Config |
| `src/lib/scan.ts` | Finds images without alt text, already-OK images and vague links |
| `src/lib/prompts.ts` | Default prompts (overridable from Remote Config) |
| `src/lib/tidy.ts` | Trims model answers to usable alt text and link text |
| `src/content.ts` | Runs in the page: scan, highlight, apply fixes |
| `src/sidepanel/` | The side panel UI |

## Limits

- AI-written alt text is a starting point, not a replacement for an author who knows why an image is there. Lumen shows it before you apply it.
- Fixes apply to your tab only and are lost on reload.
- On-device mode depends on Chrome downloading Gemini Nano, which can take a while the first time.

## Credits

Built by Hassan Ahmed, with Claude Code as a coding assistant (AI assistants are allowed by the hackathon rules).

## License

[Apache 2.0](LICENSE)
