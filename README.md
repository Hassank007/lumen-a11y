# Lumen: an on-device accessibility copilot for Chrome

Lumen is a Chrome extension that finds accessibility barriers on regular web pages and fixes some of them in your browser: images with no alt text, links that say "click here", and dense text that is hard to read. It runs **Gemini Nano on your device first** and falls back to Gemini in the cloud when Nano isn't available. You can also turn cloud AI off.

Built for the **#BuildHybridAI 2026** hackathon with **Firebase AI Logic** hybrid inference.

## Why

- 95.9% of the top one million home pages have detectable WCAG failures, and missing alt text and vague links are among the most common ([WebAIM Million 2026](https://webaim.org/projects/million/)).
- Screen reader users hear "image" or "link, click here" and have to guess.
- People with cognitive disabilities or low literacy, and people reading in a second language, can struggle with long, dense text.

Sending every page you read to a cloud model is a privacy problem, often on exactly the pages that matter most (health, banking, government). On-device AI helps with that, with the cloud as an optional fallback.

## What it does

Open the Lumen side panel on any page and press **Scan this page**.

| Feature | What happens |
|---|---|
| **Barriers, in plain words** | "This page has 6 barriers. Lumen can fix 5 of them for you below; 1 needs the site owner." Lumen runs **axe-core** (WCAG 2.2 A and AA) on the live page and checks again after every fix you apply, so the message updates as barriers go away. The numbers and rule names are in a collapsed section for site owners and developers. |
| **Tell the site owner** | Drafts a short, polite message listing the problems found, which you can edit, copy, or open in your email app (Lumen finds the site's contact email). Lumen's fixes only live in your browser, so this is how a page gets fixed for everyone. Nothing is sent by Lumen. |
| **Ask about this page** | Ask in plain words ("What is this page about?", "How do I contact them?") and get a short answer from the page's own content, and it is told to name the exact link or button, so you can look for it with your screen reader. |
| **Ask by voice** | Press the microphone, ask, press Stop. Where Chrome says Nano accepts audio, your voice is turned into text on the device (Prompt API audio input). That path has not been tested: Nano can't hear audio on the development laptop, so there Lumen uses Gemini in the cloud in hybrid mode. In "Only on my device" mode it never does. |
| **Read answers aloud** | Optional, off by default, for people who don't use a screen reader (low vision, dyslexia, cognitive disabilities). Uses only a voice installed on the computer, and stays silent if there is none. Screen reader users shouldn't need it: results also go to a live region. |
| **Alt text** | Lists images with no text alternative (and, separately, the images that are already fine). Lumen writes short alt text from the image itself. Press **Apply to page** to add it to the live page, where a screen reader can pick it up. |
| **Link text** | Finds links like "click here" and "read more", and links with no text at all, and suggests text that says where the link goes, from the link's surroundings. Applying it rewrites the visible link text, so the spoken name always matches what's on screen (WCAG 2.5.3, Label in Name). |
| **Plain language** | Rewrites the page's main text in short sentences and common words. The text streams in as it is written. |
| **Privacy switch** | "On my device first, cloud if needed" (hybrid) or "Only on my device" (no cloud AI: page content and questions are not sent to cloud AI). Lumen still contacts Google for its own settings (Remote Config) and App Check, and loads images from the page's site when it describes them. |
| **Where it ran** | Every AI answer shows a badge: **On device** or **Cloud** (or **Source not reported**), with the time taken. |

Lumen only changes the page in your own browser tab. It never edits the website itself.

## Who it's for

- **Blind and low-vision people who use a screen reader:** ask about any page (by keyboard or voice), get images described and links named, and tell the site owner what's broken.
- **People with cognitive or learning disabilities, low literacy, or reading in a second language:** the plain-language rewrite, with optional read-aloud.
- **Testers, developers and content authors:** the axe-core details and ready-made fixes.

## How the hybrid works

```ts
getGenerativeModel(ai, {
  mode: privacy === 'device-only' ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.PREFER_ON_DEVICE,
  onDeviceParams: { createOptions: { expectedInputs: [{ type: 'image' }] } }, // for alt text
  inCloudParams: { model: cloudModel },                                     // gemini-3.5-flash-lite by default
});
```

- **On device:** Chrome's built-in Gemini Nano (the Prompt API), including image input for alt text. No cost per call. (Working fully offline has not been tested.)
- **Cloud fallback:** Gemini through Firebase AI Logic, when Nano isn't available on the machine or hasn't downloaded yet.
- **`inferenceSource`** from each response drives the badge, so the user can see where the AI ran.
- **Voice:** Firebase AI Logic's on-device path accepts images (JPEG, PNG) but not audio yet, so voice questions call Chrome's Prompt API directly with audio input, and use Firebase AI Logic (`ONLY_IN_CLOUD`) for the cloud fallback. Recordings are converted to 16 kHz WAV, which both accept.

Firebase products used:

- **Firebase AI Logic:** hybrid inference (`firebase/ai`), with `generateContent` and `generateContentStream`.
- **App Check:** used with Firebase AI Logic. A Manifest V3 extension can't load reCAPTCHA's remote script, so development uses a registered debug token.
- **Remote Config:** the code reads the prompts and the cloud model name from Remote Config, with built-in defaults, so they could be changed without a new version.

## Accessibility of Lumen itself

An accessibility tool has to be accessible. The side panel:

- uses real headings, a labelled privacy fieldset and native buttons;
- announces scan results, applied fixes and finished rewrites through one polite live region, without stealing focus;
- moves focus to the results heading after a scan and to the plain-language result when it's ready,
- gives every repeated button a name that starts with its visible text ("Apply to page, image 2"), so voice-control users can say what they see (WCAG 2.5.3),
- passes axe-core with 0 violations (WCAG 2.2 A and AA), checked in Chromium on 23 Nov 2026 in light and dark, before and after a scan, and keeps the streaming progress line out of the live region so it doesn't chatter;
- is built from native controls. In the same check every control could be reached with Tab and had a visible focus style.

Not tested: NVDA, JAWS or other screen readers, and Chrome's real side panel (the checks opened the panel page in a tab). AI answers were not part of these checks.

The project is directed by a Section 508 Trusted Tester.

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

Two test pages with known problems are in `test-page/`. `demo.html` is a made-up small-business page with deliberate problems (axe-core finds 6 issues; after Lumen's fixes, 1 remains, a contrast problem only the site owner can fix):

```bash
python -m http.server 8765 --directory test-page
```

## Development

```bash
npm test          # Vitest: scanning, outline, barrier summary, owner message, audio, prompts, tidying, read-aloud voice (33 tests)
npm run typecheck
npm run dev       # rebuild on change
```

| Path | What it is |
|---|---|
| `src/lib/ai.ts` | Hybrid model setup, `generate` and `generateStream` |
| `src/lib/firebase.ts` | Firebase app, App Check, Remote Config |
| `src/lib/scan.ts` | Finds images without alt text, already-OK images and vague links; builds the page outline for questions |
| `src/lib/audit.ts` | Summarises axe-core results, writes the plain-words summary and the message to the site owner |
| `src/lib/audio.ts` | Converts voice recordings to 16 kHz WAV |
| `src/lib/prompts.ts` | Default prompts (overridable from Remote Config) |
| `src/lib/speech.ts` | Picks an installed voice for read-aloud; badge text |
| `src/lib/tidy.ts` | Trims model answers to usable alt text and link text |
| `src/content.ts` | Runs in the page: scan, highlight, apply fixes |
| `src/sidepanel/` | The side panel UI |

## Limits

- AI-written alt text is a starting point, not a replacement for an author who knows why an image is there. Lumen shows it before you apply it.
- Fixes apply to your tab only and are lost on reload.
- On-device mode depends on Chrome downloading Gemini Nano, which can take a while the first time.
- Speed varies. On the development laptop, on-device answers took 5.4 to 7.4 seconds once the model was loaded; one cold first answer took 42 seconds.

## Credits

By Hassan Ahmed, who directed and tested the project. Claude Code wrote the code, tests and docs (AI assistants are allowed by the hackathon rules).

## License

[Apache 2.0](LICENSE)
